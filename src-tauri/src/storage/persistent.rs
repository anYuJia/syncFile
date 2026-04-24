//! 持久化设置存储
//! 管理应用设置、可信设备、传输历史等数据的持久化

use crate::commands::{Settings, TransferRecord, TrustedDevice};
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PersistentSettings {
    #[serde(default)]
    pub max_sandbox_size_mb: u64,
    #[serde(default)]
    pub auto_accept: bool,
    #[serde(default)]
    pub auto_accept_max_size_mb: u64,
    #[serde(default)]
    pub open_received_folder: bool,
    #[serde(default)]
    pub trusted_devices: Vec<TrustedDevice>,
    #[serde(default)]
    pub desktop_notifications: bool,
    #[serde(default)]
    pub sandbox_location: Option<String>,
    #[serde(default)]
    pub transfer_history: Vec<TransferRecord>,
    #[serde(default)]
    pub version: u32,
}

impl From<PersistentSettings> for Settings {
    fn from(persistent: PersistentSettings) -> Self {
        Settings {
            max_sandbox_size_mb: if persistent.max_sandbox_size_mb == 0 {
                1024
            } else {
                persistent.max_sandbox_size_mb
            },
            auto_accept: persistent.auto_accept,
            auto_accept_max_size_mb: if persistent.auto_accept_max_size_mb == 0 {
                64
            } else {
                persistent.auto_accept_max_size_mb
            },
            open_received_folder: persistent.open_received_folder,
            trusted_devices: persistent.trusted_devices,
            desktop_notifications: persistent.desktop_notifications,
            sandbox_location: persistent.sandbox_location,
        }
    }
}

impl From<Settings> for PersistentSettings {
    fn from(settings: Settings) -> Self {
        PersistentSettings {
            max_sandbox_size_mb: settings.max_sandbox_size_mb,
            auto_accept: settings.auto_accept,
            auto_accept_max_size_mb: settings.auto_accept_max_size_mb,
            open_received_folder: settings.open_received_folder,
            trusted_devices: settings.trusted_devices,
            desktop_notifications: settings.desktop_notifications,
            sandbox_location: settings.sandbox_location,
            transfer_history: Vec::new(),
            version: 1,
        }
    }
}

/// 加载持久化设置
pub fn load_settings(data_dir: &Path) -> PersistentSettings {
    let path = data_dir.join("settings.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(settings) = serde_json::from_str::<PersistentSettings>(&content) {
            return settings;
        }
    }
    PersistentSettings {
        max_sandbox_size_mb: 1024,
        auto_accept: false,
        auto_accept_max_size_mb: 64,
        open_received_folder: false,
        desktop_notifications: true,
        version: 1,
        ..Default::default()
    }
}

/// 保存持久化设置
pub fn save_settings(data_dir: &Path, settings: &PersistentSettings) -> std::io::Result<()> {
    let path = data_dir.join("settings.json");
    let json = serde_json::to_string_pretty(settings)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// 加载传输历史
pub fn load_transfer_history(data_dir: &Path) -> Vec<TransferRecord> {
    let path = data_dir.join("transfer_history.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(history) = serde_json::from_str::<Vec<TransferRecord>>(&content) {
            return history;
        }
    }
    Vec::new()
}

/// 保存传输历史
pub fn save_transfer_history(data_dir: &Path, history: &[TransferRecord]) -> std::io::Result<()> {
    let path = data_dir.join("transfer_history.json");
    let json = serde_json::to_string_pretty(history)?;
    std::fs::write(path, json)?;
    Ok(())
}

/// 添加传输记录
pub fn add_transfer_record(data_dir: &Path, record: TransferRecord) -> std::io::Result<()> {
    let mut history = load_transfer_history(data_dir);
    history.insert(0, record);
    // 保留最近 500 条记录
    history.truncate(500);
    save_transfer_history(data_dir, &history)
}
