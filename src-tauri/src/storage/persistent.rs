//! 持久化设置存储
//! 管理应用设置、可信设备、传输历史等数据的持久化

use crate::commands::{Settings, TransferRecord, TrustedDevice};
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

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
    save_json_atomic(&path, settings)
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
    save_json_atomic(&path, &history)
}

/// 添加传输记录
pub fn add_transfer_record(data_dir: &Path, record: TransferRecord) -> std::io::Result<()> {
    let mut history = load_transfer_history(data_dir);
    history.insert(0, record);
    // 保留最近 500 条记录
    history.truncate(500);
    save_transfer_history(data_dir, &history)
}

pub fn save_json_atomic<T: Serialize + ?Sized>(path: &Path, value: &T) -> std::io::Result<()> {
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(parent)?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("data.json");
    let tmp_path = parent.join(format!(
        ".{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));

    let json = serde_json::to_vec_pretty(value)?;
    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(&json)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
    }

    #[cfg(target_os = "windows")]
    if path.exists() {
        std::fs::remove_file(path)?;
    }

    if let Err(error) = std::fs::rename(&tmp_path, path) {
        let _ = std::fs::remove_file(&tmp_path);
        return Err(error);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persistent_settings_conversion_applies_runtime_defaults() {
        let settings = Settings::from(PersistentSettings {
            max_sandbox_size_mb: 0,
            auto_accept_max_size_mb: 0,
            ..Default::default()
        });

        assert_eq!(settings.max_sandbox_size_mb, 1024);
        assert_eq!(settings.auto_accept_max_size_mb, 64);
    }

    #[test]
    fn save_json_atomic_writes_parseable_json() {
        let root = std::env::temp_dir().join(format!("syncfile-test-{}", uuid::Uuid::new_v4()));
        let path = root.join("settings.json");
        let settings = PersistentSettings {
            max_sandbox_size_mb: 256,
            auto_accept_max_size_mb: 8,
            ..Default::default()
        };

        save_json_atomic(&path, &settings).expect("save settings");

        let loaded: PersistentSettings =
            serde_json::from_str(&std::fs::read_to_string(&path).expect("read settings"))
                .expect("parse settings");
        assert_eq!(loaded.max_sandbox_size_mb, 256);
        assert_eq!(loaded.auto_accept_max_size_mb, 8);

        let leftovers = std::fs::read_dir(&root)
            .expect("read temp dir")
            .flatten()
            .filter(|entry| entry.file_name().to_string_lossy().ends_with(".tmp"))
            .count();
        assert_eq!(leftovers, 0);

        let _ = std::fs::remove_dir_all(root);
    }
}
