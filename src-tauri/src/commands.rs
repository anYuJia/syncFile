//! Tauri IPC 命令实现
//! 与 Electron ipcMain 一一对应的命令处理函数

use crate::discovery::device_registry::DeviceRegistry;
use crate::storage::device_identity::DeviceIdentity;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{command, Emitter, State};
use tokio::sync::RwLock;
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
    pub peer_address: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
    pub request_id: String,
    pub from_device: Device,
    pub timestamp: u64,
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
    pub trusted_devices: Vec<TrustedDevice>,
    pub desktop_notifications: bool,
    pub sandbox_location: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub trusted_devices: Vec<TrustedDevice>,
    pub desktop_notifications: bool,
    pub sandbox_location: Option<String>,
    pub version: u32,
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
    pub timestamp: u64,
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxLocationInfo {
    pub path: String,
    pub available_space: u64,
    pub total_space: u64,
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
    pub responder: Option<tokio::sync::oneshot::Sender<OfferDecision>>,
}

// ============== 应用状态 ==============
pub struct AppStateInner {
    pub device_registry: Arc<RwLock<DeviceRegistry>>,
    pub identity: Arc<RwLock<crate::storage::device_identity::DeviceIdentity>>,
    pub sandbox_path: RwLock<PathBuf>,
    pub settings: RwLock<Settings>,
    pub pending_offers: RwLock<Vec<PendingOffer>>,
    pub transfer_history: RwLock<Vec<TransferRecord>>,
    pub runtime_logs: RwLock<Vec<RuntimeLogEntry>>,
    pub pair_requests: RwLock<Vec<PairRequest>>,
    pub trusted_devices: RwLock<Vec<TrustedDevice>>,
    pub data_dir: RwLock<PathBuf>,
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
    state: &Arc<AppStateInner>,
    record: TransferRecord,
) -> std::io::Result<()> {
    let mut history = state.transfer_history.write().await;
    history.insert(0, record.clone());
    history.truncate(500);

    let data_dir = state.data_dir.read().await;
    crate::storage::persistent::add_transfer_record(&data_dir, record)
}

// ============== Devices ==============
#[command]
pub async fn get_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let registry = state.device_registry.read().await;
    let devices = registry.list().await;
    Ok(devices)
}

#[command]
pub async fn refresh_devices(state: State<'_, AppState>) -> Result<Vec<Device>, String> {
    let registry = state.device_registry.read().await;
    registry.refresh().await;
    let devices = registry.list().await;
    Ok(devices)
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
        version: "1".to_string(),
    })
}

#[command]
pub async fn probe_device(device_id: String, state: State<'_, AppState>) -> Result<DeviceReachability, String> {
    let registry = state.device_registry.read().await;
    let status = registry.probe_device(&device_id).await;
    Ok(DeviceReachability {
        device_id,
        status,
        error: None,
        checked_at: now_ms(),
    })
}

#[command]
pub async fn fetch_peer_profile(device_id: String) -> Result<Option<PeerProfilePayload>, String> {
    // TODO: Implement actual TCP-based profile fetch
    Ok(None)
}

// ============== Pairing ==============
#[command]
pub async fn pair_device(device_id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = app_handle.emit("device-paired", device_id.clone());
    Ok(())
}

#[command]
pub async fn accept_pair_request(
    request_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut requests = state.pair_requests.write().await;
    requests.retain(|r| r.request_id != request_id);
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
    let mut requests = state.pair_requests.write().await;
    requests.retain(|r| r.request_id != request_id);
    let _ = app_handle.emit("pair-request-rejected", request_id.clone());
    let _ = app_handle.emit("pair-request-removed", request_id);
    Ok(())
}

// ============== Transfers ==============
#[command]
pub async fn get_transfer_history(state: State<'_, AppState>) -> Result<Vec<TransferRecord>, String> {
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
    let transfer_id = existing_transfer_id.unwrap_or_else(|| Uuid::new_v4().to_string());

    // 获取目标设备信息
    let device = {
        let registry = state.device_registry.read().await;
        let devices = registry.list().await;
        devices.into_iter().find(|d| d.device_id == device_id)
    };

    let device = match device {
        Some(d) => d,
        None => return Err("Device not found".to_string()),
    };

    let file_name = PathBuf::from(&file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // 获取文件大小
    let file_size = match tokio::fs::metadata(&file_path).await {
        Ok(meta) => meta.len(),
        Err(e) => return Err(format!("Failed to read file metadata: {}", e)),
    };

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

    // 在后台任务中执行传输
    tokio::spawn(async move {
        // 计算文件哈希
        let sha256 = match crate::transfer::file_hash::sha256_file(std::path::Path::new(&file_path_clone)).await {
            Ok(hash) => hash,
            Err(e) => {
                let now = now_ms();
                let _ = app_handle_clone.emit("transfer-progress", TransferProgress {
                    transfer_id: transfer_id_clone.clone(),
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone.clone(),
                    file_size,
                    bytes_transferred: 0,
                    peer_device_name: Some(device_clone.name.clone()),
                    peer_device_id: Some(device_clone.device_id.clone()),
                    status: "error".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone.clone()),
                    source_file_modified_at: None,
                    source_file_sha256: None,
                    error: Some(format!("Hash calculation failed: {}", e)),
                    transfer_rate_bytes_per_second: None,
                    estimated_seconds_remaining: None,
                    updated_at: Some(now),
                });

                // 持久化错误记录
                let _ = persist_transfer_record(&state_clone, TransferRecord {
                    transfer_id: transfer_id_clone.clone(),
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone.clone(),
                    file_size,
                    bytes_transferred: 0,
                    peer_device_name: Some(device_clone.name.clone()),
                    peer_device_id: Some(device_clone.device_id.clone()),
                    status: "error".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone.clone()),
                    source_file_modified_at: None,
                    source_file_sha256: None,
                    error: Some(format!("Hash calculation failed: {}", e)),
                    updated_at: now,
                }).await;
                return;
            }
        };

        let client = crate::transfer::tcp::TcpClient::new(self_device);

        let result = client.send_file(
            &device_clone.address,
            device_clone.port,
            device_clone.clone(),
            file_path_clone.clone().into(),
            Some(transfer_id_clone.clone()),
            sha256.clone(),
        ).await;

        match result {
            Ok(file_id) => {
                let now = now_ms();
                let _ = app_handle_clone.emit("transfer-progress", TransferProgress {
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
                    source_file_modified_at: None,
                    source_file_sha256: Some(sha256.clone()),
                    error: None,
                    transfer_rate_bytes_per_second: None,
                    estimated_seconds_remaining: None,
                    updated_at: Some(now),
                });

                // 持久化记录
                let _ = persist_transfer_record(&state_clone, TransferRecord {
                    transfer_id: file_id,
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone,
                    file_size,
                    bytes_transferred: file_size,
                    peer_device_name: Some(device_clone.name.clone()),
                    peer_device_id: Some(device_clone.device_id.clone()),
                    status: "completed".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone),
                    source_file_modified_at: None,
                    source_file_sha256: Some(sha256),
                    error: None,
                    updated_at: now,
                }).await;
            }
            Err(e) => {
                let now = now_ms();
                let _ = app_handle_clone.emit("transfer-progress", TransferProgress {
                    transfer_id: transfer_id_clone.clone(),
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone.clone(),
                    file_size,
                    bytes_transferred: 0,
                    peer_device_name: Some(device_clone.name.clone()),
                    peer_device_id: Some(device_clone.device_id.clone()),
                    status: "error".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone.clone()),
                    source_file_modified_at: None,
                    source_file_sha256: Some(sha256.clone()),
                    error: Some(format!("Transfer failed: {}", e)),
                    transfer_rate_bytes_per_second: None,
                    estimated_seconds_remaining: None,
                    updated_at: Some(now),
                });

                // 持久化错误记录
                let _ = persist_transfer_record(&state_clone, TransferRecord {
                    transfer_id: transfer_id_clone,
                    batch_id: batch_id.clone(),
                    batch_label: batch_label.clone(),
                    direction: "send".to_string(),
                    file_name: file_name_clone,
                    file_size,
                    bytes_transferred: 0,
                    peer_device_name: Some(device_clone.name),
                    peer_device_id: Some(device_clone.device_id),
                    status: "error".to_string(),
                    receive_mode: None,
                    local_path: Some(file_path_clone),
                    source_file_modified_at: None,
                    source_file_sha256: Some(sha256),
                    error: Some(format!("Transfer failed: {}", e)),
                    updated_at: now,
                }).await;
            }
        }
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
            source_file_modified_at: None,
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
pub async fn pause_transfer(transfer_id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = app_handle.emit("transfer-paused", transfer_id);
    Ok(())
}

#[command]
pub async fn cancel_transfer(transfer_id: String, app_handle: tauri::AppHandle) -> Result<(), String> {
    let _ = app_handle.emit("transfer-cancelled", transfer_id);
    Ok(())
}

#[command]
pub async fn accept_incoming(
    offer_id: String,
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let mut offers = state.pending_offers.write().await;
    if let Some(pos) = offers.iter().position(|o| o.offer_id == offer_id) {
        let offer = offers.remove(pos);
        if let Some(responder) = offer.responder {
            let _ = responder.send(OfferDecision::Accept { start_offset: 0 });
        }
    }
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
    let mut offers = state.pending_offers.write().await;
    if let Some(pos) = offers.iter().position(|o| o.offer_id == offer_id) {
        let offer = offers.remove(pos);
        if let Some(responder) = offer.responder {
            let _ = responder.send(OfferDecision::Reject(reason.clone().unwrap_or_else(|| "rejected".to_string())));
        }
    }
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
    state.transfer_history.write().await.clear();
    Ok(())
}

#[command]
pub async fn remove_transfer_history_items(
    transfer_ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    state
        .transfer_history
        .write()
        .await
        .retain(|t| !transfer_ids.contains(&t.transfer_id));
    Ok(())
}

// ============== Filesystem ==============
#[command]
pub async fn open_sandbox(state: State<'_, AppState>) -> Result<(), String> {
    let sandbox_path = state.sandbox_path.read().await;
    let path = sandbox_path.to_str().ok_or_else(|| "Invalid sandbox path".to_string())?;

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
pub async fn get_sandbox_location(state: State<'_, AppState>) -> Result<SandboxLocationInfo, String> {
    let path = state.sandbox_path.read().await;
    let path_str = path
        .to_str()
        .ok_or_else(|| "Invalid sandbox path".to_string())?
        .to_string();

    Ok(SandboxLocationInfo {
        path: path_str,
        available_space: 0,
        total_space: 0,
    })
}

#[command]
pub async fn choose_sandbox_location(state: State<'_, AppState>) -> Result<Option<SandboxLocationInfo>, String> {
    Ok(None)
}

#[command]
pub async fn clear_resume_cache() -> Result<(), String> {
    // TODO: Implement resume cache clearing
    Ok(())
}

// ============== Settings ==============
#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<SettingsPayload, String> {
    let settings = state.settings.read().await;
    Ok(SettingsPayload {
        trusted_devices: settings.trusted_devices.clone(),
        desktop_notifications: settings.desktop_notifications,
        sandbox_location: settings.sandbox_location.clone(),
        version: 1,
    })
}

#[command]
pub async fn save_settings(
    settings: serde_json::Value,
    state: State<'_, AppState>,
) -> Result<Settings, String> {
    let mut current = state.settings.write().await;

    if let Some(trusted_devices) = settings.get("trustedDevices") {
        if let Ok(devices) = serde_json::from_value::<Vec<TrustedDevice>>(trusted_devices.clone()) {
            current.trusted_devices = devices;
        }
    }

    if let Some(desktop_notifications) = settings.get("desktopNotifications") {
        if let Some(val) = desktop_notifications.as_bool() {
            current.desktop_notifications = val;
        }
    }

    if let Some(sandbox_location) = settings.get("sandboxLocation") {
        current.sandbox_location = sandbox_location.as_str().map(|s| s.to_string());
    }

    // 持久化保存到磁盘
    let data_dir = state.data_dir.read().await;
    let persistent = crate::storage::persistent::PersistentSettings {
        trusted_devices: current.trusted_devices.clone(),
        desktop_notifications: current.desktop_notifications,
        sandbox_location: current.sandbox_location.clone(),
        transfer_history: Vec::new(),
        version: 1,
    };
    let _ = crate::storage::persistent::save_settings(&data_dir, &persistent);

    Ok(current.clone())
}

#[command]
pub async fn save_profile(
    profile: ProfilePayload,
    _app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Device, String> {
    let mut identity = state.identity.write().await;

    if let Some(name) = profile.name {
        identity.name = name;
    }
    if let Some(avatar_data_url) = profile.avatar_data_url {
        identity.avatar_data_url = Some(avatar_data_url);
    }
    identity.profile_revision += 1;

    // 持久化保存到磁盘
    let data_dir = state.data_dir.read().await;
    let _ = crate::storage::device_identity::save_identity(&data_dir, &identity);

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
        version: "1".to_string(),
    })
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
    Ok(())
}

#[command]
pub async fn select_file() -> Result<Option<String>, String> {
    // 返回空，前端会使用 HTML input 作为降级方案
    Ok(None)
}
