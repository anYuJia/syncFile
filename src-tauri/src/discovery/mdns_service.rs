use crate::commands::Device;
use crate::discovery::device_registry::DeviceRegistry;
use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

pub const SERVICE_TYPE: &str = "_syncfile._tcp.local.";
pub const MDNS_PROTOCOL_VERSION: &str = "1";
const BROWSER_REFRESH_SECS: u64 = 4;
const DEVICE_STALE_SECS: u64 = 45;

pub struct MdnsService {
    registry: Arc<RwLock<DeviceRegistry>>,
    self_device_id: String,
    self_name: String,
    self_port: u16,
    self_platform: String,
    self_trust_fingerprint: String,
    self_has_avatar: bool,
    self_profile_revision: u32,
    mdns: Option<ServiceDaemon>,
}

impl MdnsService {
    pub fn new(
        registry: Arc<RwLock<DeviceRegistry>>,
        self_device_id: String,
        self_name: String,
        self_port: u16,
        self_platform: String,
        self_trust_fingerprint: String,
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
            self_has_avatar,
            self_profile_revision,
            mdns: None,
        }
    }

    pub fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let mdns = ServiceDaemon::new()?;

        let instance_name = format!(
            "{}-{}",
            sanitize_service_instance_name(&self.self_name),
            &self.self_device_id[..8]
        );

        let mut txt_properties = HashMap::new();
        txt_properties.insert("deviceId".to_string(), self.self_device_id.clone());
        txt_properties.insert("displayName".to_string(), self.self_name.clone());
        txt_properties.insert("trustFingerprint".to_string(), self.self_trust_fingerprint.clone());
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

        let service_type = "_syncfile._tcp".to_string();
        let host_ip = "0.0.0.0".to_string();

        let service_info = ServiceInfo::new(
            &format!("{}.{}", instance_name, service_type),
            &service_type,
            &format!("{}.local.", instance_name),
            &host_ip,
            self.self_port,
            txt_properties,
        )?;

        mdns.register(service_info)?;

        let receiver = mdns.browse("_syncfile._tcp")?;
        let registry = self.registry.clone();
        let self_device_id = self.self_device_id.clone();

        tokio::spawn(async move {
            loop {
                match receiver.recv_timeout(std::time::Duration::from_secs(BROWSER_REFRESH_SECS)) {
                    Ok(event) => match event {
                        ServiceEvent::ServiceResolved(info) => {
                            let properties = info.get_properties();
                            let device_id = properties
                                .get_property_val_str("deviceId")
                                .filter(|id| *id != self_device_id);

                            let device_id = match device_id {
                                Some(id) => id.to_string(),
                                _ => continue,
                            };

                            let addresses: Vec<String> = info
                                .get_addresses()
                                .iter()
                                .map(|a| a.to_string())
                                .collect();

                            let host = info.get_hostname();
                            let address = select_address(&addresses, host);

                            let device = Device {
                                device_id: device_id.clone(),
                                name: properties
                                    .get_property_val_str("displayName")
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| host.to_string()),
                                avatar_data_url: None,
                                has_avatar: properties
                                    .get_property_val_str("hasAvatar")
                                    .map(|v| v == "1"),
                                profile_revision: properties
                                    .get_property_val_str("profileRevision")
                                    .and_then(|v| v.parse().ok()),
                                trust_fingerprint: properties
                                    .get_property_val_str("trustFingerprint")
                                    .map(|s| s.to_string())
                                    .unwrap_or_default(),
                                trust_public_key: properties
                                    .get_property_val_str("trustPublicKey")
                                    .map(|s| s.to_string())
                                    .unwrap_or_default(),
                                host: host.to_string(),
                                address,
                                port: info.get_port(),
                                platform: properties
                                    .get_property_val_str("platform")
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| "unknown".to_string()),
                                version: properties
                                    .get_property_val_str("version")
                                    .map(|s| s.to_string())
                                    .unwrap_or_else(|| MDNS_PROTOCOL_VERSION.to_string()),
                            };

                            registry.read().await.upsert(device).await;
                        }
                        ServiceEvent::ServiceRemoved(_, full_name) => {
                            log::info!("Service removed: {}", full_name);
                        }
                        _ => {}
                    },
                    Err(_) => {
                        let now = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as u64;
                        let cutoff = now - (DEVICE_STALE_SECS * 1000);
                        let removed = registry.read().await.prune_older_than(cutoff).await;
                        if !removed.is_empty() {
                            log::warn!("Pruned stale devices: {:?}", removed);
                        }
                    }
                }
            }
        });

        self.mdns = Some(mdns);
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(mdns) = self.mdns.take() {
            mdns.shutdown()?;
        }
        Ok(())
    }
}

fn sanitize_service_instance_name(name: &str) -> String {
    let trimmed = name.trim();
    let without_local = trimmed.trim_end_matches(".local");
    let normalized = without_local.replace('.', "-").replace(' ', " ");
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
        let octet: u8 = rest.split('.').next().and_then(|s| s.parse().ok()).unwrap_or(0);
        if (16..=31).contains(&octet) {
            return true;
        }
    }
    false
}
