use aes_gcm::{
    aead::Aead,
    Aes256Gcm, KeyInit,
};
use base64::Engine as _;
use ring::agreement::{agree_ephemeral, EphemeralPrivateKey, UnparsedPublicKey as X25519PublicKey, X25519};
use ring::hkdf::{Salt, HKDF_SHA256};
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{Ed25519KeyPair, UnparsedPublicKey as EdPublicKey, ED25519};
use sha2::Digest;
use serde::{Deserialize, Serialize};
use std::io::{self, ErrorKind};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::codec::MAX_CONTROL_MESSAGE_BYTES;

#[allow(dead_code)]
const FRAME_HEADER_BYTES: usize = 4;
const AUTH_TAG_BYTES: usize = 16;
const MAX_SECURE_FRAME_BYTES: usize = 1024 * 1024;
const HANDSHAKE_VERSION: u32 = 1;
const HANDSHAKE_TIMEOUT_MS: u64 = 8000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecureIdentity {
    pub device_id: String,
    pub name: String,
    pub trust_fingerprint: String,
    pub trust_public_key: String,
    pub trust_private_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExpectedPeerIdentity {
    pub device_id: Option<String>,
    pub trust_fingerprint: String,
    pub trust_public_key: Option<String>,
}

#[derive(Debug, Clone)]
struct SessionKeys {
    send_key: [u8; 32],
    receive_key: [u8; 32],
    send_nonce_prefix: [u8; 4],
    receive_nonce_prefix: [u8; 4],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnsignedClientHello {
    #[serde(rename = "type")]
    msg_type: String,
    version: u32,
    client_ephemeral_public_key: String,
    client_nonce: String,
    from_device: FromDeviceIdentity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ClientHello {
    #[serde(rename = "type")]
    msg_type: String,
    version: u32,
    client_ephemeral_public_key: String,
    client_nonce: String,
    from_device: FromDeviceIdentity,
    signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UnsignedServerHello {
    #[serde(rename = "type")]
    msg_type: String,
    version: u32,
    client_ephemeral_public_key: String,
    client_nonce: String,
    server_ephemeral_public_key: String,
    server_nonce: String,
    from_device: FromDeviceIdentity,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServerHello {
    #[serde(rename = "type")]
    msg_type: String,
    version: u32,
    client_ephemeral_public_key: String,
    client_nonce: String,
    server_ephemeral_public_key: String,
    server_nonce: String,
    from_device: FromDeviceIdentity,
    signature: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FromDeviceIdentity {
    device_id: String,
    name: String,
    trust_fingerprint: String,
    trust_public_key: String,
}

/// 安全加密的 TCP Socket
/// 提供加密帧的读写功能
pub struct SecureSocket {
    stream: TcpStream,
    send_cipher: Aes256Gcm,
    receive_cipher: Aes256Gcm,
    send_nonce_prefix: [u8; 4],
    receive_nonce_prefix: [u8; 4],
    send_counter: u64,
    receive_counter: u64,
    #[allow(dead_code)]
    receive_buffer: Vec<u8>,
}

impl SecureSocket {
    fn new(stream: TcpStream, keys: SessionKeys) -> Self {
        let send_cipher = Aes256Gcm::new_from_slice(&keys.send_key)
            .expect("AES-256-GCM key should be 32 bytes");
        let receive_cipher = Aes256Gcm::new_from_slice(&keys.receive_key)
            .expect("AES-256-GCM key should be 32 bytes");

        Self {
            stream,
            send_cipher,
            receive_cipher,
            send_nonce_prefix: keys.send_nonce_prefix,
            receive_nonce_prefix: keys.receive_nonce_prefix,
            send_counter: 0,
            receive_counter: 0,
            receive_buffer: Vec::new(),
        }
    }

    /// 写入一个加密帧
    pub async fn write_frame(&mut self, plaintext: &[u8]) -> io::Result<()> {
        if plaintext.len() > MAX_SECURE_FRAME_BYTES {
            return Err(io::Error::new(
                ErrorKind::InvalidInput,
                format!("Secure frame exceeds {} bytes", MAX_SECURE_FRAME_BYTES),
            ));
        }

        let nonce = nonce_for_counter(&self.send_nonce_prefix, self.send_counter);
        self.send_counter += 1;

        let ciphertext_with_tag = self
            .send_cipher
            .encrypt((&nonce).into(), plaintext)
            .map_err(|e| io::Error::new(ErrorKind::Other, format!("Encryption failed: {:?}", e)))?;

        let payload_len = ciphertext_with_tag.len() as u32;

        self.stream.write_u32(payload_len).await?;
        self.stream.write_all(&ciphertext_with_tag).await?;

        Ok(())
    }

    /// 读取并解密一个帧
    pub async fn read_frame(&mut self) -> io::Result<Vec<u8>> {
        let payload_len = self.stream.read_u32().await? as usize;

        if payload_len <= AUTH_TAG_BYTES || payload_len > MAX_SECURE_FRAME_BYTES + AUTH_TAG_BYTES {
            return Err(io::Error::new(
                ErrorKind::InvalidData,
                format!("Invalid secure frame length: {}", payload_len),
            ));
        }

        let mut encrypted = vec![0u8; payload_len];
        self.stream.read_exact(&mut encrypted).await?;

        let nonce = nonce_for_counter(&self.receive_nonce_prefix, self.receive_counter);
        self.receive_counter += 1;

        let plaintext = self
            .receive_cipher
            .decrypt((&nonce).into(), encrypted.as_ref())
            .map_err(|e| {
                io::Error::new(
                    ErrorKind::InvalidData,
                    format!("Decryption failed: {:?}", e),
                )
            })?;

        Ok(plaintext)
    }

    /// 写入原始字节（多个帧）
    pub async fn write_bytes(&mut self, bytes: &[u8]) -> io::Result<()> {
        for chunk in bytes.chunks(MAX_SECURE_FRAME_BYTES) {
            self.write_frame(chunk).await?;
        }
        Ok(())
    }

    /// 刷新底层流
    pub async fn flush(&mut self) -> io::Result<()> {
        self.stream.flush().await
    }

    /// 获取底层 TcpStream
    pub fn stream(&mut self) -> &mut TcpStream {
        &mut self.stream
    }
}

/// 客户端安全连接
/// 执行完整的安全握手流程
pub async fn secure_connect(
    stream: TcpStream,
    self_device: SecureIdentity,
    expected_peer: ExpectedPeerIdentity,
    timeout_ms: Option<u64>,
) -> io::Result<SecureSocket> {
    let _timeout_ms = timeout_ms.unwrap_or(HANDSHAKE_TIMEOUT_MS);

    let rng = SystemRandom::new();
    let ephemeral_private = EphemeralPrivateKey::generate(&X25519, &rng)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to generate key: {:?}", e)))?;
    let ephemeral_public = ephemeral_private
        .compute_public_key()
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to compute pubkey: {:?}", e)))?;

    let mut client_nonce = [0u8; 16];
    rng.fill(&mut client_nonce)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to generate nonce: {:?}", e)))?;

    let unsigned_hello = UnsignedClientHello {
        msg_type: "secure-client-hello".to_string(),
        version: HANDSHAKE_VERSION,
        client_ephemeral_public_key: base64_encode(ephemeral_public.as_ref()),
        client_nonce: base64_encode(&client_nonce),
        from_device: FromDeviceIdentity {
            device_id: self_device.device_id,
            name: self_device.name,
            trust_fingerprint: self_device.trust_fingerprint,
            trust_public_key: self_device.trust_public_key,
        },
    };

    let payload = client_hello_payload(&unsigned_hello);
    let signature = sign_payload(&payload, &self_device.trust_private_key)?;

    let hello = ClientHello {
        msg_type: unsigned_hello.msg_type.clone(),
        version: unsigned_hello.version,
        client_ephemeral_public_key: unsigned_hello.client_ephemeral_public_key.clone(),
        client_nonce: unsigned_hello.client_nonce.clone(),
        from_device: unsigned_hello.from_device.clone(),
        signature,
    };

    let hello_json = serde_json::to_vec(&hello)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Serialize failed: {}", e)))?;

    let mut stream = stream;
    stream.set_nodelay(true)?;
    stream.write_u32(hello_json.len() as u32).await?;
    stream.write_all(&hello_json).await?;
    stream.flush().await?;

    let payload_len = stream.read_u32().await? as usize;
    if payload_len > MAX_CONTROL_MESSAGE_BYTES {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "Server hello too large",
        ));
    }

    let mut server_hello_buf = vec![0u8; payload_len];
    stream.read_exact(&mut server_hello_buf).await?;

    let server_hello: ServerHello = serde_json::from_slice(&server_hello_buf)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Parse server hello failed: {}", e)))?;

    verify_server_hello(&server_hello, &unsigned_hello, &expected_peer)?;

    let unsigned_server_hello = UnsignedServerHello {
        msg_type: server_hello.msg_type.clone(),
        version: server_hello.version,
        client_ephemeral_public_key: server_hello.client_ephemeral_public_key.clone(),
        client_nonce: server_hello.client_nonce.clone(),
        server_ephemeral_public_key: server_hello.server_ephemeral_public_key.clone(),
        server_nonce: server_hello.server_nonce.clone(),
        from_device: server_hello.from_device.clone(),
    };

    let peer_public_key_bytes = base64_decode(&server_hello.server_ephemeral_public_key)?;
    let peer_public_key = X25519PublicKey::new(&X25519, peer_public_key_bytes.as_slice());

    let shared_secret = agree_ephemeral(ephemeral_private, &peer_public_key, |key_material| {
        let mut secret = [0u8; 32];
        secret.copy_from_slice(key_material);
        Ok::<[u8; 32], ()>(secret)
    })
    .map_err(|e| io::Error::new(ErrorKind::Other, format!("Key agreement failed: {:?}", e)))?
    .map_err(|_| io::Error::new(ErrorKind::Other, "Failed to derive shared secret"))?;

    let keys = derive_session_keys(
        Role::Client,
        &shared_secret,
        &unsigned_hello,
        &unsigned_server_hello,
    )?;

    Ok(SecureSocket::new(stream, keys))
}

/// 服务端安全接收
/// 执行完整的安全握手流程
pub async fn secure_accept(
    stream: TcpStream,
    self_device: SecureIdentity,
    timeout_ms: Option<u64>,
) -> io::Result<(SecureSocket, ExpectedPeerIdentity)> {
    let _timeout_ms = timeout_ms.unwrap_or(HANDSHAKE_TIMEOUT_MS);
    let mut stream = stream;
    stream.set_nodelay(true)?;

    let payload_len = stream.read_u32().await? as usize;
    if payload_len > MAX_CONTROL_MESSAGE_BYTES {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "Client hello too large",
        ));
    }

    let mut client_hello_buf = vec![0u8; payload_len];
    stream.read_exact(&mut client_hello_buf).await?;

    let client_hello: ClientHello = serde_json::from_slice(&client_hello_buf)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Parse client hello failed: {}", e)))?;

    verify_client_hello(&client_hello)?;

    let unsigned_client_hello = UnsignedClientHello {
        msg_type: client_hello.msg_type,
        version: client_hello.version,
        client_ephemeral_public_key: client_hello.client_ephemeral_public_key.clone(),
        client_nonce: client_hello.client_nonce.clone(),
        from_device: client_hello.from_device.clone(),
    };

    let rng = SystemRandom::new();
    let ephemeral_private = EphemeralPrivateKey::generate(&X25519, &rng)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to generate key: {:?}", e)))?;
    let ephemeral_public = ephemeral_private
        .compute_public_key()
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to compute pubkey: {:?}", e)))?;

    let mut server_nonce = [0u8; 16];
    rng.fill(&mut server_nonce)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Failed to generate nonce: {:?}", e)))?;

    let unsigned_hello = UnsignedServerHello {
        msg_type: "secure-server-hello".to_string(),
        version: HANDSHAKE_VERSION,
        client_ephemeral_public_key: client_hello.client_ephemeral_public_key.clone(),
        client_nonce: client_hello.client_nonce.clone(),
        server_ephemeral_public_key: base64_encode(ephemeral_public.as_ref()),
        server_nonce: base64_encode(&server_nonce),
        from_device: FromDeviceIdentity {
            device_id: self_device.device_id,
            name: self_device.name,
            trust_fingerprint: self_device.trust_fingerprint,
            trust_public_key: self_device.trust_public_key,
        },
    };

    let payload = server_hello_payload(&unsigned_hello);
    let signature = sign_payload(&payload, &self_device.trust_private_key)?;

    let hello = ServerHello {
        msg_type: unsigned_hello.msg_type.clone(),
        version: unsigned_hello.version,
        client_ephemeral_public_key: unsigned_hello.client_ephemeral_public_key.clone(),
        client_nonce: unsigned_hello.client_nonce.clone(),
        server_ephemeral_public_key: unsigned_hello.server_ephemeral_public_key.clone(),
        server_nonce: unsigned_hello.server_nonce.clone(),
        from_device: unsigned_hello.from_device.clone(),
        signature,
    };

    let hello_json = serde_json::to_vec(&hello)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Serialize failed: {}", e)))?;

    stream.write_u32(hello_json.len() as u32).await?;
    stream.write_all(&hello_json).await?;
    stream.flush().await?;

    let peer_public_key_bytes = base64_decode(&client_hello.client_ephemeral_public_key)?;
    let peer_public_key = X25519PublicKey::new(&X25519, peer_public_key_bytes.as_slice());

    let shared_secret = agree_ephemeral(ephemeral_private, &peer_public_key, |key_material| {
        let mut secret = [0u8; 32];
        secret.copy_from_slice(key_material);
        Ok::<[u8; 32], ()>(secret)
    })
    .map_err(|e| io::Error::new(ErrorKind::Other, format!("Key agreement failed: {:?}", e)))?
    .map_err(|_| io::Error::new(ErrorKind::Other, "Failed to derive shared secret"))?;

    let keys = derive_session_keys(Role::Server, &shared_secret, &unsigned_client_hello, &unsigned_hello)?;

    let peer_identity = ExpectedPeerIdentity {
        device_id: Some(client_hello.from_device.device_id),
        trust_fingerprint: client_hello.from_device.trust_fingerprint,
        trust_public_key: Some(client_hello.from_device.trust_public_key),
    };

    Ok((SecureSocket::new(stream, keys), peer_identity))
}

fn nonce_for_counter(prefix: &[u8; 4], counter: u64) -> [u8; 12] {
    let mut nonce = [0u8; 12];
    nonce[..4].copy_from_slice(prefix);
    nonce[4..].copy_from_slice(&counter.to_be_bytes());
    nonce
}

fn base64_encode(bytes: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(bytes)
}

fn base64_decode(s: &str) -> io::Result<Vec<u8>> {
    base64::engine::general_purpose::STANDARD
        .decode(s)
        .map_err(|e| io::Error::new(ErrorKind::InvalidData, format!("Base64 decode failed: {}", e)))
}

fn sign_payload(payload: &str, private_key: &str) -> io::Result<String> {
    let private_key_bytes = base64_decode(private_key)?;
    let key_pair = Ed25519KeyPair::from_pkcs8(&private_key_bytes)
        .map_err(|e| io::Error::new(ErrorKind::Other, format!("Invalid private key: {:?}", e)))?;
    let signature = key_pair.sign(payload.as_bytes());
    Ok(base64_encode(signature.as_ref()))
}

fn verify_payload(payload: &str, signature: &str, public_key: &str) -> bool {
    let public_key_bytes = match base64_decode(public_key) {
        Ok(k) => k,
        Err(_) => return false,
    };
    let signature_bytes = match base64_decode(signature) {
        Ok(s) => s,
        Err(_) => return false,
    };

    let public_key = EdPublicKey::new(&ED25519, &public_key_bytes);
    public_key.verify(payload.as_bytes(), &signature_bytes).is_ok()
}

fn client_hello_payload(hello: &UnsignedClientHello) -> String {
    let value = serde_json::json!({
        "version": hello.version,
        "clientEphemeralPublicKey": hello.client_ephemeral_public_key,
        "clientNonce": hello.client_nonce,
        "fromDevice": {
            "deviceId": hello.from_device.device_id,
            "name": hello.from_device.name,
            "trustFingerprint": hello.from_device.trust_fingerprint,
            "trustPublicKey": hello.from_device.trust_public_key,
        }
    });
    serde_json::to_string(&value).unwrap_or_default()
}

fn server_hello_payload(hello: &UnsignedServerHello) -> String {
    let value = serde_json::json!({
        "version": hello.version,
        "clientEphemeralPublicKey": hello.client_ephemeral_public_key,
        "clientNonce": hello.client_nonce,
        "serverEphemeralPublicKey": hello.server_ephemeral_public_key,
        "serverNonce": hello.server_nonce,
        "fromDevice": {
            "deviceId": hello.from_device.device_id,
            "name": hello.from_device.name,
            "trustFingerprint": hello.from_device.trust_fingerprint,
            "trustPublicKey": hello.from_device.trust_public_key,
        }
    });
    serde_json::to_string(&value).unwrap_or_default()
}

fn verify_client_hello(hello: &ClientHello) -> io::Result<()> {
    if hello.version != HANDSHAKE_VERSION {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "Unsupported handshake version",
        ));
    }

    let unsigned = UnsignedClientHello {
        msg_type: hello.msg_type.clone(),
        version: hello.version,
        client_ephemeral_public_key: hello.client_ephemeral_public_key.clone(),
        client_nonce: hello.client_nonce.clone(),
        from_device: hello.from_device.clone(),
    };

    let payload = client_hello_payload(&unsigned);
    if !verify_payload(&payload, &hello.signature, &hello.from_device.trust_public_key) {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "Client hello signature verification failed",
        ));
    }

    Ok(())
}

fn verify_server_hello(
    hello: &ServerHello,
    client_hello: &UnsignedClientHello,
    expected_peer: &ExpectedPeerIdentity,
) -> io::Result<()> {
    if hello.version != HANDSHAKE_VERSION {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "Unsupported handshake version",
        ));
    }

    if hello.client_ephemeral_public_key != client_hello.client_ephemeral_public_key
        || hello.client_nonce != client_hello.client_nonce
    {
        return Err(io::Error::new(
            ErrorKind::InvalidData,
            "Server hello does not match client handshake",
        ));
    }

    if let Some(expected_device_id) = &expected_peer.device_id {
        if &hello.from_device.device_id != expected_device_id {
            return Err(io::Error::new(
                ErrorKind::PermissionDenied,
                "Server device id mismatch",
            ));
        }
    }

    if hello.from_device.trust_fingerprint != expected_peer.trust_fingerprint {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "Server fingerprint mismatch",
        ));
    }

    if let Some(expected_public_key) = &expected_peer.trust_public_key {
        if !expected_public_key.is_empty() && &hello.from_device.trust_public_key != expected_public_key {
            return Err(io::Error::new(
                ErrorKind::PermissionDenied,
                "Server public key mismatch",
            ));
        }
    }

    let unsigned = UnsignedServerHello {
        msg_type: hello.msg_type.clone(),
        version: hello.version,
        client_ephemeral_public_key: hello.client_ephemeral_public_key.clone(),
        client_nonce: hello.client_nonce.clone(),
        server_ephemeral_public_key: hello.server_ephemeral_public_key.clone(),
        server_nonce: hello.server_nonce.clone(),
        from_device: hello.from_device.clone(),
    };

    let payload = server_hello_payload(&unsigned);
    if !verify_payload(&payload, &hello.signature, &hello.from_device.trust_public_key) {
        return Err(io::Error::new(
            ErrorKind::PermissionDenied,
            "Server hello signature verification failed",
        ));
    }

    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Role {
    Client,
    Server,
}

fn derive_session_keys(
    role: Role,
    shared_secret: &[u8; 32],
    client_hello: &UnsignedClientHello,
    server_hello: &UnsignedServerHello,
) -> io::Result<SessionKeys> {
    let client_payload = client_hello_payload(client_hello);
    let server_payload = server_hello_payload(server_hello);

    let mut hasher = sha2::Sha256::new();
    hasher.update(client_payload.as_bytes());
    hasher.update(server_payload.as_bytes());
    let transcript = hasher.finalize();

    let salt = Salt::new(HKDF_SHA256, &transcript);
    let prk = salt.extract(shared_secret);

    let mut client_key = [0u8; 32];
    let info: &[&[u8]] = &[b"syncfile-client-key"];
    prk.expand(info, HKDF_SHA256)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF expand failed"))?
        .fill(&mut client_key)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF fill failed"))?;

    let mut server_key = [0u8; 32];
    let info: &[&[u8]] = &[b"syncfile-server-key"];
    prk.expand(info, HKDF_SHA256)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF expand failed"))?
        .fill(&mut server_key)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF fill failed"))?;

    let mut client_nonce = [0u8; 4];
    let info: &[&[u8]] = &[b"syncfile-client-nonce"];
    prk.expand(info, HKDF_SHA256)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF expand failed"))?
        .fill(&mut client_nonce)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF fill failed"))?;

    let mut server_nonce = [0u8; 4];
    let info: &[&[u8]] = &[b"syncfile-server-nonce"];
    prk.expand(info, HKDF_SHA256)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF expand failed"))?
        .fill(&mut server_nonce)
        .map_err(|_| io::Error::new(ErrorKind::Other, "HKDF fill failed"))?;

    if role == Role::Client {
        Ok(SessionKeys {
            send_key: client_key,
            receive_key: server_key,
            send_nonce_prefix: client_nonce,
            receive_nonce_prefix: server_nonce,
        })
    } else {
        Ok(SessionKeys {
            send_key: server_key,
            receive_key: client_key,
            send_nonce_prefix: server_nonce,
            receive_nonce_prefix: client_nonce,
        })
    }
}
