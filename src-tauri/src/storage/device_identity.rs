use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub name: String,
    pub avatar_data_url: Option<String>,
    pub profile_revision: u32,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub trust_private_key: String,
}

pub fn load_or_create_identity(data_dir: &Path) -> DeviceIdentity {
    let path = data_dir.join("identity.json");
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(identity) = serde_json::from_str::<DeviceIdentity>(&content) {
            return identity;
        }
    }

    let identity = generate_identity();
    if let Ok(json) = serde_json::to_string_pretty(&identity) {
        let _ = std::fs::write(path, json);
    }
    identity
}

fn generate_identity() -> DeviceIdentity {
    let device_id = Uuid::new_v4().to_string();
    let hostname = hostname::get()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|_| "syncfile-device".to_string());

    DeviceIdentity {
        device_id,
        name: hostname,
        avatar_data_url: None,
        profile_revision: 1,
        trust_fingerprint: String::new(),
        trust_public_key: String::new(),
        trust_private_key: String::new(),
    }
}
