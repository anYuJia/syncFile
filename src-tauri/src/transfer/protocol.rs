use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum ProtocolMessage {
    #[serde(rename = "file-offer")]
    FileOffer {
        version: u32,
        file_id: String,
        file_name: String,
        file_size: u64,
        mime_type: Option<String>,
        sha256: Option<String>,
        from_device: FromDevice,
        #[serde(skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
    #[serde(rename = "file-accept")]
    FileAccept {
        file_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        start_offset: Option<u64>,
    },
    #[serde(rename = "file-reject")]
    FileReject { file_id: String, reason: String },
    #[serde(rename = "file-complete")]
    FileComplete { file_id: String, bytes_sent: u64 },
    #[serde(rename = "file-cancel")]
    FileCancel { file_id: String, reason: String },
    #[serde(rename = "profile-request")]
    ProfileRequest,
    #[serde(rename = "profile-response")]
    ProfileResponse {
        device_id: String,
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        avatar_data_url: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        has_avatar: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        profile_revision: Option<u32>,
    },
    #[serde(rename = "pair-request")]
    PairRequest {
        version: u32,
        request_id: String,
        timestamp: u64,
        from_device: FromDevice,
        #[serde(skip_serializing_if = "Option::is_none")]
        signature: Option<String>,
    },
    #[serde(rename = "pair-response")]
    PairResponse {
        request_id: String,
        accepted: bool,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FromDevice {
    pub device_id: String,
    pub name: String,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub has_avatar: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_revision: Option<u32>,
}

// Pair request message for signing/verification
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequestMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub version: u32,
    pub request_id: String,
    pub timestamp: u64,
    pub from_device: FromDevice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

// Legacy struct aliases for tcp.rs
pub type DeviceInfo = FromDevice;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileOfferMessage {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub version: u32,
    pub file_id: String,
    pub file_name: String,
    pub file_size: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    pub from_device: FromDevice,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileAcceptMessage {
    #[serde(rename = "type")]
    pub r#type: String,
    pub file_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_offset: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileRejectMessage {
    #[serde(rename = "type")]
    pub r#type: String,
    pub file_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCancelMessage {
    #[serde(rename = "type")]
    pub r#type: String,
    pub file_id: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileCompleteMessage {
    #[serde(rename = "type")]
    pub r#type: String,
    pub file_id: String,
    pub bytes_sent: u64,
}
