use crate::commands::Device;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone, Serialize, Deserialize)]
pub struct DeviceEntry {
    pub device: Device,
    pub last_seen_at: u64,
    pub persistent: bool,
    pub online: bool,
}

pub struct DeviceRegistry {
    devices: Arc<RwLock<HashMap<String, DeviceEntry>>>,
}

impl DeviceRegistry {
    pub fn new() -> Self {
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn upsert(&self, device: Device) {
        self.write(device, Self::now(), false).await;
    }

    pub async fn upsert_persistent(&self, device: Device) {
        self.write(device, Self::now(), true).await;
    }

    pub async fn remove(&self, device_id: &str, preserve_persistent: bool) {
        let mut devices = self.devices.write().await;
        if let Some(entry) = devices.get_mut(device_id) {
            if entry.persistent && preserve_persistent {
                entry.online = false;
                return;
            }
            devices.remove(device_id);
        }
    }

    pub async fn list(&self) -> Vec<Device> {
        let devices = self.devices.read().await;
        devices
            .values()
            .filter(|entry| entry.online)
            .map(|entry| entry.device.clone())
            .collect()
    }

    pub async fn list_all(&self) -> Vec<Device> {
        let devices = self.devices.read().await;
        devices.values().map(|entry| entry.device.clone()).collect()
    }

    pub async fn clear(&self, preserve_persistent: bool) {
        if !preserve_persistent {
            self.devices.write().await.clear();
            return;
        }

        let mut devices = self.devices.write().await;
        let mut to_update = Vec::new();
        devices.retain(|id, entry| {
            if entry.persistent {
                if entry.online {
                    to_update.push(id.clone());
                }
                true
            } else {
                false
            }
        });

        for id in to_update {
            if let Some(entry) = devices.get_mut(&id) {
                entry.online = false;
            }
        }
    }

    pub async fn prune_older_than(&self, cutoff_time: u64) -> Vec<String> {
        let mut devices = self.devices.write().await;
        let mut removed_ids = Vec::new();

        devices.retain(|id, entry| {
            if entry.last_seen_at >= cutoff_time {
                return true;
            }
            if entry.persistent {
                entry.online = false;
                return true;
            }
            removed_ids.push(id.clone());
            false
        });

        removed_ids
    }

    async fn write(&self, device: Device, seen_at: u64, persistent: bool) {
        let mut devices = self.devices.write().await;
        let previous_entry = devices.get(&device.device_id).cloned();
        let was_online = previous_entry.as_ref().map(|e| e.online).unwrap_or(false);
        let is_persistent = persistent
            || previous_entry
                .as_ref()
                .map(|e| e.persistent)
                .unwrap_or(false);
        let online = if persistent { was_online } else { true };

        devices.insert(
            device.device_id.clone(),
            DeviceEntry {
                device,
                last_seen_at: seen_at,
                persistent: is_persistent,
                online,
            },
        );
    }

    pub async fn probe_device(&self, device_id: &str) -> String {
        let devices = self.devices.read().await;
        if let Some(entry) = devices.get(device_id) {
            if entry.online {
                "reachable".to_string()
            } else {
                "offline".to_string()
            }
        } else {
            "unknown".to_string()
        }
    }

    pub async fn refresh(&self) {
        // TODO: Trigger mDNS refresh
    }

    fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    }
}

impl Default for DeviceRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::DeviceRegistry;
    use crate::commands::Device;
    use tokio::time::{timeout, Duration};

    fn test_device(device_id: &str) -> Device {
        Device {
            device_id: device_id.to_string(),
            name: "Peer".to_string(),
            avatar_data_url: None,
            has_avatar: None,
            profile_revision: None,
            trust_fingerprint: "ABCD-EFGH-IJKL-MNOP".to_string(),
            trust_public_key: "public-key".to_string(),
            host: "peer.local".to_string(),
            address: "192.168.1.2".to_string(),
            port: 43434,
            platform: "test".to_string(),
            version: "1".to_string(),
        }
    }

    #[tokio::test]
    async fn removing_persistent_device_with_preserve_marks_offline_without_deadlock() {
        let registry = DeviceRegistry::new();
        registry.upsert_persistent(test_device("device-1")).await;

        timeout(
            Duration::from_millis(100),
            registry.remove("device-1", true),
        )
        .await
        .expect("remove should not deadlock");

        assert!(registry.list().await.is_empty());
        assert_eq!(registry.list_all().await.len(), 1);
    }

    #[tokio::test]
    async fn live_discovery_brings_cached_persistent_device_back_online() {
        let registry = DeviceRegistry::new();
        registry.upsert_persistent(test_device("device-1")).await;
        registry.remove("device-1", true).await;

        assert!(registry.list().await.is_empty());

        registry.upsert(test_device("device-1")).await;

        assert_eq!(registry.list().await.len(), 1);
    }
}
