use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone)]
pub struct Sandbox {
    root: Arc<RwLock<PathBuf>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IncomingResumeMeta {
    pub file_id: String,
    pub device_id: String,
    pub device_name: String,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub final_path: String,
    pub partial_path: String,
}

#[derive(Debug, Clone)]
pub struct IncomingResumeInfo {
    pub partial_path: PathBuf,
    pub final_path: PathBuf,
    pub bytes_received: u64,
}

#[derive(Debug, Clone, Copy)]
pub struct IncomingResumeRequest<'a> {
    pub file_id: &'a str,
    pub device_id: &'a str,
    pub device_name: &'a str,
    pub trust_fingerprint: &'a str,
    pub trust_public_key: &'a str,
    pub file_name: &'a str,
    pub file_size: u64,
    pub sha256: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeCacheEntry {
    pub file_id: String,
    pub device_id: String,
    pub device_name: String,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub file_name: String,
    pub file_size: u64,
    pub sha256: String,
    pub partial_path: String,
    pub final_path: String,
    pub bytes_received: u64,
}

impl Sandbox {
    pub fn new(root: PathBuf) -> Self {
        let _ = std::fs::create_dir_all(&root);
        Self {
            root: Arc::new(RwLock::new(root)),
        }
    }

    pub fn root_path(&self) -> PathBuf {
        self.root.read().unwrap().clone()
    }

    pub fn set_root(&self, root: PathBuf) {
        let _ = std::fs::create_dir_all(&root);
        *self.root.write().unwrap() = root;
    }

    pub fn resolve_path(&self, device_id: &str, original_name: &str) -> PathBuf {
        let device_dir = self.root_path().join(device_id);
        let _ = std::fs::create_dir_all(&device_dir);

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let sanitized = original_name.replace(['/', '\\'], "_");

        let filename = format!("{}_{}", timestamp, sanitized);
        device_dir.join(filename)
    }

    pub fn ensure_device_dir(&self, device_id: &str) -> PathBuf {
        let dir = self.root_path().join(device_id);
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    pub fn directory_for_incoming(&self, device_id: &str) -> PathBuf {
        let safe_id = sanitize_segment(device_id);
        let dir = self.root_path().join(&safe_id);
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    pub fn path_for_incoming(&self, device_id: &str, original_file_name: &str) -> PathBuf {
        let device_dir = self.directory_for_incoming(device_id);
        let safe_name = sanitize_segment(
            std::path::Path::new(original_file_name)
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unnamed"),
        );
        let stamp = format_timestamp(SystemTime::now());
        device_dir.join(format!("{}_{}", stamp, safe_name))
    }

    pub fn prepare_incoming_resume(
        &self,
        request: IncomingResumeRequest<'_>,
    ) -> IncomingResumeInfo {
        if let Some(existing) = self.read_incoming_resume_meta(request.file_id) {
            if is_matching_incoming_resume(&existing, &request) {
                if let Ok(meta) = std::fs::metadata(&existing.partial_path) {
                    return IncomingResumeInfo {
                        partial_path: PathBuf::from(&existing.partial_path),
                        final_path: PathBuf::from(&existing.final_path),
                        bytes_received: meta.len(),
                    };
                }
            }
        }

        let final_path = self.path_for_incoming(request.device_id, request.file_name);
        let partial_path = final_path.with_extension("part");
        let meta = IncomingResumeMeta {
            file_id: request.file_id.to_string(),
            device_id: request.device_id.to_string(),
            device_name: request.device_name.to_string(),
            trust_fingerprint: request.trust_fingerprint.to_string(),
            trust_public_key: request.trust_public_key.to_string(),
            file_name: request.file_name.to_string(),
            file_size: request.file_size,
            sha256: request.sha256.to_string(),
            final_path: final_path.to_string_lossy().to_string(),
            partial_path: partial_path.to_string_lossy().to_string(),
        };
        self.write_incoming_resume_meta(&meta);

        IncomingResumeInfo {
            partial_path,
            final_path,
            bytes_received: 0,
        }
    }

    pub fn complete_incoming_resume(&self, file_id: &str) -> Result<PathBuf, String> {
        let meta = self
            .read_incoming_resume_meta(file_id)
            .ok_or_else(|| format!("resume state {} not found", file_id))?;
        fs::rename(&meta.partial_path, &meta.final_path)
            .map_err(|e| format!("failed to rename: {}", e))?;
        let _ = fs::remove_file(self.resume_meta_path(file_id));
        Ok(PathBuf::from(&meta.final_path))
    }

    pub fn discard_incoming_resume(&self, file_id: &str, remove_partial: bool) {
        if let Some(meta) = self.read_incoming_resume_meta(file_id) {
            if remove_partial {
                let _ = fs::remove_file(&meta.partial_path);
            }
            let _ = fs::remove_file(self.resume_meta_path(file_id));
        }
    }

    pub fn incoming_resume_offset(&self, file_id: &str) -> u64 {
        let meta = match self.read_incoming_resume_meta(file_id) {
            Some(m) => m,
            None => return 0,
        };
        if let Ok(m) = std::fs::metadata(&meta.partial_path) {
            m.len()
        } else {
            0
        }
    }

    pub fn has_incoming_resume(&self, file_id: &str) -> bool {
        self.read_incoming_resume_meta(file_id).is_some()
    }

    pub fn list_resume_entries(&self) -> Vec<ResumeCacheEntry> {
        let resume_dir = self.resume_directory_path();
        if !resume_dir.exists() {
            return Vec::new();
        }

        let mut entries = Vec::new();
        if let Ok(dir) = std::fs::read_dir(resume_dir) {
            for entry in dir.flatten() {
                let path = entry.path();
                if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                    continue;
                }
                let file_id = match path.file_stem().and_then(|stem| stem.to_str()) {
                    Some(id) => id,
                    None => continue,
                };
                let Some(meta) = self.read_incoming_resume_meta(file_id) else {
                    continue;
                };
                let Ok(partial_meta) = std::fs::metadata(&meta.partial_path) else {
                    continue;
                };
                entries.push(ResumeCacheEntry {
                    file_id: meta.file_id,
                    device_id: meta.device_id,
                    device_name: meta.device_name,
                    trust_fingerprint: meta.trust_fingerprint,
                    trust_public_key: meta.trust_public_key,
                    file_name: meta.file_name,
                    file_size: meta.file_size,
                    sha256: meta.sha256,
                    partial_path: meta.partial_path,
                    final_path: meta.final_path,
                    bytes_received: partial_meta.len(),
                });
            }
        }

        entries
    }

    pub fn clear_resume_cache(&self, excluded_file_ids: &HashSet<String>) -> Vec<String> {
        let mut cleared = Vec::new();
        for entry in self.list_resume_entries() {
            if excluded_file_ids.contains(&entry.file_id) {
                continue;
            }
            self.discard_incoming_resume(&entry.file_id, true);
            cleared.push(entry.file_id);
        }
        cleared
    }

    pub fn current_usage_bytes(&self) -> u64 {
        dir_size(&self.root_path())
    }

    fn resume_meta_path(&self, file_id: &str) -> PathBuf {
        let resume_dir = self.resume_directory_path();
        let _ = std::fs::create_dir_all(&resume_dir);
        resume_dir.join(format!("{}.json", sanitize_segment(file_id)))
    }

    fn resume_directory_path(&self) -> PathBuf {
        self.root_path().join(".resume")
    }

    fn read_incoming_resume_meta(&self, file_id: &str) -> Option<IncomingResumeMeta> {
        let path = self.resume_meta_path(file_id);
        let content = std::fs::read_to_string(&path).ok()?;
        serde_json::from_str(&content).ok()
    }

    fn write_incoming_resume_meta(&self, meta: &IncomingResumeMeta) {
        let path = self.resume_meta_path(&meta.file_id);
        if let Ok(json) = serde_json::to_string_pretty(meta) {
            let _ = std::fs::write(path, json);
        }
    }
}

fn sanitize_segment(input: &str) -> String {
    let result: String = input
        .chars()
        .map(|c| match c {
            '/' | '\\' | '\0' => '_',
            c => c,
        })
        .collect();
    let trimmed = result.trim_start_matches('.');
    if trimmed.is_empty() {
        "unnamed".to_string()
    } else {
        trimmed.to_string()
    }
}

fn is_matching_incoming_resume(
    existing: &IncomingResumeMeta,
    request: &IncomingResumeRequest<'_>,
) -> bool {
    existing.device_id == request.device_id
        && existing.device_name == request.device_name
        && existing.trust_fingerprint == request.trust_fingerprint
        && existing.trust_public_key == request.trust_public_key
        && existing.file_name == request.file_name
        && existing.file_size == request.file_size
        && existing.sha256 == request.sha256
}

fn format_timestamp(time: SystemTime) -> String {
    let dur = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs();
    let tm = time::OffsetDateTime::from_unix_timestamp(secs as i64)
        .unwrap_or(time::OffsetDateTime::UNIX_EPOCH);
    format!(
        "{:04}{:02}{:02}_{:02}{:02}{:02}",
        tm.year(),
        tm.month() as u8,
        tm.day(),
        tm.hour(),
        tm.minute(),
        tm.second()
    )
}

fn dir_size(path: &PathBuf) -> u64 {
    let Ok(metadata) = std::fs::metadata(path) else {
        return 0;
    };
    if metadata.is_file() {
        return metadata.len();
    }

    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            total += dir_size(&entry.path());
        }
    }
    total
}

#[cfg(test)]
mod tests {
    use super::{IncomingResumeRequest, Sandbox};
    use uuid::Uuid;

    fn temp_sandbox() -> (Sandbox, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("syncfile-test-{}", Uuid::new_v4()));
        (Sandbox::new(root.clone()), root)
    }

    #[test]
    fn prepare_incoming_resume_returns_existing_partial_offset() {
        let (sandbox, root) = temp_sandbox();
        let file_id = "file-1";

        let request = IncomingResumeRequest {
            file_id,
            device_id: "device-1",
            device_name: "Peer",
            trust_fingerprint: "fingerprint",
            trust_public_key: "public-key",
            file_name: "photo.jpg",
            file_size: 10,
            sha256: "sha",
        };

        let first = sandbox.prepare_incoming_resume(request);
        std::fs::write(&first.partial_path, b"abc").expect("write partial file");

        let resumed = sandbox.prepare_incoming_resume(request);

        assert_eq!(resumed.bytes_received, 3);
        assert_eq!(resumed.partial_path, first.partial_path);

        let _ = std::fs::remove_dir_all(root);
    }
}
