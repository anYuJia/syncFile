use crate::commands::{Device, RuntimeLogEntry};
use crate::discovery::device_registry::DeviceRegistry;
use crate::AppState;
use crate::storage::device_identity::DeviceIdentity;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

pub const SERVICE_TYPE: &str = "_syncfile._tcp.local.";
pub const MDNS_PROTOCOL_VERSION: &str = "1";
const BROWSER_REFRESH_SECS: u64 = 4;

pub struct MdnsService {
    registry: Arc<DeviceRegistry>,
    self_device_id: String,
    self_name: String,
    self_port: u16,
    self_platform: String,
    self_trust_fingerprint: String,
    self_trust_public_key: String,
    self_has_avatar: bool,
    self_profile_revision: u32,
    mdns: Option<ServiceDaemon>,
    shutdown_flag: Option<Arc<AtomicBool>>,
    app_handle: Option<AppHandle>,
}

impl MdnsService {
    pub fn new(
        registry: Arc<DeviceRegistry>,
        self_device_id: String,
        self_name: String,
        self_port: u16,
        self_platform: String,
        self_trust_fingerprint: String,
        self_trust_public_key: String,
        self_has_avatar: bool,
        self_profile_revision: u32,
    ) -> Self {
        Self {
            registry,
            self_device_id,
            self_name,
            self_port,
            self_platform,
            self_trust_fingerprint,
            self_trust_public_key,
            self_has_avatar,
            self_profile_revision,
            mdns: None,
            shutdown_flag: None,
            app_handle: None,
        }
    }

    pub fn start(
        &mut self,
        app_handle: AppHandle,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if self.mdns.is_some() {
            return Ok(());
        }

        self.app_handle = Some(app_handle.clone());
        let mdns = ServiceDaemon::new()?;

        let instance_name = format!(
            "{}-{}",
            sanitize_service_instance_name(&self.self_name),
            &self.self_device_id[..8]
        );
        let host_name = format!("syncfile-{}.local.", &self.self_device_id[..8]);

        let mut txt_properties = HashMap::new();
        txt_properties.insert("deviceId".to_string(), self.self_device_id.clone());
        txt_properties.insert("displayName".to_string(), self.self_name.clone());
        txt_properties.insert(
            "trustFingerprint".to_string(),
            self.self_trust_fingerprint.clone(),
        );
        txt_properties.insert(
            "trustPublicKey".to_string(),
            self.self_trust_public_key.clone(),
        );
        txt_properties.insert("platform".to_string(), self.self_platform.clone());
        txt_properties.insert("version".to_string(), MDNS_PROTOCOL_VERSION.to_string());
        txt_properties.insert(
            "hasAvatar".to_string(),
            if self.self_has_avatar { "1" } else { "0" }.to_string(),
        );
        txt_properties.insert(
            "profileRevision".to_string(),
            self.self_profile_revision.to_string(),
        );

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &host_name,
            "",
            self.self_port,
            txt_properties,
        )?
        .enable_addr_auto();

        mdns.register(service_info)?;
        append_runtime_log(
            &app_handle,
            "info",
            "discovery",
            "mDNS service published",
            Some(format!(
                "instance={} host={} port={}",
                instance_name, host_name, self.self_port
            )),
        );

        let receiver = mdns.browse(SERVICE_TYPE)?;
        let registry = self.registry.clone();
        let self_device_id = self.self_device_id.clone();
        let shutdown_flag = Arc::new(AtomicBool::new(false));
        let shutdown_flag_task = shutdown_flag.clone();
        append_runtime_log(
            &app_handle,
            "info",
            "discovery",
            "mDNS service started",
            Some(format!("type={} port={}", SERVICE_TYPE, self.self_port)),
        );
        append_runtime_log(
            &app_handle,
            "info",
            "discovery",
            "mDNS browser started",
            Some(SERVICE_TYPE.to_string()),
        );

        thread::spawn(move || {
            let mut resolved_devices = HashMap::<String, String>::new();
            loop {
                if shutdown_flag_task.load(Ordering::SeqCst) {
                    break;
                }

                match receiver.recv_timeout(std::time::Duration::from_secs(BROWSER_REFRESH_SECS)) {
                    Ok(ServiceEvent::ServiceResolved(info)) => {
                        let Some(device) = service_info_to_device(&info, &self_device_id) else {
                            continue;
                        };
                        resolved_devices
                            .insert(info.get_fullname().to_string(), device.device_id.clone());
                        let registry = registry.clone();
                        let app_handle = app_handle.clone();
                        let fullname = info.get_fullname().to_string();
                        tauri::async_runtime::spawn(async move {
                            registry.upsert(device.clone()).await;
                            let _ = app_handle.emit("device-online", device);
                            append_runtime_log(
                                &app_handle,
                                "info",
                                "discovery",
                                "device resolved",
                                Some(fullname),
                            );
                        });
                    }
                    Ok(ServiceEvent::ServiceRemoved(_, fullname)) => {
                        let Some(device_id) = resolved_devices.remove(&fullname) else {
                            continue;
                        };
                        let registry = registry.clone();
                        let app_handle = app_handle.clone();
                        tauri::async_runtime::spawn(async move {
                            registry.remove(&device_id, true).await;
                            let _ = app_handle.emit("device-offline", device_id.clone());
                            append_runtime_log(
                                &app_handle,
                                "info",
                                "discovery",
                                "device removed",
                                Some(fullname),
                            );
                        });
                    }
                    Ok(_) => {}
                    Err(_) => {}
                }
            }
        });

        self.shutdown_flag = Some(shutdown_flag);
        self.mdns = Some(mdns);
        Ok(())
    }

    pub async fn refresh(&mut self) {
        let Some(app_handle) = self.app_handle.clone() else {
            return;
        };
        append_runtime_log(&app_handle, "info", "discovery", "mDNS refresh requested", None);
        let _ = self.stop();
        let _ = self.start(app_handle);
    }

    pub async fn update_self(
        &mut self,
        identity: &DeviceIdentity,
    ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        self.self_name = identity.name.clone();
        self.self_trust_fingerprint = identity.trust_fingerprint.clone();
        self.self_trust_public_key = identity.trust_public_key.clone();
        self.self_has_avatar = identity.avatar_data_url.is_some();
        self.self_profile_revision = identity.profile_revision;
        self.refresh().await;
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(flag) = self.shutdown_flag.take() {
            flag.store(true, Ordering::SeqCst);
        }
        if let Some(mdns) = self.mdns.take() {
            mdns.shutdown()?;
        }
        Ok(())
    }
}

fn append_runtime_log(
    app_handle: &AppHandle,
    level: &str,
    scope: &str,
    message: &str,
    details: Option<String>,
) {
    let state = app_handle.state::<AppState>();
    let state = state.inner().clone();
    let app_handle = app_handle.clone();
    let level = level.to_string();
    let scope = scope.to_string();
    let message = message.to_string();
    tauri::async_runtime::spawn(async move {
        let entry = {
            let mut logs = state.runtime_logs.write().await;
            let sequence = logs.first().map(|entry| entry.sequence + 1).unwrap_or(1);
            let entry = RuntimeLogEntry {
                sequence,
                timestamp: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as u64,
                level,
                scope,
                message,
                details,
            };
            logs.insert(0, entry.clone());
            logs.truncate(500);
            entry
        };
        let _ = app_handle.emit("runtime-log", entry);
    });
}

fn service_info_to_device(info: &ServiceInfo, self_device_id: &str) -> Option<Device> {
    let properties = info.get_properties();
    let device_id = properties
        .get_property_val_str("deviceId")
        .filter(|id| *id != self_device_id)?;

    let addresses: Vec<String> = info
        .get_addresses()
        .iter()
        .map(|address| address.to_string())
        .collect();

    let host = info.get_hostname();
    let address = select_address(&addresses, host);

    Some(Device {
        device_id: device_id.to_string(),
        name: properties
            .get_property_val_str("displayName")
            .map(|value| value.to_string())
            .unwrap_or_else(|| host.to_string()),
        avatar_data_url: None,
        has_avatar: properties
            .get_property_val_str("hasAvatar")
            .map(|value| value == "1"),
        profile_revision: properties
            .get_property_val_str("profileRevision")
            .and_then(|value| value.parse().ok()),
        trust_fingerprint: properties
            .get_property_val_str("trustFingerprint")
            .map(|value| value.to_string())
            .unwrap_or_default(),
        trust_public_key: properties
            .get_property_val_str("trustPublicKey")
            .map(|value| value.to_string())
            .unwrap_or_default(),
        host: host.to_string(),
        address,
        port: info.get_port(),
        platform: properties
            .get_property_val_str("platform")
            .map(|value| value.to_string())
            .unwrap_or_else(|| "unknown".to_string()),
        version: properties
            .get_property_val_str("version")
            .map(|value| value.to_string())
            .unwrap_or_else(|| MDNS_PROTOCOL_VERSION.to_string()),
    })
}

fn sanitize_service_instance_name(name: &str) -> String {
    let trimmed = name.trim();
    let without_local = trimmed.trim_end_matches(".local");
    let normalized = without_local.replace('.', "-");
    let result = normalized.trim();
    if result.is_empty() {
        "syncfile".to_string()
    } else {
        result.to_string()
    }
}

fn select_address(addresses: &[String], host: &str) -> String {
    if addresses.is_empty() {
        return host.to_string();
    }

    let mut ranked: Vec<(String, i32)> = addresses
        .iter()
        .map(|addr| (addr.clone(), score_address(addr)))
        .collect();

    ranked.sort_by(|a, b| b.1.cmp(&a.1));
    ranked
        .into_iter()
        .next()
        .map(|(addr, _)| addr)
        .unwrap_or_else(|| host.to_string())
}

fn score_address(address: &str) -> i32 {
    if address.contains(':') {
        return 10;
    }
    if is_private_ipv4(address) {
        return 80;
    }
    70
}

fn is_private_ipv4(address: &str) -> bool {
    if address.starts_with("10.") {
        return true;
    }
    if address.starts_with("192.168.") {
        return true;
    }
    if let Some(rest) = address.strip_prefix("172.") {
        let octet: u8 = rest
            .split('.')
            .next()
            .and_then(|value| value.parse().ok())
            .unwrap_or(0);
        if (16..=31).contains(&octet) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::{sanitize_service_instance_name, select_address};

    #[test]
    fn sanitize_service_instance_name_strips_local_suffix_and_dots() {
        assert_eq!(
            sanitize_service_instance_name(" Mac.Book.local "),
            "Mac-Book"
        );
    }

    #[test]
    fn select_address_prefers_private_ipv4() {
        let addresses = vec![
            "fe80::1".to_string(),
            "203.0.113.10".to_string(),
            "192.168.1.88".to_string(),
        ];

        assert_eq!(
            select_address(&addresses, "host.local."),
            "192.168.1.88".to_string()
        );
    }
}
