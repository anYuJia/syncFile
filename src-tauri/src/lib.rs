pub mod commands;
pub mod discovery;
pub mod security;
pub mod storage;
pub mod transfer;

use commands::AppStateInner;
use discovery::device_registry::DeviceRegistry;
use discovery::mdns_service::MdnsService;
use std::sync::Arc;
use storage::device_identity::load_or_create_identity;
use storage::persistent::{load_settings, load_transfer_history};
use storage::sandbox::Sandbox;
use tauri::Manager;
use tokio::sync::{Mutex, RwLock};
use transfer::secure_channel::SecureIdentity;
use transfer::tcp::TcpServer;

pub type AppState = Arc<AppStateInner>;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                bootstrap(app_handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_devices,
            commands::refresh_devices,
            commands::get_self_device,
            commands::probe_device,
            commands::fetch_peer_profile,
            commands::pair_device,
            commands::accept_pair_request,
            commands::reject_pair_request,
            commands::get_transfer_history,
            commands::get_pending_offers,
            commands::send_file,
            commands::pause_transfer,
            commands::cancel_transfer,
            commands::accept_incoming,
            commands::reject_incoming,
            commands::clear_transfer_history,
            commands::remove_transfer_history_items,
            commands::open_sandbox,
            commands::open_transfer_path,
            commands::reveal_transfer_path,
            commands::get_sandbox_location,
            commands::choose_sandbox_location,
            commands::clear_resume_cache,
            commands::get_settings,
            commands::save_settings,
            commands::save_profile,
            commands::get_runtime_logs,
            commands::clear_runtime_logs,
            commands::select_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn bootstrap(app_handle: tauri::AppHandle) {
    let data_dir = app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("./data"));

    let _ = std::fs::create_dir_all(&data_dir);

    let identity = load_or_create_identity(&data_dir);
    let persistent_settings = load_settings(&data_dir);
    let trusted_devices = persistent_settings.trusted_devices.clone();
    let sandbox_path = persistent_settings
        .sandbox_location
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(|| data_dir.join("sandbox"));
    let sandbox = Sandbox::new(sandbox_path.clone());
    let mut transfer_history = load_transfer_history(&data_dir);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    for record in &mut transfer_history {
        if record.direction == "send" && matches!(record.status.as_str(), "pending" | "in-progress")
        {
            record.status = "failed".to_string();
            record.error =
                Some("App restarted before transfer completion. Retry to continue.".to_string());
            record.updated_at = now;
        }
    }
    for resume in sandbox.list_resume_entries() {
        if transfer_history
            .iter()
            .any(|record| record.transfer_id == resume.file_id)
        {
            continue;
        }
        transfer_history.push(commands::TransferRecord {
            transfer_id: resume.file_id,
            batch_id: None,
            batch_label: None,
            direction: "receive".to_string(),
            file_name: resume.file_name,
            file_size: resume.file_size,
            bytes_transferred: resume.bytes_received,
            peer_device_name: Some(resume.device_name),
            peer_device_id: Some(resume.device_id),
            status: "failed".to_string(),
            receive_mode: Some("manual".to_string()),
            local_path: Some(resume.partial_path),
            source_file_modified_at: None,
            source_file_sha256: Some(resume.sha256),
            error: Some("Partial receive cached. Sender retry can resume.".to_string()),
            updated_at: now,
        });
    }
    let device_registry = Arc::new(RwLock::new(DeviceRegistry::new()));

    // Start mDNS service
    let mdns_service = MdnsService::new(
        device_registry.clone(),
        identity.device_id.clone(),
        identity.name.clone(),
        43434,
        std::env::consts::OS.to_string(),
        identity.trust_fingerprint.clone(),
        identity.trust_public_key.clone(),
        identity.avatar_data_url.is_some(),
        identity.profile_revision,
    );
    let mdns_service = Arc::new(Mutex::new(mdns_service));

    // Create secure identity for TCP server
    let secure_identity = SecureIdentity {
        device_id: identity.device_id.clone(),
        name: identity.name.clone(),
        trust_fingerprint: identity.trust_fingerprint.clone(),
        trust_public_key: identity.trust_public_key.clone(),
        trust_private_key: identity.trust_private_key.clone(),
    };

    let state = Arc::new(AppStateInner {
        device_registry,
        mdns_service: mdns_service.clone(),
        identity: Arc::new(RwLock::new(identity)),
        sandbox: sandbox.clone(),
        settings: RwLock::new(commands::Settings {
            max_sandbox_size_mb: persistent_settings.max_sandbox_size_mb,
            auto_accept: persistent_settings.auto_accept,
            auto_accept_max_size_mb: persistent_settings.auto_accept_max_size_mb,
            open_received_folder: persistent_settings.open_received_folder,
            trusted_devices: trusted_devices.clone(),
            desktop_notifications: persistent_settings.desktop_notifications,
            sandbox_location: persistent_settings.sandbox_location,
        }),
        pending_offers: RwLock::new(Vec::new()),
        pending_pair_responses: RwLock::new(std::collections::HashMap::new()),
        transfer_history: RwLock::new(transfer_history),
        runtime_logs: RwLock::new(Vec::new()),
        pair_requests: RwLock::new(Vec::new()),
        trusted_devices: RwLock::new(trusted_devices),
        inbound_cancel_transfers: RwLock::new(std::collections::HashSet::new()),
        outbound_transfer_controls: RwLock::new(std::collections::HashMap::new()),
        data_dir: RwLock::new(data_dir),
        app_handle: app_handle.clone(),
    });

    app_handle.manage(state.clone());

    // Start mDNS service
    if let Err(error) = mdns_service.lock().await.start(app_handle.clone()) {
        eprintln!("Failed to start mDNS service: {}", error);
    }

    // Start TCP server
    let tcp_server = TcpServer::new(app_handle.clone(), state.clone(), sandbox, secure_identity);
    if let Err(e) = tcp_server.listen(43434).await {
        eprintln!("Failed to start TCP server: {}", e);
    }
}
