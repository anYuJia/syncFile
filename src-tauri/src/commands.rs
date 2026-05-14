//! Tauri IPC 命令实现
//! Tauri command handlers exposed to the React renderer.

use crate::discovery::device_registry::DeviceRegistry;
use crate::discovery::mdns_service::MdnsService;
use crate::storage::{
    device_identity::{self, DeviceIdentity},
    persistent::{self, PersistentSettings},
    sandbox::Sandbox,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Instant, UNIX_EPOCH};
use tauri::{command, AppHandle, Emitter, State};
use tokio::sync::{oneshot, Mutex, RwLock};
use uuid::Uuid;

// ============== 共享类型定义 ==============
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub device_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_avatar: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_revision: Option<u32>,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub host: String,
    pub address: String,
    pub port: u16,
    pub platform: String,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceReachability {
    pub device_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub checked_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingOffer {
    pub offer_id: String,
    pub file_id: String,
    pub file_name: String,
    pub file_size: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub from_device: Device,
    pub received_at: u64,
    pub save_directory: String,
    pub peer_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub request_id: String,
    pub from_device: Device,
    pub received_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferProgress {
    pub transfer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_label: Option<String>,
    pub direction: String,
    pub file_name: String,
    pub file_size: u64,
    pub bytes_transferred: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_device_id: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receive_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file_modified_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transfer_rate_bytes_per_second: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub estimated_seconds_remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRecord {
    pub transfer_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batch_label: Option<String>,
    pub direction: String,
    pub file_name: String,
    pub file_size: u64,
    pub bytes_transferred: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_device_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub peer_device_id: Option<String>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub receive_mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub local_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file_modified_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_file_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferId {
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrustedDevice {
    pub device_id: String,
    pub name: String,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub trusted_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub max_sandbox_size_mb: u64,
    pub auto_accept: bool,
    pub auto_accept_max_size_mb: u64,
    pub open_received_folder: bool,
    pub trusted_devices: Vec<TrustedDevice>,
    pub desktop_notifications: bool,
    pub sandbox_location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MaintenanceInfo {
    pub transfer_history_count: usize,
    pub resumable_transfer_count: usize,
    pub resumable_transfer_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub max_sandbox_size_mb: u64,
    pub auto_accept: bool,
    pub auto_accept_max_size_mb: u64,
    pub open_received_folder: bool,
    pub trusted_devices: Vec<TrustedDevice>,
    pub desktop_notifications: bool,
    pub sandbox_location: SandboxLocationInfo,
    pub maintenance: MaintenanceInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfilePayload {
    pub name: Option<String>,
    pub avatar_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerProfilePayload {
    pub device_id: String,
    pub name: String,
    pub avatar_data_url: Option<String>,
    pub has_avatar: bool,
    pub profile_revision: u32,
    pub trust_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeLogEntry {
    pub sequence: u64,
    pub timestamp: u64,
    pub level: String,
    pub scope: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxLocationInfo {
    pub path: String,
    pub is_custom: bool,
    pub usage_bytes: u64,
}

#[derive(Debug, Clone)]
pub enum OfferDecision {
    Accept { start_offset: u64 },
    Reject(String),
    Cancel(String),
}

#[derive(Debug)]
pub struct PendingOffer {
    pub offer: IncomingOffer,
    pub offer_id: String,
    pub responder: Option<oneshot::Sender<OfferDecision>>,
}

// ============== 应用状态 ==============
pub struct AppStateInner {
    pub device_registry: Arc<DeviceRegistry>,
    pub mdns_service: Arc<Mutex<MdnsService>>,
    pub identity: Arc<RwLock<DeviceIdentity>>,
    pub sandbox: Sandbox,
    pub settings: RwLock<Settings>,
    pub pending_offers: RwLock<Vec<PendingOffer>>,
    pub pending_pair_responses: RwLock<HashMap<String, oneshot::Sender<bool>>>,
    pub transfer_history: RwLock<Vec<TransferRecord>>,
    pub runtime_logs: RwLock<Vec<RuntimeLogEntry>>,
    pub pair_requests: RwLock<Vec<PairRequest>>,
    pub trusted_devices: RwLock<Vec<TrustedDevice>>,
    pub inbound_cancel_transfers: RwLock<HashSet<String>>,
    pub outbound_transfer_controls:
        RwLock<HashMap<String, Arc<crate::transfer::tcp::TransferControl>>>,
    pub data_dir: RwLock<PathBuf>,
    pub app_handle: AppHandle,
}

pub type AppState = Arc<AppStateInner>;

fn now_ms() -> u64 {
    use std::time::SystemTime;
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

async fn persist_transfer_record(
    state: &AppStateInner,
    record: TransferRecord,
) -> std::io::Result<()> {
    let history = {
        let mut history = state.transfer_history.write().await;
        history.retain(|item| item.transfer_id != record.transfer_id);
        history.insert(0, record);
        history.truncate(500);
        history.clone()
    };
    let data_dir = state.data_dir.read().await.clone();
    persistent::save_transfer_history(&data_dir, &history)
}

async fn persist_transfer_history(state: &AppStateInner) -> std::io::Result<()> {
    let history = state.transfer_history.read().await.clone();
    let data_dir = state.data_dir.read().await.clone();
    persistent::save_transfer_history(&data_dir, &history)
}

async fn emit_transfer_history_reset(state: &AppStateInner) {
    let history = state.transfer_history.read().await.clone();
    let _ = state.app_handle.emit("transfer-history-reset", history);
}

fn cancelled_progress_from_record(record: &TransferRecord, now: u64) -> TransferProgress {
    TransferProgress {
        transfer_id: record.transfer_id.clone(),
        batch_id: record.batch_id.clone(),
        batch_label: record.batch_label.clone(),
        direction: record.direction.clone(),
        file_name: record.file_name.clone(),
        file_size: record.file_size,
        bytes_transferred: record.bytes_transferred,
        peer_device_name: record.peer_device_name.clone(),
        peer_device_id: record.peer_device_id.clone(),
        status: "cancelled".to_string(),
        receive_mode: record.receive_mode.clone(),
        local_path: record.local_path.clone(),
        source_file_modified_at: record.source_file_modified_at,
        source_file_sha256: record.source_file_sha256.clone(),
        error: Some("Transfer cancelled.".to_string()),
        transfer_rate_bytes_per_second: None,
        estimated_seconds_remaining: None,
        updated_at: Some(now),
    }
}

fn cancelled_record_from_record(record: TransferRecord, now: u64) -> TransferRecord {
    TransferRecord {
        status: "cancelled".to_string(),
        error: Some("Transfer cancelled.".to_string()),
        updated_at: now,
        ..record
    }
}

async fn current_sandbox_location(state: &AppStateInner) -> Result<SandboxLocationInfo, String> {
    let path = state.sandbox.root_path();
    let path_str = path
        .to_str()
        .ok_or_else(|| "Invalid sandbox path".to_string())?
        .to_string();
    let settings = state.settings.read().await;

    Ok(SandboxLocationInfo {
        path: path_str,
        is_custom: settings.sandbox_location.is_some(),
        usage_bytes: state.sandbox.current_usage_bytes(),
    })
}

async fn current_maintenance_info(state: &AppStateInner) -> MaintenanceInfo {
    let transfer_history_count = state.transfer_history.read().await.len();
    let resume_entries = state.sandbox.list_resume_entries();
    MaintenanceInfo {
        transfer_history_count,
        resumable_transfer_count: resume_entries.len(),
        resumable_transfer_bytes: resume_entries
            .iter()
            .map(|entry| entry.bytes_received)
            .sum(),
    }
}

fn validate_sandbox_root(root_path: PathBuf) -> Result<PathBuf, String> {
    let resolved = root_path
        .canonicalize()
        .or_else(|_| {
            std::fs::create_dir_all(&root_path)?;
            root_path.canonicalize()
        })
        .map_err(|e| format!("Failed to prepare sandbox path: {}", e))?;

    if resolved == std::path::Path::new("/") {
        return Err("sandbox folder cannot be the filesystem root".to_string());
    }

    let metadata = std::fs::metadata(&resolved)
        .map_err(|e| format!("Failed to inspect sandbox path: {}", e))?;
    if !metadata.is_dir() {
        return Err("sandbox path must be a directory".to_string());
    }

    let probe = resolved.join(".syncfile-write-test");
    std::fs::write(&probe, b"syncfile").map_err(|e| format!("Sandbox is not writable: {}", e))?;
    let _ = std::fs::remove_file(probe);

    Ok(resolved)
}

fn collect_regular_files(root: &Path, files: &mut Vec<PathBuf>) -> std::io::Result<()> {
    for entry in std::fs::read_dir(root)? {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        let path = entry.path();

        if file_type.is_dir() {
            let _ = collect_regular_files(&path, files);
        } else if file_type.is_file() {
            files.push(path);
        }
    }

    Ok(())
}

fn transfer_live_metrics(
    bytes_transferred: u64,
    file_size: u64,
    started_at: Instant,
) -> (Option<u64>, Option<u64>) {
    if bytes_transferred == 0 {
        return (None, None);
    }

    let elapsed_seconds = started_at.elapsed().as_secs_f64();
    if elapsed_seconds <= 0.0 {
        return (None, None);
    }

    let rate = ((bytes_transferred as f64) / elapsed_seconds).round() as u64;
    if rate == 0 {
        return (None, None);
    }

    let eta = if bytes_transferred < file_size {
        Some((((file_size - bytes_transferred) as f64) / (rate as f64)).ceil() as u64)
    } else {
        None
    };

    (Some(rate), eta)
}

fn file_modified_ms(metadata: &std::fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn source_file_changed(
    record: &TransferRecord,
    file_size: u64,
    modified_at: Option<u64>,
    sha256: Option<&str>,
) -> bool {
    if record.file_size > 0 && record.file_size != file_size {
        return true;
    }

    if let (Some(recorded), Some(current)) = (record.source_file_modified_at, modified_at) {
        if recorded != current {
            return true;
        }
    }

    if let (Some(recorded), Some(current)) = (record.source_file_sha256.as_deref(), sha256) {
        if !recorded.eq_ignore_ascii_case(current) {
            return true;
        }
    }

    false
}

async fn persist_settings(state: &AppStateInner, settings: &Settings) -> Result<(), String> {
    let data_dir = state.data_dir.read().await.clone();
    persistent::save_settings(&data_dir, &PersistentSettings::from(settings.clone()))
        .map_err(|e| format!("Failed to save settings: {}", e))
}

async fn upsert_trusted_device(state: &AppStateInner, device: &Device) -> Result<(), String> {
    let updated = {
        let mut settings = state.settings.write().await;
        let trusted_device = TrustedDevice {
            device_id: device.device_id.clone(),
            name: device.name.clone(),
            trust_fingerprint: device.trust_fingerprint.clone(),
            trust_public_key: device.trust_public_key.clone(),
            trusted_at: now_ms(),
        };

        settings.trusted_devices.retain(|candidate| {
            !(candidate.device_id == trusted_device.device_id
                && candidate.trust_fingerprint == trusted_device.trust_fingerprint)
        });
        settings.trusted_devices.push(trusted_device);
        settings
            .trusted_devices
            .sort_by(|left, right| left.name.cmp(&right.name));
        settings.clone()
    };

    *state.trusted_devices.write().await = updated.trusted_devices.clone();
    persist_settings(state, &updated).await
}

async fn push_runtime_log(
    state: &AppStateInner,
    level: &str,
    scope: &str,
    message: &str,
    details: Option<String>,
) {
    let entry = {
        let mut logs = state.runtime_logs.write().await;
        let sequence = logs.first().map(|entry| entry.sequence + 1).unwrap_or(1);
        let entry = RuntimeLogEntry {
            sequence,
            timestamp: now_ms(),
            level: level.to_string(),
            scope: scope.to_string(),
            message: message.to_string(),
            details,
        };
        logs.insert(0, entry.clone());
        logs.truncate(500);
        entry
    };
    let _ = state.app_handle.emit("runtime-log", entry);
}

// ============== Devices ==============
#[command]
pub async fn get_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let devices = state.device_registry.list().await;
    Ok(filter_self_device(devices, &state).await)
}

#[command]
pub async fn refresh_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    state.mdns_service.lock().await.refresh().await;
    let devices = state.device_registry.list().await;
    Ok(filter_self_device(devices, &state).await)
}

#[command]
pub async fn get_self_device(state: State<'_, AppState>) -> Result<Device, String> {
    let identity = state.identity.read().await;
    Ok(Device {
        device_id: identity.device_id.clone(),
        name: identity.name.clone(),
        avatar_data_url: identity.avatar_data_url.clone(),
        has_avatar: identity.avatar_data_url.is_some().then_some(true),
        profile_revision: Some(identity.profile_revision),
        trust_fingerprint: identity.trust_fingerprint.clone(),
        trust_public_key: identity.trust_public_key.clone(),
        host: "localhost".to_string(),
        address: "127.0.0.1".to_string(),
        port: 43434,
        platform: std::env::consts::OS.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    })
}

async fn filter_self_device(devices: Vec<Device>, state: &AppState) -> Vec<Device> {
    let identity = state.identity.read().await;
    devices
        .into_iter()
        .filter(|device| {
            device.device_id != identity.device_id
                && device.trust_fingerprint != identity.trust_fingerprint
                && device.trust_public_key != identity.trust_public_key
        })
        .collect()
}

#[command]
pub async fn probe_device(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<DeviceReachability, String> {
    let device = {
        let devices = state.device_registry.list().await;
        devices
            .into_iter()
            .find(|candidate| candidate.device_id == device_id)
    };

    let Some(device) = device else {
        return Ok(DeviceReachability {
            device_id,
            status: "unknown".to_string(),
            error: Some("device not found".to_string()),
            checked_at: now_ms(),
        });
    };

    let identity = state.identity.read().await;
    let client =
        crate::transfer::tcp::TcpClient::new(crate::transfer::secure_channel::SecureIdentity {
            device_id: identity.device_id.clone(),
            name: identity.name.clone(),
            trust_fingerprint: identity.trust_fingerprint.clone(),
            trust_public_key: identity.trust_public_key.clone(),
            trust_private_key: identity.trust_private_key.clone(),
        });
    drop(identity);

    match client
        .probe_peer(&device.address, device.port, &device)
        .await
    {
        Ok(()) => Ok(DeviceReachability {
            device_id: device.device_id,
            status: "reachable".to_string(),
            error: None,
            checked_at: now_ms(),
        }),
        Err(error) => Ok(DeviceReachability {
            device_id: device.device_id,
            status: "unreachable".to_string(),
            error: Some(error.to_string()),
            checked_at: now_ms(),
        }),
    }
}

#[command]
pub async fn fetch_peer_profile(
    device_id: String,
    state: State<'_, AppState>,
) -> Result<Option<PeerProfilePayload>, String> {
    let device = {
        let devices = state.device_registry.list().await;
        devices
            .into_iter()
            .find(|candidate| candidate.device_id == device_id)
    };

    let Some(device) = device else {
        return Ok(None);
    };
    if device.has_avatar != Some(true) {
        return Ok(None);
    }

    let identity = state.identity.read().await;
    let client =
        crate::transfer::tcp::TcpClient::new(crate::transfer::secure_channel::SecureIdentity {
            device_id: identity.device_id.clone(),
            name: identity.name.clone(),
            trust_fingerprint: identity.trust_fingerprint.clone(),
            trust_public_key: identity.trust_public_key.clone(),
            trust_private_key: identity.trust_private_key.clone(),
        });
    drop(identity);

    let Some(profile) = client
        .fetch_peer_profile(&device.address, device.port, &device)
        .await
        .map_err(|e| format!("Failed to fetch peer profile: {}", e))?
    else {
        return Ok(None);
    };

    state
        .device_registry
        .upsert(Device {
            avatar_data_url: profile.avatar_data_url.clone(),
            name: profile.name.clone(),
            has_avatar: Some(profile.has_avatar),
            profile_revision: Some(profile.profile_revision),
            ..device.clone()
        })
        .await;

    Ok(Some(profile))
}

// ============== Pairing ==============
#[command]
pub async fn pair_device(
    device_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let device = {
        let devices = state.device_registry.list().await;
        devices
            .into_iter()
            .find(|candidate| candidate.device_id == device_id)
    }
    .ok_or_else(|| format!("device {} not found", device_id))?;

    let identity = state.identity.read().await;
    let client =
        crate::transfer::tcp::TcpClient::new(crate::transfer::secure_channel::SecureIdentity {
            device_id: identity.device_id.clone(),
            name: identity.name.clone(),
            trust_fingerprint: identity.trust_fingerprint.clone(),
            trust_public_key: identity.trust_public_key.clone(),
            trust_private_key: identity.trust_private_key.clone(),
        });
    drop(identity);

    let accepted = client
        .pair_with_peer(&device.address, device.port, device.clone())
        .await
        .map_err(|e| format!("Pair request failed: {}", e))?;
    if !accepted {
        return Err("peer declined pairing".to_string());
    }

    upsert_trusted_device(state.inner().as_ref(), &device).await?;
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "pairing",
        "pair request accepted",
        Some(format!("deviceId={}", device.device_id)),
    )
    .await;
    let _ = app_handle.emit("device-paired", device_id.clone());
    Ok(())
}

#[command]
pub async fn accept_pair_request(
    request_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let request = {
        let mut requests = state.pair_requests.write().await;
        let request = requests
            .iter()
            .find(|candidate| candidate.request_id == request_id)
            .cloned();
        requests.retain(|candidate| candidate.request_id != request_id);
        request
    }
    .ok_or_else(|| format!("pair request {} not found", request_id))?;

    if let Some(responder) = state
        .pending_pair_responses
        .write()
        .await
        .remove(&request_id)
    {
        let _ = responder.send(true);
    }
    upsert_trusted_device(state.inner().as_ref(), &request.from_device).await?;
    let _ = app_handle.emit("pair-request-accepted", request_id.clone());
    let _ = app_handle.emit("pair-request-removed", request_id);
    Ok(())
}

#[command]
pub async fn reject_pair_request(
    request_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut requests = state.pair_requests.write().await;
        requests.retain(|candidate| candidate.request_id != request_id);
    }
    if let Some(responder) = state
        .pending_pair_responses
        .write()
        .await
        .remove(&request_id)
    {
        let _ = responder.send(false);
    }
    let _ = app_handle.emit("pair-request-rejected", request_id.clone());
    let _ = app_handle.emit("pair-request-removed", request_id);
    Ok(())
}

// ============== Transfers ==============
#[command]
pub async fn get_transfer_history(
    state: State<'_, AppState>,
) -> Result<Vec<TransferRecord>, String> {
    let history = state.transfer_history.read().await;
    Ok(history.clone())
}

#[command]
pub async fn get_pending_offers(state: State<'_, AppState>) -> Result<Vec<IncomingOffer>, String> {
    let offers = state.pending_offers.read().await;
    Ok(offers.iter().map(|o| o.offer.clone()).collect())
}

#[command]
pub async fn send_file(
    device_id: String,
    file_path: String,
    existing_transfer_id: Option<String>,
    batch_meta: Option<serde_json::Value>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<TransferId, String> {
    let requested_transfer_id = existing_transfer_id.clone();
    let transfer_id = existing_transfer_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // 获取目标设备信息
    let devices = state.device_registry.list_all().await;
    let device = devices
        .iter()
        .find(|candidate| candidate.device_id == device_id)
        .cloned();

    let device = match device {
        Some(d) => d,
        None => {
            push_runtime_log(
                state.inner().as_ref(),
                "error",
                "transfer",
                "send preflight failed",
                Some(format!(
                    "transferId={} reason=device-not-found deviceId={} availableDevices={}",
                    transfer_id,
                    device_id,
                    devices
                        .iter()
                        .map(|device| format!(
                            "{}:{}:{}",
                            device.device_id, device.name, device.version
                        ))
                        .collect::<Vec<_>>()
                        .join(",")
                )),
            )
            .await;
            return Err(format!("Device not found: {}", device_id));
        }
    };

    let file_name = PathBuf::from(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // 获取文件大小
    let file_metadata = match tokio::fs::metadata(&file_path).await {
        Ok(meta) => meta,
        Err(e) => {
            push_runtime_log(
                state.inner().as_ref(),
                "error",
                "transfer",
                "send preflight failed",
                Some(format!(
                    "transferId={} reason=file-metadata file={} path={} peerDeviceId={} peerName={} peerVersion={} error={}",
                    transfer_id,
                    file_name,
                    file_path,
                    device.device_id,
                    device.name,
                    device.version,
                    e
                )),
            )
            .await;
            return Err(format!(
                "Failed to read file metadata for {}: {}",
                file_path, e
            ));
        }
    };
    let file_size = file_metadata.len();
    let file_modified_at = file_modified_ms(&file_metadata);

    let retry_record = if let Some(existing_transfer_id) = requested_transfer_id.as_ref() {
        let history = state.transfer_history.read().await;
        history
            .iter()
            .find(|record| record.transfer_id == *existing_transfer_id)
            .cloned()
    } else {
        None
    };

    if let Some(record) = retry_record.as_ref() {
        if source_file_changed(record, file_size, file_modified_at, None) {
            push_runtime_log(
                state.inner().as_ref(),
                "error",
                "transfer",
                "send preflight failed",
                Some(format!(
                    "transferId={} reason=source-file-changed file={} path={} peerDeviceId={} peerName={}",
                    transfer_id, file_name, file_path, device.device_id, device.name
                )),
            )
            .await;
            return Err("source file changed since the previous transfer attempt".to_string());
        }
    }

    // 创建 SecureIdentity
    let identity = state.identity.read().await;
    let self_device = crate::transfer::secure_channel::SecureIdentity {
        device_id: identity.device_id.clone(),
        name: identity.name.clone(),
        trust_fingerprint: identity.trust_fingerprint.clone(),
        trust_public_key: identity.trust_public_key.clone(),
        trust_private_key: identity.trust_private_key.clone(),
    };

    let transfer_id_clone = transfer_id.clone();
    let batch_id = batch_meta
        .as_ref()
        .and_then(|m| m.get("batchId"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let batch_label = batch_meta
        .as_ref()
        .and_then(|m| m.get("batchLabel"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let file_path_clone = file_path.clone();
    let device_clone = device.clone();
    let app_handle_clone = app_handle.clone();
    let file_name_clone = file_name.clone();
    let state_clone = state.inner().clone();
    let control = Arc::new(crate::transfer::tcp::TransferControl::default());
    state
        .outbound_transfer_controls
        .write()
        .await
        .insert(transfer_id.clone(), control.clone());

    // 在后台任务中执行传输
    tokio::spawn(async move {
        // 计算文件哈希
        let sha256 =
            match crate::transfer::file_hash::sha256_file(std::path::Path::new(&file_path_clone))
                .await
            {
                Ok(hash) => hash,
                Err(e) => {
                    let error = format!("Hash calculation failed: {}", e);
                    let now = now_ms();
                    let _ = app_handle_clone.emit(
                        "transfer-progress",
                        TransferProgress {
                            transfer_id: transfer_id_clone.clone(),
                            batch_id: batch_id.clone(),
                            batch_label: batch_label.clone(),
                            direction: "send".to_string(),
                            file_name: file_name_clone.clone(),
                            file_size,
                            bytes_transferred: 0,
                            peer_device_name: Some(device_clone.name.clone()),
                            peer_device_id: Some(device_clone.device_id.clone()),
                            status: "failed".to_string(),
                            receive_mode: None,
                            local_path: Some(file_path_clone.clone()),
                            source_file_modified_at: file_modified_at,
                            source_file_sha256: None,
                            error: Some(error.clone()),
                            transfer_rate_bytes_per_second: None,
                            estimated_seconds_remaining: None,
                            updated_at: Some(now),
                        },
                    );
                    let _ = persist_transfer_record(
                        state_clone.as_ref(),
                        TransferRecord {
                            transfer_id: transfer_id_clone.clone(),
                            batch_id: batch_id.clone(),
                            batch_label: batch_label.clone(),
                            direction: "send".to_string(),
                            file_name: file_name_clone.clone(),
                            file_size,
                            bytes_transferred: 0,
                            peer_device_name: Some(device_clone.name.clone()),
                            peer_device_id: Some(device_clone.device_id.clone()),
                            status: "failed".to_string(),
                            receive_mode: None,
                            local_path: Some(file_path_clone),
                            source_file_modified_at: file_modified_at,
                            source_file_sha256: None,
                            error: Some(error),
                            updated_at: now,
                        },
                    )
                    .await;
                    state_clone
                        .outbound_transfer_controls
                        .write()
                        .await
                        .remove(&transfer_id_clone);
                    return;
                }
            };

        if let Some(record) = retry_record.as_ref() {
            if source_file_changed(record, file_size, file_modified_at, Some(&sha256)) {
                let error = "source file changed since the previous transfer attempt".to_string();
                let now = now_ms();
                let failed_record = TransferRecord {
                    status: "failed".to_string(),
                    error: Some(error.clone()),
                    updated_at: now,
                    ..record.clone()
                };
                let _ = app_handle_clone.emit(
                    "transfer-progress",
                    TransferProgress {
                        transfer_id: failed_record.transfer_id.clone(),
                        batch_id: failed_record.batch_id.clone(),
                        batch_label: failed_record.batch_label.clone(),
                        direction: failed_record.direction.clone(),
                        file_name: failed_record.file_name.clone(),
                        file_size: failed_record.file_size,
                        bytes_transferred: failed_record.bytes_transferred,
                        peer_device_name: failed_record.peer_device_name.clone(),
                        peer_device_id: failed_record.peer_device_id.clone(),
                        status: failed_record.status.clone(),
                        receive_mode: failed_record.receive_mode.clone(),
                        local_path: failed_record.local_path.clone(),
                        source_file_modified_at: failed_record.source_file_modified_at,
                        source_file_sha256: failed_record.source_file_sha256.clone(),
                        error: failed_record.error.clone(),
                        transfer_rate_bytes_per_second: None,
                        estimated_seconds_remaining: None,
                        updated_at: Some(now),
                    },
                );
                let _ = persist_transfer_record(state_clone.as_ref(), failed_record).await;
                state_clone
                    .outbound_transfer_controls
                    .write()
                    .await
                    .remove(&transfer_id_clone);
                return;
            }
        }

        let client = crate::transfer::tcp::TcpClient::new(self_device);
        let sent_bytes = Arc::new(AtomicU64::new(0));
        let transfer_started_at = Instant::now();
        let progress_sent_bytes = sent_bytes.clone();
        let progress_app_handle = app_handle_clone.clone();
        let progress_transfer_id = transfer_id_clone.clone();
        let progress_batch_id = batch_id.clone();
        let progress_batch_label = batch_label.clone();
        let progress_file_name = file_name_clone.clone();
        let progress_device_name = device_clone.name.clone();
        let progress_device_id = device_clone.device_id.clone();
        let progress_file_path = file_path_clone.clone();
        let progress_sha256 = sha256.clone();
        let progress_callback: crate::transfer::tcp::SendProgressCallback =
            Arc::new(move |bytes_sent| {
                progress_sent_bytes.store(bytes_sent, Ordering::SeqCst);
                let (rate, eta) = transfer_live_metrics(bytes_sent, file_size, transfer_started_at);
                let _ = progress_app_handle.emit(
                    "transfer-progress",
                    TransferProgress {
                        transfer_id: progress_transfer_id.clone(),
                        batch_id: progress_batch_id.clone(),
                        batch_label: progress_batch_label.clone(),
                        direction: "send".to_string(),
                        file_name: progress_file_name.clone(),
                        file_size,
                        bytes_transferred: bytes_sent,
                        peer_device_name: Some(progress_device_name.clone()),
                        peer_device_id: Some(progress_device_id.clone()),
                        status: "in-progress".to_string(),
                        receive_mode: None,
                        local_path: Some(progress_file_path.clone()),
                        source_file_modified_at: file_modified_at,
                        source_file_sha256: Some(progress_sha256.clone()),
                        error: None,
                        transfer_rate_bytes_per_second: rate,
                        estimated_seconds_remaining: eta,
                        updated_at: Some(now_ms()),
                    },
                );
            });

        let result = client
            .send_file(crate::transfer::tcp::SendFileRequest {
                host: device_clone.address.clone(),
                port: device_clone.port,
                device: device_clone.clone(),
                file_path: file_path_clone.clone().into(),
                file_id: Some(transfer_id_clone.clone()),
                sha256: sha256.clone(),
                control: Some(control.clone()),
                progress: Some(progress_callback),
            })
            .await;

        match result {
            Ok(file_id) => {
                let now = now_ms();
                let (rate, eta) = transfer_live_metrics(file_size, file_size, transfer_started_at);
                let completed_progress = TransferProgress {
                    transfer_id: file_id.clone(),
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone.clone(),
                    file_size,
                    bytes_transferred: file_size,
                    peer_device_name: Some(device_clone.name.clone()),
                    peer_device_id: Some(device_clone.device_id.clone()),
                    status: "completed".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone.clone()),
                    source_file_modified_at: file_modified_at,
                    source_file_sha256: Some(sha256.clone()),
                    error: None,
                    transfer_rate_bytes_per_second: rate,
                    estimated_seconds_remaining: eta,
                    updated_at: Some(now),
                };
                let _ = app_handle_clone.emit("transfer-progress", completed_progress.clone());
                let _ = app_handle_clone.emit("transfer-complete", completed_progress);
                let _ = persist_transfer_record(
                    state_clone.as_ref(),
                    TransferRecord {
                        transfer_id: file_id,
                        batch_id: batch_id.clone(),
                        batch_label: batch_label.clone(),
                        direction: "send".to_string(),
                        file_name: file_name_clone.clone(),
                        file_size,
                        bytes_transferred: file_size,
                        peer_device_name: Some(device_clone.name.clone()),
                        peer_device_id: Some(device_clone.device_id.clone()),
                        status: "completed".to_string(),
                        receive_mode: None,
                        local_path: Some(file_path_clone),
                        source_file_modified_at: file_modified_at,
                        source_file_sha256: Some(sha256),
                        error: None,
                        updated_at: now,
                    },
                )
                .await;
            }
            Err(e) => {
                let (status, error) = match e.kind() {
                    std::io::ErrorKind::Interrupted => (
                        "paused".to_string(),
                        "Transfer paused. Retry to continue.".to_string(),
                    ),
                    std::io::ErrorKind::ConnectionAborted => {
                        ("cancelled".to_string(), "Transfer cancelled.".to_string())
                    }
                    _ => ("failed".to_string(), format!("Transfer failed: {}", e)),
                };
                push_runtime_log(
                    state_clone.as_ref(),
                    "error",
                    "transfer",
                    "send transfer failed",
                    Some(format!(
                        "transferId={} file={} peerDeviceId={} peerName={} peerVersion={} error={}",
                        transfer_id_clone,
                        file_name_clone,
                        device_clone.device_id,
                        device_clone.name,
                        device_clone.version,
                        error
                    )),
                )
                .await;
                let now = now_ms();
                let bytes_transferred = sent_bytes.load(Ordering::SeqCst);
                let (rate, eta) =
                    transfer_live_metrics(bytes_transferred, file_size, transfer_started_at);
                let _ = app_handle_clone.emit(
                    "transfer-progress",
                    TransferProgress {
                        transfer_id: transfer_id_clone.clone(),
                        batch_id: batch_id.clone(),
                        batch_label: batch_label.clone(),
                        direction: "send".to_string(),
                        file_name: file_name_clone.clone(),
                        file_size,
                        bytes_transferred,
                        peer_device_name: Some(device_clone.name.clone()),
                        peer_device_id: Some(device_clone.device_id.clone()),
                        status: status.clone(),
                        receive_mode: None,
                        local_path: Some(file_path_clone.clone()),
                        source_file_modified_at: file_modified_at,
                        source_file_sha256: Some(sha256.clone()),
                        error: Some(error.clone()),
                        transfer_rate_bytes_per_second: rate,
                        estimated_seconds_remaining: eta,
                        updated_at: Some(now),
                    },
                );
                let _ = persist_transfer_record(
                    state_clone.as_ref(),
                    TransferRecord {
                        transfer_id: transfer_id_clone.clone(),
                        batch_id: batch_id.clone(),
                        batch_label: batch_label.clone(),
                        direction: "send".to_string(),
                        file_name: file_name_clone,
                        file_size,
                        bytes_transferred,
                        peer_device_name: Some(device_clone.name),
                        peer_device_id: Some(device_clone.device_id),
                        status,
                        receive_mode: None,
                        local_path: Some(file_path_clone),
                        source_file_modified_at: file_modified_at,
                        source_file_sha256: Some(sha256),
                        error: Some(error),
                        updated_at: now,
                    },
                )
                .await;
            }
        }
        state_clone
            .outbound_transfer_controls
            .write()
            .await
            .remove(&transfer_id_clone);
    });

    // Emit pending progress event for UI
    let _ = app_handle.emit(
        "transfer-progress",
        TransferProgress {
            transfer_id: transfer_id.clone(),
            batch_id: batch_meta
                .as_ref()
                .and_then(|m| m.get("batchId"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            batch_label: batch_meta
                .as_ref()
                .and_then(|m| m.get("batchLabel"))
                .and_then(|v| v.as_str())
                .map(|s| s.to_string()),
            direction: "send".to_string(),
            file_name: file_name.clone(),
            file_size,
            bytes_transferred: 0,
            peer_device_name: Some(device.name.clone()),
            peer_device_id: Some(device_id),
            status: "pending".to_string(),
            receive_mode: None,
            local_path: Some(file_path),
            source_file_modified_at: file_modified_at,
            source_file_sha256: None,
            error: None,
            transfer_rate_bytes_per_second: None,
            estimated_seconds_remaining: None,
            updated_at: Some(now_ms()),
        },
    );

    Ok(TransferId { value: transfer_id })
}

#[command]
pub async fn pause_transfer(
    transfer_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let controls = state.outbound_transfer_controls.read().await;
    let control = controls
        .get(&transfer_id)
        .ok_or_else(|| format!("transfer {} not found", transfer_id))?;
    control.request_pause();
    let _ = app_handle.emit("transfer-paused", transfer_id);
    Ok(())
}

#[command]
pub async fn cancel_transfer(
    transfer_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some(control) = state
        .outbound_transfer_controls
        .read()
        .await
        .get(&transfer_id)
    {
        control.request_cancel();
        let _ = app_handle.emit("transfer-cancelled", transfer_id);
        return Ok(());
    }

    let paused_send_record = {
        let history = state.transfer_history.read().await;
        history
            .iter()
            .find(|record| {
                record.transfer_id == transfer_id
                    && record.direction == "send"
                    && record.status == "paused"
            })
            .cloned()
    };

    if let Some(record) = paused_send_record {
        let now = now_ms();
        let progress = cancelled_progress_from_record(&record, now);
        let _ = app_handle.emit("transfer-progress", progress);
        let _ = persist_transfer_record(
            state.inner().as_ref(),
            cancelled_record_from_record(record, now),
        )
        .await
        .map_err(|e| format!("Failed to update transfer history: {}", e))?;
        let _ = app_handle.emit("transfer-cancelled", transfer_id);
    } else {
        state
            .inbound_cancel_transfers
            .write()
            .await
            .insert(transfer_id.clone());
        let _ = app_handle.emit("transfer-cancelled", transfer_id);
    }
    Ok(())
}

#[command]
pub async fn accept_incoming(
    offer_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let removed_offer = {
        let mut offers = state.pending_offers.write().await;
        let Some(pos) = offers.iter().position(|offer| offer.offer_id == offer_id) else {
            return Err(format!("offer {} not found", offer_id));
        };
        offers.remove(pos)
    };
    if let Some(responder) = removed_offer.responder {
        let _ = responder.send(OfferDecision::Accept { start_offset: 0 });
    }
    let _ = app_handle.emit(
        "transfer-progress",
        TransferProgress {
            transfer_id: removed_offer.offer.offer_id.clone(),
            batch_id: None,
            batch_label: None,
            direction: "receive".to_string(),
            file_name: removed_offer.offer.file_name.clone(),
            file_size: removed_offer.offer.file_size,
            bytes_transferred: 0,
            peer_device_name: Some(removed_offer.offer.from_device.name.clone()),
            peer_device_id: Some(removed_offer.offer.from_device.device_id.clone()),
            status: "pending".to_string(),
            receive_mode: Some("manual".to_string()),
            local_path: None,
            source_file_modified_at: None,
            source_file_sha256: removed_offer.offer.sha256.clone(),
            error: None,
            transfer_rate_bytes_per_second: None,
            estimated_seconds_remaining: None,
            updated_at: Some(now_ms()),
        },
    );
    let _ = app_handle.emit("incoming-offer-accepted", offer_id);
    Ok(())
}

#[command]
pub async fn reject_incoming(
    offer_id: String,
    reason: Option<String>,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let removed_offer = {
        let mut offers = state.pending_offers.write().await;
        let Some(pos) = offers.iter().position(|o| o.offer_id == offer_id) else {
            return Err(format!("offer {} not found", offer_id));
        };
        offers.remove(pos)
    };

    let now = now_ms();
    let reject_reason = reason.clone().unwrap_or_else(|| "rejected".to_string());
    if let Some(responder) = removed_offer.responder {
        let _ = responder.send(OfferDecision::Reject(reject_reason.clone()));
    }
    let _ = persist_transfer_record(
        state.inner().as_ref(),
        TransferRecord {
            transfer_id: removed_offer.offer.offer_id.clone(),
            batch_id: None,
            batch_label: None,
            direction: "receive".to_string(),
            file_name: removed_offer.offer.file_name.clone(),
            file_size: removed_offer.offer.file_size,
            bytes_transferred: 0,
            peer_device_name: Some(removed_offer.offer.from_device.name.clone()),
            peer_device_id: Some(removed_offer.offer.from_device.device_id.clone()),
            status: "rejected".to_string(),
            receive_mode: Some("manual".to_string()),
            local_path: None,
            source_file_modified_at: None,
            source_file_sha256: removed_offer.offer.sha256.clone(),
            error: Some(reject_reason.clone()),
            updated_at: now,
        },
    )
    .await;
    let _ = app_handle.emit(
        "transfer-progress",
        TransferProgress {
            transfer_id: removed_offer.offer.offer_id.clone(),
            batch_id: None,
            batch_label: None,
            direction: "receive".to_string(),
            file_name: removed_offer.offer.file_name.clone(),
            file_size: removed_offer.offer.file_size,
            bytes_transferred: 0,
            peer_device_name: Some(removed_offer.offer.from_device.name.clone()),
            peer_device_id: Some(removed_offer.offer.from_device.device_id.clone()),
            status: "rejected".to_string(),
            receive_mode: Some("manual".to_string()),
            local_path: None,
            source_file_modified_at: None,
            source_file_sha256: removed_offer.offer.sha256.clone(),
            error: Some(reject_reason.clone()),
            transfer_rate_bytes_per_second: None,
            estimated_seconds_remaining: None,
            updated_at: Some(now),
        },
    );
    let _ = app_handle.emit(
        "incoming-offer-rejected",
        serde_json::json!({
            "offer_id": offer_id,
            "reason": reason
        }),
    );
    Ok(())
}

#[command]
pub async fn clear_transfer_history(state: State<'_, AppState>) -> Result<(), String> {
    state
        .transfer_history
        .write()
        .await
        .retain(|record| matches!(record.status.as_str(), "pending" | "in-progress" | "paused"));
    persist_transfer_history(state.inner().as_ref())
        .await
        .map_err(|e| format!("Failed to clear transfer history: {}", e))?;
    emit_transfer_history_reset(state.inner().as_ref()).await;
    Ok(())
}

#[command]
pub async fn remove_transfer_history_items(
    transfer_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state.transfer_history.write().await.retain(|record| {
        !transfer_ids.contains(&record.transfer_id)
            || matches!(record.status.as_str(), "pending" | "in-progress" | "paused")
    });
    persist_transfer_history(state.inner().as_ref())
        .await
        .map_err(|e| format!("Failed to update transfer history: {}", e))?;
    emit_transfer_history_reset(state.inner().as_ref()).await;
    Ok(())
}

// ============== Filesystem ==============
#[command]
pub async fn open_sandbox(state: State<'_, AppState>) -> Result<(), String> {
    let sandbox_path = state.sandbox.root_path();
    let path = sandbox_path
        .to_str()
        .ok_or_else(|| "Invalid sandbox path".to_string())?;

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(path).status();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(path).status();
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(path).status();

    result.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn open_transfer_path(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(&path).status();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(&path).status();
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(&path).status();

    result.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn reveal_transfer_path(path: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    let parent = path_buf.parent().unwrap_or(&path_buf);

    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(parent).status();
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("explorer").arg(parent).status();
    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(parent).status();

    result.map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub async fn get_sandbox_location(
    state: State<'_, AppState>,
) -> Result<SandboxLocationInfo, String> {
    current_sandbox_location(state.inner().as_ref()).await
}

#[command]
pub async fn choose_sandbox_location(
    state: State<'_, AppState>,
) -> Result<Option<SandboxLocationInfo>, String> {
    let Some(selected) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    let root_path = validate_sandbox_root(selected)?;
    state.sandbox.set_root(root_path.clone());
    let updated_settings = {
        let mut settings = state.settings.write().await;
        settings.sandbox_location = Some(root_path.to_string_lossy().to_string());
        settings.clone()
    };
    persist_settings(state.inner().as_ref(), &updated_settings).await?;
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "sandbox",
        "sandbox location updated",
        Some(root_path.to_string_lossy().to_string()),
    )
    .await;
    Ok(Some(
        current_sandbox_location(state.inner().as_ref()).await?,
    ))
}

#[command]
pub async fn clear_resume_cache(state: State<'_, AppState>) -> Result<(), String> {
    let cleared_ids = state.sandbox.clear_resume_cache(&HashSet::new());
    if !cleared_ids.is_empty() {
        state
            .transfer_history
            .write()
            .await
            .retain(|record| !cleared_ids.contains(&record.transfer_id));
        persist_transfer_history(state.inner().as_ref())
            .await
            .map_err(|e| format!("Failed to clear resume cache: {}", e))?;
        emit_transfer_history_reset(state.inner().as_ref()).await;
    }
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "maintenance",
        "resume cache cleared",
        Some(format!("count={}", cleared_ids.len())),
    )
    .await;
    Ok(())
}

// ============== Settings ==============
#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsPayload, String> {
    let settings = state.settings.read().await.clone();
    Ok(SettingsPayload {
        max_sandbox_size_mb: settings.max_sandbox_size_mb,
        auto_accept: settings.auto_accept,
        auto_accept_max_size_mb: settings.auto_accept_max_size_mb,
        open_received_folder: settings.open_received_folder,
        trusted_devices: settings.trusted_devices.clone(),
        desktop_notifications: settings.desktop_notifications,
        sandbox_location: current_sandbox_location(state.inner().as_ref()).await?,
        maintenance: current_maintenance_info(state.inner().as_ref()).await,
    })
}

#[command]
pub async fn save_settings(
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let sandbox_location_update = if let Some(sandbox_location) = settings.get("sandboxLocation") {
        match sandbox_location {
            serde_json::Value::Null => {
                let data_dir = state.data_dir.read().await.clone();
                let root_path = validate_sandbox_root(data_dir.join("sandbox"))?;
                Some((None, root_path))
            }
            serde_json::Value::String(path) => {
                let trimmed = path.trim();
                if trimmed.is_empty() {
                    return Err("sandboxLocation cannot be empty".to_string());
                }
                let root_path = validate_sandbox_root(PathBuf::from(trimmed))?;
                Some((Some(root_path.to_string_lossy().to_string()), root_path))
            }
            _ => return Err("sandboxLocation must be a string or null".to_string()),
        }
    } else {
        None
    };

    let updated = {
        let mut current = state.settings.write().await;

        if let Some(max_sandbox_size_mb) = settings.get("maxSandboxSizeMB").and_then(|v| v.as_u64())
        {
            current.max_sandbox_size_mb = max_sandbox_size_mb.clamp(64, 102_400);
        }

        if let Some(auto_accept) = settings.get("autoAccept").and_then(|v| v.as_bool()) {
            current.auto_accept = auto_accept;
        }

        if let Some(auto_accept_max_size_mb) =
            settings.get("autoAcceptMaxSizeMB").and_then(|v| v.as_u64())
        {
            current.auto_accept_max_size_mb = auto_accept_max_size_mb.clamp(1, 102_400);
        }

        if let Some(open_received_folder) =
            settings.get("openReceivedFolder").and_then(|v| v.as_bool())
        {
            current.open_received_folder = open_received_folder;
        }

        if let Some(trusted_devices) = settings.get("trustedDevices") {
            if let Ok(devices) =
                serde_json::from_value::<Vec<TrustedDevice>>(trusted_devices.clone())
            {
                current.trusted_devices = devices;
            }
        }

        if let Some(desktop_notifications) = settings.get("desktopNotifications") {
            if let Some(val) = desktop_notifications.as_bool() {
                current.desktop_notifications = val;
            }
        }

        if let Some((stored_location, _)) = &sandbox_location_update {
            current.sandbox_location = stored_location.clone();
        }

        current.clone()
    };

    if let Some((_, root_path)) = sandbox_location_update {
        state.sandbox.set_root(root_path);
    }

    *state.trusted_devices.write().await = updated.trusted_devices.clone();

    persist_settings(state.inner().as_ref(), &updated).await?;
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "settings",
        "settings saved",
        None,
    )
    .await;

    Ok(updated)
}

#[command]
pub async fn save_profile(
    profile: ProfilePayload,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Device, String> {
    if let Some(name) = profile.name.as_ref() {
        if name.trim().is_empty() {
            return Err("profile name cannot be empty".to_string());
        }
    }
    let identity = {
        let mut identity = state.identity.write().await;

        if let Some(name) = profile.name {
            identity.name = name.trim().to_string();
        }
        identity.avatar_data_url = profile.avatar_data_url.clone();
        identity.profile_revision += 1;

        identity.clone()
    };

    let data_dir = state.data_dir.read().await.clone();
    device_identity::save_identity(&data_dir, &identity)
        .map_err(|e| format!("Failed to save profile: {}", e))?;
    state
        .mdns_service
        .lock()
        .await
        .update_self(&identity)
        .await
        .map_err(|e| format!("Failed to update discovery profile: {}", e))?;
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "profile",
        "local profile updated",
        Some(format!("name={}", identity.name)),
    )
    .await;

    let device = Device {
        device_id: identity.device_id.clone(),
        name: identity.name.clone(),
        avatar_data_url: identity.avatar_data_url.clone(),
        has_avatar: identity.avatar_data_url.is_some().then_some(true),
        profile_revision: Some(identity.profile_revision),
        trust_fingerprint: identity.trust_fingerprint.clone(),
        trust_public_key: identity.trust_public_key.clone(),
        host: "localhost".to_string(),
        address: "127.0.0.1".to_string(),
        port: 43434,
        platform: std::env::consts::OS.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let _ = app_handle.emit("self-device-updated", device.clone());
    Ok(device)
}

// ============== Logs ==============
#[command]
pub async fn get_runtime_logs(state: State<'_, AppState>) -> Result<Vec<RuntimeLogEntry>, String> {
    let logs = state.runtime_logs.read().await;
    Ok(logs.clone())
}

#[command]
pub async fn clear_runtime_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.runtime_logs.write().await.clear();
    push_runtime_log(
        state.inner().as_ref(),
        "info",
        "logs",
        "runtime log cleared",
        None,
    )
    .await;
    Ok(())
}

#[command]
pub async fn select_file() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_file()
        .map(|path| path.to_string_lossy().to_string()))
}

#[command]
pub async fn select_files() -> Result<Vec<String>, String> {
    Ok(rfd::FileDialog::new()
        .pick_files()
        .unwrap_or_default()
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

#[command]
pub async fn select_folder_files() -> Result<Vec<String>, String> {
    let Some(folder) = rfd::FileDialog::new().pick_folder() else {
        return Ok(Vec::new());
    };

    let mut files = Vec::new();
    collect_regular_files(&folder, &mut files)
        .map_err(|e| format!("Failed to read folder {}: {}", folder.display(), e))?;
    files.sort();

    Ok(files
        .into_iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paused_send_record() -> TransferRecord {
        TransferRecord {
            transfer_id: "paused-send-1".to_string(),
            batch_id: Some("batch-1".to_string()),
            batch_label: Some("Batch".to_string()),
            direction: "send".to_string(),
            file_name: "paused.bin".to_string(),
            file_size: 100,
            bytes_transferred: 40,
            peer_device_name: Some("Peer".to_string()),
            peer_device_id: Some("peer-1".to_string()),
            status: "paused".to_string(),
            receive_mode: None,
            local_path: Some("/tmp/paused.bin".to_string()),
            source_file_modified_at: Some(123),
            source_file_sha256: Some("sha".to_string()),
            error: Some("Transfer paused. Retry to continue.".to_string()),
            updated_at: 1,
        }
    }

    #[test]
    fn cancelled_progress_preserves_paused_send_metadata() {
        let record = paused_send_record();
        let progress = cancelled_progress_from_record(&record, 99);

        assert_eq!(progress.transfer_id, record.transfer_id);
        assert_eq!(progress.direction, "send");
        assert_eq!(progress.status, "cancelled");
        assert_eq!(progress.bytes_transferred, 40);
        assert_eq!(progress.local_path, record.local_path);
        assert_eq!(progress.error.as_deref(), Some("Transfer cancelled."));
        assert_eq!(progress.updated_at, Some(99));
    }

    #[test]
    fn cancelled_record_preserves_paused_send_metadata() {
        let record = paused_send_record();
        let cancelled = cancelled_record_from_record(record, 99);

        assert_eq!(cancelled.transfer_id, "paused-send-1");
        assert_eq!(cancelled.direction, "send");
        assert_eq!(cancelled.status, "cancelled");
        assert_eq!(cancelled.bytes_transferred, 40);
        assert_eq!(cancelled.local_path.as_deref(), Some("/tmp/paused.bin"));
        assert_eq!(cancelled.error.as_deref(), Some("Transfer cancelled."));
        assert_eq!(cancelled.updated_at, 99);
    }

    #[test]
    fn source_file_changed_uses_available_resume_metadata() {
        let record = paused_send_record();

        assert!(!source_file_changed(&record, 100, Some(123), Some("SHA")));
        assert!(source_file_changed(&record, 101, Some(123), Some("sha")));
        assert!(source_file_changed(&record, 100, Some(124), Some("sha")));
        assert!(source_file_changed(&record, 100, Some(123), Some("other")));
    }

    #[test]
    fn source_file_changed_allows_missing_legacy_metadata() {
        let mut record = paused_send_record();
        record.file_size = 0;
        record.source_file_modified_at = None;
        record.source_file_sha256 = None;

        assert!(!source_file_changed(&record, 100, Some(123), None));
    }
}
