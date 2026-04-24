//! TCP 文件传输模块
//! 包含服务端和客户端，支持安全加密、断点续传、进度跟踪

use super::codec::{encode_message, MessageDecoder};
use super::file_hash::seed_hash_for_resume;
use super::protocol::{FileOfferMessage, FromDevice, PairRequestMessage, ProtocolMessage};
use super::secure_channel::{
    secure_accept, secure_connect, ExpectedPeerIdentity, SecureIdentity, SecureSocket,
};

use crate::commands::{
    AppState, Device, IncomingOffer, OfferDecision, PairRequest, PendingOffer, TransferProgress,
    TransferRecord,
};
use crate::security::trust::{
    sign_file_offer, sign_pair_request, verify_file_offer, verify_pair_request,
};
use crate::storage::sandbox::Sandbox;

use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, RwLock};
use uuid::Uuid;

pub const DEFAULT_PORT: u16 = 43434;
#[allow(dead_code)]
const DEFAULT_CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
#[allow(dead_code)]
const DEFAULT_HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
const DEFAULT_DECISION_TIMEOUT: Duration = Duration::from_secs(180);
#[allow(dead_code)]
const DEFAULT_IDLE_TIMEOUT: Duration = Duration::from_secs(120);
#[allow(dead_code)]
const MAX_SECURE_FRAME_BYTES: usize = 1024 * 1024;

fn now_ms() -> u64 {
    use std::time::SystemTime;
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn normalize_remote_address(addr: &str) -> String {
    if let Some(rest) = addr.strip_prefix("::ffff:") {
        rest.to_string()
    } else {
        addr.to_string()
    }
}

fn from_device_to_device(from_device: &FromDevice, peer_address: &str, port: u16) -> Device {
    Device {
        device_id: from_device.device_id.clone(),
        name: from_device.name.clone(),
        avatar_data_url: None,
        has_avatar: from_device.has_avatar,
        profile_revision: from_device.profile_revision,
        trust_fingerprint: from_device.trust_fingerprint.clone(),
        trust_public_key: from_device.trust_public_key.clone(),
        host: peer_address.to_string(),
        address: peer_address.to_string(),
        port,
        platform: from_device
            .platform
            .clone()
            .unwrap_or_else(|| "unknown".to_string()),
        version: from_device
            .version
            .clone()
            .unwrap_or_else(|| "1".to_string()),
    }
}

#[derive(Debug, Default)]
pub struct TransferControl {
    pause_requested: AtomicBool,
    cancel_requested: AtomicBool,
}

impl TransferControl {
    pub fn request_pause(&self) {
        self.pause_requested.store(true, Ordering::SeqCst);
    }

    pub fn request_cancel(&self) {
        self.cancel_requested.store(true, Ordering::SeqCst);
    }

    fn take_action(&self) -> Option<&'static str> {
        if self.cancel_requested.load(Ordering::SeqCst) {
            Some("sender-cancelled")
        } else if self.pause_requested.load(Ordering::SeqCst) {
            Some("sender-paused")
        } else {
            None
        }
    }
}

async fn persist_transfer_record(state: &AppState, record: TransferRecord) -> std::io::Result<()> {
    let history = {
        let mut history = state.transfer_history.write().await;
        history.retain(|item| item.transfer_id != record.transfer_id);
        history.insert(0, record);
        history.truncate(500);
        history.clone()
    };
    let data_dir = state.data_dir.read().await.clone();
    crate::storage::persistent::save_transfer_history(&data_dir, &history)
}

// ========== TCP Server ==========

#[derive(Debug, Clone)]
#[allow(dead_code)]
struct ActiveReceive {
    bytes_received: u64,
    file_size: u64,
    file_name: String,
    partial_path: PathBuf,
    final_path: PathBuf,
    from_device: Device,
    hasher: Sha256,
}

pub struct TcpServer {
    listener: Arc<RwLock<Option<Arc<TcpListener>>>>,
    app_handle: AppHandle,
    state: AppState,
    sandbox: Sandbox,
    self_device: SecureIdentity,
    active_receives: Arc<RwLock<HashMap<String, ActiveReceive>>>,
    recent_pair_requests: Arc<RwLock<HashMap<String, u64>>>,
}

impl TcpServer {
    pub fn new(
        app_handle: AppHandle,
        state: AppState,
        sandbox: Sandbox,
        self_device: SecureIdentity,
    ) -> Self {
        Self {
            listener: Arc::new(RwLock::new(None)),
            app_handle,
            state,
            sandbox,
            self_device,
            active_receives: Arc::new(RwLock::new(HashMap::new())),
            recent_pair_requests: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn listen(&self, port: u16) -> std::io::Result<()> {
        let listener = TcpListener::bind((Ipv4Addr::UNSPECIFIED, port)).await?;
        let listener = Arc::new(listener);
        *self.listener.write().await = Some(listener.clone());

        let state = self.state.clone();
        let app_handle = self.app_handle.clone();
        let sandbox = self.sandbox.clone();
        let self_device = self.self_device.clone();
        let active_receives = self.active_receives.clone();
        let recent_pair_requests = self.recent_pair_requests.clone();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((socket, addr)) => {
                        let state = state.clone();
                        let app_handle = app_handle.clone();
                        let sandbox = sandbox.clone();
                        let self_device = self_device.clone();
                        let active_receives = active_receives.clone();
                        let recent_pair_requests = recent_pair_requests.clone();

                        tokio::spawn(async move {
                            if let Err(e) = handle_connection(
                                socket,
                                addr.to_string(),
                                state,
                                app_handle,
                                sandbox,
                                self_device,
                                active_receives,
                                recent_pair_requests,
                            )
                            .await
                            {
                                eprintln!("Connection error: {}", e);
                            }
                        });
                    }
                    Err(e) => eprintln!("Accept error: {}", e),
                }
            }
        });

        Ok(())
    }

    pub async fn cancel(&self, offer_id: &str) -> bool {
        let mut receives = self.active_receives.write().await;
        if let Some(_active) = receives.remove(offer_id) {
            self.sandbox.discard_incoming_resume(offer_id, true);
            true
        } else {
            false
        }
    }
}

async fn handle_connection(
    socket: TcpStream,
    peer_addr: String,
    state: AppState,
    app_handle: AppHandle,
    sandbox: Sandbox,
    self_device: SecureIdentity,
    active_receives: Arc<RwLock<HashMap<String, ActiveReceive>>>,
    recent_pair_requests: Arc<RwLock<HashMap<String, u64>>>,
) -> std::io::Result<()> {
    let peer_addr = normalize_remote_address(&peer_addr);

    // 安全握手
    let (mut secure_socket, _peer) = secure_accept(socket, self_device.clone(), None).await?;
    let peer_port = 0;

    // 读取第一个消息
    let first_frame = secure_socket.read_frame().await?;
    let mut decoder = MessageDecoder::new();
    let messages = decoder.push(&first_frame).unwrap_or_default();

    for msg in messages {
        match msg {
            ProtocolMessage::PairRequest { .. } => {
                handle_pair_request(
                    msg,
                    secure_socket,
                    peer_addr,
                    app_handle,
                    state,
                    recent_pair_requests,
                )
                .await?;
                return Ok(());
            }
            ProtocolMessage::ProfileRequest => {
                handle_profile_request(secure_socket, state).await?;
                return Ok(());
            }
            ProtocolMessage::FileOffer { .. } => {
                handle_file_offer(
                    msg,
                    secure_socket,
                    peer_addr,
                    peer_port,
                    app_handle,
                    state,
                    sandbox,
                    active_receives,
                )
                .await?;
                return Ok(());
            }
            _ => {
                // 未知消息类型，关闭连接
                return Ok(());
            }
        }
    }

    Ok(())
}

async fn handle_pair_request(
    msg: ProtocolMessage,
    mut socket: SecureSocket,
    peer_addr: String,
    app_handle: AppHandle,
    state: AppState,
    recent_pair_requests: Arc<RwLock<HashMap<String, u64>>>,
) -> std::io::Result<()> {
    let (version, request_id, timestamp, from_device, signature) = match msg {
        ProtocolMessage::PairRequest {
            version,
            request_id,
            timestamp,
            from_device,
            signature,
        } => (version, request_id, timestamp, from_device, signature),
        _ => return Ok(()),
    };

    // 验证签名
    let pair_request_msg = PairRequestMessage {
        msg_type: "pair-request".to_string(),
        version,
        request_id: request_id.clone(),
        timestamp,
        from_device: from_device.clone(),
        signature: signature.clone(),
    };

    if !verify_pair_request(&pair_request_msg) {
        return Ok(());
    }

    // 检查是否是重放
    {
        let mut requests = recent_pair_requests.write().await;
        if requests.contains_key(&request_id) {
            return Ok(());
        }
        requests.insert(request_id.clone(), now_ms());
    }

    let (tx, rx) = oneshot::channel::<bool>();
    let device = from_device_to_device(&from_device, &peer_addr, 0);
    {
        state.pair_requests.write().await.push(PairRequest {
            request_id: request_id.clone(),
            from_device: device.clone(),
            received_at: now_ms(),
        });
        state
            .pending_pair_responses
            .write()
            .await
            .insert(request_id.clone(), tx);
    }
    let _ = app_handle.emit(
        "incoming-pair-request",
        PairRequest {
            request_id: request_id.clone(),
            from_device: device.clone(),
            received_at: now_ms(),
        },
    );

    let accepted = match tokio::time::timeout(DEFAULT_DECISION_TIMEOUT, rx).await {
        Ok(Ok(value)) => value,
        Ok(Err(_)) => false,
        Err(_) => false,
    };

    let response = ProtocolMessage::PairResponse {
        request_id: request_id.clone(),
        accepted,
    };
    let encoded = encode_message(&response).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
    })?;
    socket.write_frame(&encoded).await?;
    state
        .pair_requests
        .write()
        .await
        .retain(|request| request.request_id != request_id);
    state
        .pending_pair_responses
        .write()
        .await
        .remove(&request_id);
    let _ = app_handle.emit("pair-request-removed", request_id);

    Ok(())
}

async fn handle_profile_request(mut socket: SecureSocket, state: AppState) -> std::io::Result<()> {
    let identity = state.identity.read().await;
    let response = ProtocolMessage::ProfileResponse {
        device_id: identity.device_id.clone(),
        name: identity.name.clone(),
        avatar_data_url: identity.avatar_data_url.clone(),
        has_avatar: Some(identity.avatar_data_url.is_some()),
        profile_revision: Some(identity.profile_revision),
    };
    let encoded = encode_message(&response).map_err(|e| {
        std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
    })?;
    socket.write_frame(&encoded).await?;
    Ok(())
}

async fn handle_file_offer(
    msg: ProtocolMessage,
    mut socket: SecureSocket,
    peer_addr: String,
    peer_port: u16,
    app_handle: AppHandle,
    state: AppState,
    sandbox: Sandbox,
    active_receives: Arc<RwLock<HashMap<String, ActiveReceive>>>,
) -> std::io::Result<()> {
    let (_version, file_id, file_name, file_size, mime_type, sha256, from_device, signature) =
        match msg {
            ProtocolMessage::FileOffer {
                version,
                file_id,
                file_name,
                file_size,
                mime_type,
                sha256,
                from_device,
                signature,
            } => (
                version,
                file_id,
                file_name,
                file_size,
                mime_type,
                sha256,
                from_device,
                signature,
            ),
            _ => return Ok(()),
        };

    let mut decoder = MessageDecoder::new();

    let signed_offer = FileOfferMessage {
        msg_type: "file-offer".to_string(),
        version: 1,
        file_id: file_id.clone(),
        file_name: file_name.clone(),
        file_size: file_size as i64,
        sha256: sha256.clone(),
        mime_type: mime_type.clone(),
        from_device: from_device.clone(),
        signature: signature.clone(),
    };
    if !verify_file_offer(&signed_offer) {
        let reject = ProtocolMessage::FileReject {
            file_id: file_id.clone(),
            reason: "identity-mismatch".to_string(),
        };
        let encoded = encode_message(&reject).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        let _ = socket.write_frame(&encoded).await;
        return Ok(());
    }

    // 创建 offer 信息
    let offer_id = file_id.clone();
    let device = from_device_to_device(&from_device, &peer_addr, peer_port);
    let received_at = now_ms();
    let save_directory = sandbox
        .directory_for_incoming(&device.device_id)
        .to_string_lossy()
        .to_string();

    let incoming_offer = IncomingOffer {
        offer_id: offer_id.clone(),
        file_id: file_id.clone(),
        file_name: file_name.clone(),
        file_size: file_size as u64,
        sha256: sha256.clone(),
        mime_type: mime_type.clone(),
        from_device: device.clone(),
        received_at,
        save_directory,
        peer_address: peer_addr.clone(),
    };

    let settings = state.settings.read().await.clone();
    let trusted_devices = state.trusted_devices.read().await.clone();
    let is_trusted_device = trusted_devices.iter().any(|trusted| {
        trusted.device_id == device.device_id
            && trusted.trust_fingerprint == device.trust_fingerprint
    });
    let max_bytes = settings.max_sandbox_size_mb.saturating_mul(1024 * 1024);
    let would_exceed_sandbox = state
        .sandbox
        .current_usage_bytes()
        .saturating_add(file_size)
        > max_bytes;
    let receive_mode = if is_trusted_device {
        Some("trusted-device".to_string())
    } else if settings.auto_accept
        && file_size <= settings.auto_accept_max_size_mb.saturating_mul(1024 * 1024)
    {
        Some("auto-accept".to_string())
    } else {
        None
    };

    if would_exceed_sandbox {
        let reject = ProtocolMessage::FileReject {
            file_id: file_id.clone(),
            reason: "too-large".to_string(),
        };
        let encoded = encode_message(&reject).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        let _ = socket.write_frame(&encoded).await;
        let _ = app_handle.emit(
            "transfer-progress",
            TransferProgress {
                transfer_id: file_id,
                batch_id: None,
                batch_label: None,
                direction: "receive".to_string(),
                file_name,
                file_size,
                bytes_transferred: 0,
                peer_device_name: Some(device.name),
                peer_device_id: Some(device.device_id),
                status: "rejected".to_string(),
                receive_mode: Some("manual".to_string()),
                local_path: None,
                source_file_modified_at: None,
                source_file_sha256: sha256,
                error: Some("too-large".to_string()),
                transfer_rate_bytes_per_second: None,
                estimated_seconds_remaining: None,
                updated_at: Some(received_at),
            },
        );
        return Ok(());
    }

    let decision = if let Some(mode) = receive_mode.clone() {
        let _ = app_handle.emit(
            "transfer-progress",
            TransferProgress {
                transfer_id: offer_id.clone(),
                batch_id: None,
                batch_label: None,
                direction: "receive".to_string(),
                file_name: file_name.clone(),
                file_size,
                bytes_transferred: 0,
                peer_device_name: Some(device.name.clone()),
                peer_device_id: Some(device.device_id.clone()),
                status: "pending".to_string(),
                receive_mode: Some(mode),
                local_path: None,
                source_file_modified_at: None,
                source_file_sha256: sha256.clone(),
                error: None,
                transfer_rate_bytes_per_second: None,
                estimated_seconds_remaining: None,
                updated_at: Some(received_at),
            },
        );
        Ok(Ok(OfferDecision::Accept { start_offset: 0 }))
    } else {
        let (tx, rx) = oneshot::channel::<OfferDecision>();
        let mut pending = state.pending_offers.write().await;
        pending.push(PendingOffer {
            offer: incoming_offer.clone(),
            offer_id: offer_id.clone(),
            responder: Some(tx),
        });
        let _ = app_handle.emit("incoming-offer", incoming_offer);
        tokio::time::timeout(DEFAULT_DECISION_TIMEOUT, rx).await
    };

    match decision {
        Ok(Ok(OfferDecision::Accept { start_offset })) => {
            let accepted_receive_mode =
                receive_mode.clone().unwrap_or_else(|| "manual".to_string());
            // 准备接收
            let resume_info = sandbox.prepare_incoming_resume(
                &file_id,
                &device.device_id,
                &device.name,
                &device.trust_fingerprint,
                &device.trust_public_key,
                &file_name,
                file_size as u64,
                sha256.as_deref().unwrap_or(""),
            );

            // 发送 accept 消息
            let accept = ProtocolMessage::FileAccept {
                file_id: file_id.clone(),
                start_offset: Some(start_offset),
            };
            let encoded = encode_message(&accept).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
            })?;
            socket.write_frame(&encoded).await?;

            // 打开文件准备写入
            let mut file = tokio::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&resume_info.partial_path)
                .await?;

            // 初始化 hash
            let mut hasher = seed_hash_for_resume(&resume_info.partial_path, start_offset).await?;
            let mut bytes_received = start_offset;

            // 添加到 active_receives
            {
                let mut receives = active_receives.write().await;
                receives.insert(
                    file_id.clone(),
                    ActiveReceive {
                        bytes_received,
                        file_size: file_size as u64,
                        file_name: file_name.clone(),
                        partial_path: resume_info.partial_path.clone(),
                        final_path: resume_info.final_path.clone(),
                        from_device: device.clone(),
                        hasher: hasher.clone(),
                    },
                );
            }

            // 接收文件数据
            loop {
                if bytes_received >= file_size as u64 {
                    break;
                }

                if state
                    .inbound_cancel_transfers
                    .write()
                    .await
                    .remove(&file_id)
                {
                    let now = now_ms();
                    sandbox.discard_incoming_resume(&file_id, true);
                    {
                        let mut receives = active_receives.write().await;
                        receives.remove(&file_id);
                    }
                    let _ = app_handle.emit(
                        "transfer-progress",
                        TransferProgress {
                            transfer_id: file_id.clone(),
                            batch_id: None,
                            batch_label: None,
                            direction: "receive".to_string(),
                            file_name: file_name.clone(),
                            file_size: file_size as u64,
                            bytes_transferred: bytes_received,
                            peer_device_name: Some(device.name.clone()),
                            peer_device_id: Some(device.device_id.clone()),
                            status: "cancelled".to_string(),
                            receive_mode: Some(accepted_receive_mode.clone()),
                            local_path: None,
                            source_file_modified_at: None,
                            source_file_sha256: sha256.clone(),
                            error: Some("Transfer cancelled.".to_string()),
                            transfer_rate_bytes_per_second: None,
                            estimated_seconds_remaining: None,
                            updated_at: Some(now),
                        },
                    );
                    let _ = persist_transfer_record(
                        &state,
                        TransferRecord {
                            transfer_id: file_id.clone(),
                            batch_id: None,
                            batch_label: None,
                            direction: "receive".to_string(),
                            file_name: file_name.clone(),
                            file_size: file_size as u64,
                            bytes_transferred: bytes_received,
                            peer_device_name: Some(device.name.clone()),
                            peer_device_id: Some(device.device_id.clone()),
                            status: "cancelled".to_string(),
                            receive_mode: Some(accepted_receive_mode.clone()),
                            local_path: None,
                            source_file_modified_at: None,
                            source_file_sha256: sha256.clone(),
                            error: Some("Transfer cancelled.".to_string()),
                            updated_at: now,
                        },
                    )
                    .await;
                    return Ok(());
                }

                let frame = socket.read_frame().await?;

                // 检查是否是控制消息（file-cancel）
                if let Ok(messages) = decoder.push(&frame) {
                    for msg in messages {
                        if let ProtocolMessage::FileCancel { reason, .. } = msg {
                            let now = now_ms();
                            let status = if reason == "sender-paused" {
                                "paused"
                            } else {
                                "cancelled"
                            };
                            if status == "cancelled" {
                                sandbox.discard_incoming_resume(&file_id, true);
                            }
                            let local_path = if status == "paused" {
                                Some(resume_info.partial_path.to_string_lossy().to_string())
                            } else {
                                None
                            };
                            let error = if status == "paused" {
                                Some("Sender paused the transfer. Retry from the sender to continue.".to_string())
                            } else {
                                Some("Sender cancelled the transfer.".to_string())
                            };
                            {
                                let mut receives = active_receives.write().await;
                                receives.remove(&file_id);
                            }
                            let _ = app_handle.emit(
                                "transfer-progress",
                                TransferProgress {
                                    transfer_id: file_id.clone(),
                                    batch_id: None,
                                    batch_label: None,
                                    direction: "receive".to_string(),
                                    file_name: file_name.clone(),
                                    file_size: file_size as u64,
                                    bytes_transferred: bytes_received,
                                    peer_device_name: Some(device.name.clone()),
                                    peer_device_id: Some(device.device_id.clone()),
                                    status: status.to_string(),
                                    receive_mode: Some(accepted_receive_mode.clone()),
                                    local_path: local_path.clone(),
                                    source_file_modified_at: None,
                                    source_file_sha256: sha256.clone(),
                                    error: error.clone(),
                                    transfer_rate_bytes_per_second: None,
                                    estimated_seconds_remaining: None,
                                    updated_at: Some(now),
                                },
                            );
                            let _ = persist_transfer_record(
                                &state,
                                TransferRecord {
                                    transfer_id: file_id.clone(),
                                    batch_id: None,
                                    batch_label: None,
                                    direction: "receive".to_string(),
                                    file_name: file_name.clone(),
                                    file_size: file_size as u64,
                                    bytes_transferred: bytes_received,
                                    peer_device_name: Some(device.name.clone()),
                                    peer_device_id: Some(device.device_id.clone()),
                                    status: status.to_string(),
                                    receive_mode: Some(accepted_receive_mode.clone()),
                                    local_path,
                                    source_file_modified_at: None,
                                    source_file_sha256: sha256.clone(),
                                    error,
                                    updated_at: now,
                                },
                            )
                            .await;
                            return Ok(());
                        }
                    }
                }

                // 写入文件
                hasher.update(&frame);
                file.write_all(&frame).await?;
                bytes_received += frame.len() as u64;

                // 更新 active_receive
                {
                    let mut receives = active_receives.write().await;
                    if let Some(active) = receives.get_mut(&file_id) {
                        active.bytes_received = bytes_received;
                    }
                }

                // 发射进度事件
                let _ = app_handle.emit(
                    "transfer-progress",
                    TransferProgress {
                        transfer_id: file_id.clone(),
                        batch_id: None,
                        batch_label: None,
                        direction: "receive".to_string(),
                        file_name: file_name.clone(),
                        file_size: file_size as u64,
                        bytes_transferred: bytes_received,
                        peer_device_name: Some(device.name.clone()),
                        peer_device_id: Some(device.device_id.clone()),
                        status: "in-progress".to_string(),
                        receive_mode: Some(accepted_receive_mode.clone()),
                        local_path: Some(resume_info.partial_path.to_string_lossy().to_string()),
                        source_file_modified_at: None,
                        source_file_sha256: sha256.clone(),
                        error: None,
                        transfer_rate_bytes_per_second: None,
                        estimated_seconds_remaining: None,
                        updated_at: Some(now_ms()),
                    },
                );
            }

            // 读取 file-complete
            let complete_frame = socket.read_frame().await?;
            let messages = decoder.push(&complete_frame).unwrap_or_default();
            let mut completed = false;
            for msg in messages {
                if let ProtocolMessage::FileComplete { .. } = msg {
                    completed = true;
                    break;
                }
            }

            if completed {
                // 验证哈希
                let computed_hash = format!("{:x}", hasher.finalize());
                let hash_valid = sha256.as_ref().map_or(true, |expected| {
                    expected.to_lowercase() == computed_hash.to_lowercase()
                });

                if hash_valid {
                    // 完成
                    let saved_path = sandbox
                        .complete_incoming_resume(&file_id)
                        .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
                    let now = now_ms();
                    let completed_progress = TransferProgress {
                        transfer_id: file_id.clone(),
                        batch_id: None,
                        batch_label: None,
                        direction: "receive".to_string(),
                        file_name: file_name.clone(),
                        file_size: file_size as u64,
                        bytes_transferred: bytes_received,
                        peer_device_name: Some(device.name.clone()),
                        peer_device_id: Some(device.device_id.clone()),
                        status: "completed".to_string(),
                        receive_mode: Some(accepted_receive_mode.clone()),
                        local_path: Some(saved_path.to_string_lossy().to_string()),
                        source_file_modified_at: None,
                        source_file_sha256: sha256.clone(),
                        error: None,
                        transfer_rate_bytes_per_second: None,
                        estimated_seconds_remaining: None,
                        updated_at: Some(now),
                    };

                    let _ = app_handle.emit("transfer-progress", completed_progress.clone());
                    let _ = app_handle.emit("transfer-complete", completed_progress.clone());

                    let _ = persist_transfer_record(
                        &state,
                        TransferRecord {
                            transfer_id: file_id.clone(),
                            batch_id: None,
                            batch_label: None,
                            direction: "receive".to_string(),
                            file_name: file_name.clone(),
                            file_size: file_size as u64,
                            bytes_transferred: bytes_received,
                            peer_device_name: Some(device.name),
                            peer_device_id: Some(device.device_id),
                            status: "completed".to_string(),
                            receive_mode: Some(accepted_receive_mode.clone()),
                            local_path: Some(saved_path.to_string_lossy().to_string()),
                            source_file_modified_at: None,
                            source_file_sha256: sha256,
                            error: None,
                            updated_at: now,
                        },
                    )
                    .await;
                    if settings.open_received_folder {
                        #[cfg(target_os = "macos")]
                        let _ = std::process::Command::new("open").arg(&saved_path).status();
                        #[cfg(target_os = "windows")]
                        let _ = std::process::Command::new("explorer")
                            .arg(&saved_path)
                            .status();
                        #[cfg(target_os = "linux")]
                        let _ = std::process::Command::new("xdg-open")
                            .arg(&saved_path)
                            .status();
                    }
                } else {
                    // 哈希验证失败
                    sandbox.discard_incoming_resume(&file_id, true);
                    let now = now_ms();
                    let _ = app_handle.emit(
                        "transfer-progress",
                        TransferProgress {
                            transfer_id: file_id.clone(),
                            batch_id: None,
                            batch_label: None,
                            direction: "receive".to_string(),
                            file_name: file_name.clone(),
                            file_size: file_size as u64,
                            bytes_transferred: bytes_received,
                            peer_device_name: Some(device.name.clone()),
                            peer_device_id: Some(device.device_id.clone()),
                            status: "failed".to_string(),
                            receive_mode: Some(accepted_receive_mode.clone()),
                            local_path: None,
                            source_file_modified_at: None,
                            source_file_sha256: sha256.clone(),
                            error: Some("hash verification failed".to_string()),
                            transfer_rate_bytes_per_second: None,
                            estimated_seconds_remaining: None,
                            updated_at: Some(now),
                        },
                    );

                    let _ = persist_transfer_record(
                        &state,
                        TransferRecord {
                            transfer_id: file_id.clone(),
                            batch_id: None,
                            batch_label: None,
                            direction: "receive".to_string(),
                            file_name: file_name.clone(),
                            file_size: file_size as u64,
                            bytes_transferred: bytes_received,
                            peer_device_name: Some(device.name),
                            peer_device_id: Some(device.device_id),
                            status: "failed".to_string(),
                            receive_mode: Some(accepted_receive_mode),
                            local_path: None,
                            source_file_modified_at: None,
                            source_file_sha256: sha256,
                            error: Some("hash verification failed".to_string()),
                            updated_at: now,
                        },
                    )
                    .await;
                }
            }

            {
                let mut receives = active_receives.write().await;
                receives.remove(&file_id);
            }
        }

        Ok(Ok(OfferDecision::Reject(reason))) => {
            let reject = ProtocolMessage::FileReject {
                file_id: file_id.clone(),
                reason: reason.clone(),
            };
            let encoded = encode_message(&reject).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
            })?;
            let _ = socket.write_frame(&encoded).await;
        }

        Ok(Ok(OfferDecision::Cancel(_reason))) => {
            // 接收方取消
            sandbox.discard_incoming_resume(&file_id, true);
        }

        Ok(Err(_)) | Err(_) => {
            // Channel 断开或超时，发送 reject
            let reject = ProtocolMessage::FileReject {
                file_id: file_id.clone(),
                reason: "timeout".to_string(),
            };
            let encoded = encode_message(&reject).map_err(|e| {
                std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
            })?;
            let _ = socket.write_frame(&encoded).await;
        }
    }

    // 从 pending_offers 中移除
    {
        let mut pending = state.pending_offers.write().await;
        pending.retain(|p| p.offer_id != offer_id);
    }

    Ok(())
}

// ========== TCP Client ==========

pub struct TcpClient {
    self_device: SecureIdentity,
}

impl TcpClient {
    pub fn new(self_device: SecureIdentity) -> Self {
        Self { self_device }
    }

    pub async fn probe_peer(&self, host: &str, port: u16, device: &Device) -> std::io::Result<()> {
        let socket = TcpStream::connect((host, port)).await?;
        let expected_peer = ExpectedPeerIdentity {
            device_id: Some(device.device_id.clone()),
            trust_fingerprint: device.trust_fingerprint.clone(),
            trust_public_key: Some(device.trust_public_key.clone()),
        };
        let _socket = secure_connect(socket, self.self_device.clone(), expected_peer, None).await?;
        Ok(())
    }

    pub async fn fetch_peer_profile(
        &self,
        host: &str,
        port: u16,
        device: &Device,
    ) -> std::io::Result<Option<crate::commands::PeerProfilePayload>> {
        let socket = TcpStream::connect((host, port)).await?;
        let expected_peer = ExpectedPeerIdentity {
            device_id: Some(device.device_id.clone()),
            trust_fingerprint: device.trust_fingerprint.clone(),
            trust_public_key: Some(device.trust_public_key.clone()),
        };
        let mut secure_socket =
            secure_connect(socket, self.self_device.clone(), expected_peer, None).await?;

        let encoded = encode_message(&ProtocolMessage::ProfileRequest).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        secure_socket.write_frame(&encoded).await?;

        let response_frame = secure_socket.read_frame().await?;
        let mut decoder = MessageDecoder::new();
        for msg in decoder.push(&response_frame).unwrap_or_default() {
            if let ProtocolMessage::ProfileResponse {
                device_id,
                name,
                avatar_data_url,
                has_avatar,
                profile_revision,
            } = msg
            {
                return Ok(Some(crate::commands::PeerProfilePayload {
                    device_id,
                    name,
                    avatar_data_url,
                    has_avatar: has_avatar.unwrap_or(false),
                    profile_revision: profile_revision.unwrap_or(1),
                    trust_fingerprint: device.trust_fingerprint.clone(),
                }));
            }
        }

        Ok(None)
    }

    pub async fn send_file(
        &self,
        host: &str,
        port: u16,
        device: Device,
        file_path: PathBuf,
        file_id: Option<String>,
        sha256: String,
        control: Option<Arc<TransferControl>>,
    ) -> std::io::Result<String> {
        let file_id = file_id.unwrap_or_else(|| Uuid::new_v4().to_string());

        // 连接 socket
        let socket = TcpStream::connect((host, port)).await?;

        // 安全握手
        let expected_peer = ExpectedPeerIdentity {
            device_id: Some(device.device_id.clone()),
            trust_fingerprint: device.trust_fingerprint.clone(),
            trust_public_key: Some(device.trust_public_key.clone()),
        };
        let mut secure_socket =
            secure_connect(socket, self.self_device.clone(), expected_peer, None).await?;

        // 获取文件大小
        let metadata = std::fs::metadata(&file_path)?;
        let file_size = metadata.len();
        let file_name = file_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // 创建并签名 file-offer
        let from_device = FromDevice {
            device_id: self.self_device.device_id.clone(),
            name: self.self_device.name.clone(),
            trust_fingerprint: self.self_device.trust_fingerprint.clone(),
            trust_public_key: self.self_device.trust_public_key.clone(),
            port: Some(port),
            platform: None,
            version: Some("1".to_string()),
            has_avatar: Some(false),
            profile_revision: Some(1),
        };

        let unsigned_offer = FileOfferMessage {
            msg_type: "file-offer".to_string(),
            version: 1,
            file_id: file_id.clone(),
            file_name: file_name.clone(),
            file_size: file_size as i64,
            sha256: Some(sha256.clone()),
            mime_type: None,
            from_device: from_device.clone(),
            signature: None,
        };

        let signature = sign_file_offer(&unsigned_offer, &self.self_device.trust_private_key);

        let offer = ProtocolMessage::FileOffer {
            version: 1,
            file_id: file_id.clone(),
            file_name: file_name.clone(),
            file_size: file_size,
            mime_type: None,
            sha256: Some(sha256),
            from_device,
            signature: Some(signature),
        };

        let encoded_offer = encode_message(&offer).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        secure_socket.write_frame(&encoded_offer).await?;

        // 等待接受/拒绝
        let response_frame = secure_socket.read_frame().await?;
        let mut decoder = MessageDecoder::new();
        let messages = decoder.push(&response_frame).unwrap_or_default();

        let mut start_offset = 0;
        let mut accepted = false;

        for msg in messages {
            match msg {
                ProtocolMessage::FileAccept {
                    file_id: _,
                    start_offset: offset,
                } => {
                    accepted = true;
                    start_offset = offset.unwrap_or(0);
                }
                ProtocolMessage::FileReject { file_id: _, reason } => {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("file rejected: {}", reason),
                    ));
                }
                ProtocolMessage::FileCancel { file_id: _, reason } => {
                    return Err(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        format!("transfer cancelled: {}", reason),
                    ));
                }
                _ => {}
            }
        }

        if !accepted {
            return Err(std::io::Error::new(
                std::io::ErrorKind::Other,
                "no accept response",
            ));
        }

        // 流式发送文件
        let mut file = File::open(&file_path).await?;
        if start_offset > 0 {
            file.seek(std::io::SeekFrom::Start(start_offset)).await?;
        }

        let mut bytes_sent = start_offset;
        let mut buf = vec![0u8; 65536];

        loop {
            if let Some(action) = control.as_ref().and_then(|inner| inner.take_action()) {
                let cancel = ProtocolMessage::FileCancel {
                    file_id: file_id.clone(),
                    reason: action.to_string(),
                };
                let encoded = encode_message(&cancel).map_err(|e| {
                    std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
                })?;
                let _ = secure_socket.write_frame(&encoded).await;
                return Err(std::io::Error::new(
                    if action == "sender-paused" {
                        std::io::ErrorKind::Interrupted
                    } else {
                        std::io::ErrorKind::ConnectionAborted
                    },
                    action,
                ));
            }

            let n = file.read(&mut buf).await?;
            if n == 0 {
                break;
            }

            secure_socket.write_frame(&buf[..n]).await?;
            bytes_sent += n as u64;
        }

        // 发送 file-complete
        let complete = ProtocolMessage::FileComplete {
            file_id: file_id.clone(),
            bytes_sent,
        };
        let encoded = encode_message(&complete).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        secure_socket.write_frame(&encoded).await?;

        Ok(file_id)
    }

    pub async fn pair_with_peer(
        &self,
        host: &str,
        port: u16,
        device: Device,
    ) -> std::io::Result<bool> {
        let socket = TcpStream::connect((host, port)).await?;

        let expected_peer = ExpectedPeerIdentity {
            device_id: Some(device.device_id.clone()),
            trust_fingerprint: device.trust_fingerprint.clone(),
            trust_public_key: Some(device.trust_public_key.clone()),
        };
        let mut secure_socket =
            secure_connect(socket, self.self_device.clone(), expected_peer, None).await?;

        let request_id = Uuid::new_v4().to_string();
        let from_device = FromDevice {
            device_id: self.self_device.device_id.clone(),
            name: self.self_device.name.clone(),
            trust_fingerprint: self.self_device.trust_fingerprint.clone(),
            trust_public_key: self.self_device.trust_public_key.clone(),
            port: Some(port),
            platform: None,
            version: Some("1".to_string()),
            has_avatar: Some(false),
            profile_revision: Some(1),
        };

        let timestamp = now_ms();

        let pair_msg = PairRequestMessage {
            msg_type: "pair-request".to_string(),
            version: 1,
            request_id: request_id.clone(),
            timestamp,
            from_device: from_device.clone(),
            signature: None,
        };
        let signature = sign_pair_request(&pair_msg, &self.self_device.trust_private_key);

        let request = ProtocolMessage::PairRequest {
            version: 1,
            request_id,
            timestamp,
            from_device,
            signature: Some(signature),
        };

        let encoded = encode_message(&request).map_err(|e| {
            std::io::Error::new(std::io::ErrorKind::Other, format!("encode failed: {}", e))
        })?;
        secure_socket.write_frame(&encoded).await?;

        // 等待响应
        let response_frame = secure_socket.read_frame().await?;
        let mut decoder = MessageDecoder::new();
        let messages = decoder.push(&response_frame).unwrap_or_default();

        for msg in messages {
            if let ProtocolMessage::PairResponse {
                request_id: _,
                accepted,
            } = msg
            {
                return Ok(accepted);
            }
        }

        Ok(false)
    }
}
