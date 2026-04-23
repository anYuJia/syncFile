use super::protocol::ProtocolMessage;
use bytes::{Buf, BufMut, Bytes, BytesMut};
use serde_json;

const HEADER_BYTES: usize = 4;
pub const MAX_CONTROL_MESSAGE_BYTES: usize = 64 * 1024;

pub fn encode_message(msg: &ProtocolMessage) -> Result<Bytes, Box<dyn std::error::Error + Send + Sync>> {
    let payload = serde_json::to_vec(msg)?;
    if payload.len() > MAX_CONTROL_MESSAGE_BYTES {
        return Err(format!("Message exceeds {} bytes", MAX_CONTROL_MESSAGE_BYTES).into());
    }

    let mut buf = BytesMut::with_capacity(HEADER_BYTES + payload.len());
    buf.put_u32(payload.len() as u32);
    buf.extend_from_slice(&payload);
    Ok(buf.freeze())
}

pub fn encode_message_any<T: serde::Serialize>(msg: &T) -> Result<Bytes, Box<dyn std::error::Error + Send + Sync>> {
    let payload = serde_json::to_vec(msg)?;
    if payload.len() > MAX_CONTROL_MESSAGE_BYTES {
        return Err(format!("Message exceeds {} bytes", MAX_CONTROL_MESSAGE_BYTES).into());
    }

    let mut buf = BytesMut::with_capacity(HEADER_BYTES + payload.len());
    buf.put_u32(payload.len() as u32);
    buf.extend_from_slice(&payload);
    Ok(buf.freeze())
}

pub struct MessageDecoder {
    buffer: BytesMut,
}

impl MessageDecoder {
    pub fn new() -> Self {
        Self {
            buffer: BytesMut::new(),
        }
    }

    pub fn push(&mut self, chunk: &[u8]) -> Result<Vec<ProtocolMessage>, Box<dyn std::error::Error + Send + Sync>> {
        self.buffer.extend_from_slice(chunk);
        let (messages, remainder) = self.drain_messages(false)?;
        self.buffer = remainder;
        Ok(messages)
    }

    pub fn push_with_remainder(&mut self, chunk: &[u8]) -> Result<(Vec<ProtocolMessage>, Bytes), Box<dyn std::error::Error + Send + Sync>> {
        self.buffer.extend_from_slice(chunk);
        let (messages, remainder) = self.drain_messages(true)?;
        Ok((messages, remainder.into()))
    }

    fn drain_messages(&mut self, allow_trailing_data: bool) -> Result<(Vec<ProtocolMessage>, BytesMut), Box<dyn std::error::Error + Send + Sync>> {
        let mut offset = 0;
        let mut messages = Vec::new();

        while self.buffer.len() - offset >= HEADER_BYTES {
            let body_length = (&self.buffer[offset..offset + 4]).get_u32() as usize;
            if body_length > MAX_CONTROL_MESSAGE_BYTES {
                if allow_trailing_data && !messages.is_empty() {
                    break;
                }
                return Err(format!("Message exceeds {} bytes", MAX_CONTROL_MESSAGE_BYTES).into());
            }

            let frame_length = HEADER_BYTES + body_length;
            if self.buffer.len() - offset < frame_length {
                break;
            }

            let body_start = offset + HEADER_BYTES;
            let body_end = body_start + body_length;
            let body = &self.buffer[body_start..body_end];

            match serde_json::from_slice::<ProtocolMessage>(body) {
                Ok(msg) => {
                    messages.push(msg);
                    offset = body_end;
                }
                Err(e) => {
                    if allow_trailing_data && !messages.is_empty() {
                        break;
                    }
                    return Err(e.into());
                }
            }
        }

        let remainder = self.buffer.split_off(offset);
        Ok((messages, remainder.into()))
    }
}

impl Default for MessageDecoder {
    fn default() -> Self {
        Self::new()
    }
}
