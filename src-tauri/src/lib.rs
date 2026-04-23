pub mod discovery;
pub mod transfer;
pub mod storage;
pub mod security;
pub mod commands;

use commands::AppStateInner;
use discovery::mdns_service::MdnsService;
use discovery::device_registry::DeviceRegistry;
use storage::sandbox::Sandbox;
use storage::device_identity::{load_or_create_identity, DeviceIdentity};
use transfer::tcp::{TcpClient, TcpServer};
use transfer::secure_channel::SecureIdentity;
use std::sync::Arc;
use tokio::sync::RwLock;
use tauri::{Emitter, Manager};

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
    let sandbox_path = data_dir.join("sandbox");
    let _ = std::fs::create_dir_all(&sandbox_path);

    let identity = load_or_create_identity(&data_dir);
    let device_registry = Arc::new(RwLock::new(DeviceRegistry::new()));

    // Start mDNS service
    let mut mdns_service = MdnsService::new(
        device_registry.clone(),
        identity.device_id.clone(),
        identity.name.clone(),
        43434,
        std::env::consts::OS.to_string(),
        identity.trust_fingerprint.clone(),
        false,
        1,
    );

    let _ = mdns_service.start();

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
        identity: Arc::new(RwLock::new(identity)),
        sandbox_path: RwLock::new(sandbox_path.clone()),
        settings: RwLock::new(commands::Settings {
            trusted_devices: Vec::new(),
            desktop_notifications: true,
            sandbox_location: None,
        }),
        pending_offers: RwLock::new(Vec::new()),
        transfer_history: RwLock::new(Vec::new()),
        runtime_logs: RwLock::new(Vec::new()),
        pair_requests: RwLock::new(Vec::new()),
        trusted_devices: RwLock::new(Vec::new()),
    });

    // Start TCP server
    let tcp_server = TcpServer::new(
        app_handle.clone(),
        state.clone(),
        sandbox_path,
        secure_identity,
    );
    if let Err(e) = tcp_server.listen(43434).await {
        eprintln!("Failed to start TCP server: {}", e);
    }

    app_handle.manage(state);
}
