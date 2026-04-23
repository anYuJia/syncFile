use ring::digest::{digest, SHA256};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey as EdUnparsedPublicKey, ED25519};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::transfer::protocol::{FileOfferMessage, PairRequestMessage, FromDevice};

use base64::Engine;

pub const PAIR_REQUEST_MAX_AGE_MS: u64 = 5 * 60 * 1000;
pub const PAIR_REQUEST_MAX_FUTURE_SKEW_MS: u64 = 30 * 1000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrustKeypair {
    pub public_key: String,
    pub private_key: String,
    pub fingerprint: String,
}

pub fn create_trust_keypair() -> TrustKeypair {
    let rng = SystemRandom::new();
    let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng).unwrap();
    let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).unwrap();

    let public_key_der = key_pair.public_key().as_ref();
    let public_key_b64 = base64::engine::general_purpose::STANDARD.encode(public_key_der);
    let private_key_b64 = base64::engine::general_purpose::STANDARD.encode(pkcs8.as_ref());

    TrustKeypair {
        public_key: public_key_b64.clone(),
        private_key: private_key_b64,
        fingerprint: fingerprint_for_public_key(&public_key_b64),
    }
}

pub fn fingerprint_for_public_key(public_key: &str) -> String {
    let digest = digest(&SHA256, public_key.as_bytes());
    let hex = hex::encode(digest.as_ref()).to_uppercase();
    format!(
        "{}-{}-{}-{}",
        &hex[0..4],
        &hex[4..8],
        &hex[8..12],
        &hex[12..16]
    )
}

pub fn sign_payload(payload: &str, private_key: &str) -> String {
    let private_key_der = base64::engine::general_purpose::STANDARD.decode(private_key).unwrap();
    let key_pair = Ed25519KeyPair::from_pkcs8(&private_key_der).unwrap();
    let signature = key_pair.sign(payload.as_bytes());
    base64::engine::general_purpose::STANDARD.encode(signature.as_ref())
}

pub fn verify_payload(payload: &str, signature: &str, public_key: &str) -> bool {
    let public_key_der = match base64::engine::general_purpose::STANDARD.decode(public_key) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let signature_bytes = match base64::engine::general_purpose::STANDARD.decode(signature) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let public_key = EdUnparsedPublicKey::new(&ED25519, &public_key_der);
    public_key.verify(payload.as_bytes(), &signature_bytes).is_ok()
}

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

pub fn is_pair_request_timely(timestamp: u64) -> bool {
    let now = now_ms();
    if timestamp < now - PAIR_REQUEST_MAX_AGE_MS {
        return false;
    }
    if timestamp > now + PAIR_REQUEST_MAX_FUTURE_SKEW_MS {
        return false;
    }
    true
}

fn device_info_to_json(from_device: &FromDevice) -> serde_json::Value {
    json!({
        "deviceId": from_device.device_id,
        "name": from_device.name,
        "trustFingerprint": from_device.trust_fingerprint,
        "trustPublicKey": from_device.trust_public_key,
    })
}

fn file_offer_payload(
    version: u32,
    file_id: &str,
    file_name: &str,
    file_size: u64,
    mime_type: &Option<String>,
    sha256: &Option<String>,
    from_device: &FromDevice,
) -> String {
    let json_val = json!({
        "version": version,
        "fileId": file_id,
        "fileName": file_name,
        "fileSize": file_size,
        "mimeType": mime_type.as_ref().unwrap_or(&String::new()),
        "sha256": sha256.as_ref().unwrap_or(&String::new()),
        "fromDevice": device_info_to_json(from_device),
    });
    json_val.to_string()
}

pub fn sign_file_offer(offer: &FileOfferMessage, private_key: &str) -> String {
    let payload = file_offer_payload(
        offer.version,
        &offer.file_id,
        &offer.file_name,
        offer.file_size as u64,
        &offer.mime_type,
        &offer.sha256,
        &offer.from_device,
    );
    sign_payload(&payload, private_key)
}

pub fn verify_file_offer(offer: &FileOfferMessage) -> bool {
    if offer.signature.is_none() {
        return false;
    }
    let actual_fp = fingerprint_for_public_key(&offer.from_device.trust_public_key);
    if actual_fp != offer.from_device.trust_fingerprint {
        return false;
    }
    let payload = file_offer_payload(
        offer.version,
        &offer.file_id,
        &offer.file_name,
        offer.file_size as u64,
        &offer.mime_type,
        &offer.sha256,
        &offer.from_device,
    );
    verify_payload(
        &payload,
        offer.signature.as_ref().unwrap(),
        &offer.from_device.trust_public_key,
    )
}

fn pair_request_payload(
    version: u32,
    request_id: &str,
    timestamp: u64,
    from_device: &FromDevice,
) -> String {
    let json_val = json!({
        "version": version,
        "requestId": request_id,
        "timestamp": timestamp,
        "fromDevice": device_info_to_json(from_device),
    });
    json_val.to_string()
}

pub fn sign_pair_request(request: &PairRequestMessage, private_key: &str) -> String {
    let payload = pair_request_payload(
        request.version,
        &request.request_id,
        request.timestamp,
        &request.from_device,
    );
    sign_payload(&payload, private_key)
}

pub fn verify_pair_request(request: &PairRequestMessage) -> bool {
    if request.signature.is_none() {
        return false;
    }
    if !is_pair_request_timely(request.timestamp) {
        return false;
    }
    let actual_fp = fingerprint_for_public_key(&request.from_device.trust_public_key);
    if actual_fp != request.from_device.trust_fingerprint {
        return false;
    }
    let payload = pair_request_payload(
        request.version,
        &request.request_id,
        request.timestamp,
        &request.from_device,
    );
    verify_payload(
        &payload,
        request.signature.as_ref().unwrap(),
        &request.from_device.trust_public_key,
    )
}
