use sha2::{Digest, Sha256};
use std::path::Path;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, BufReader};

/// 计算文件的 SHA256 哈希值
pub async fn sha256_file(path: &Path) -> Result<String, std::io::Error> {
    let file = File::open(path).await?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 65536];

    loop {
        let n = reader.read(&mut buf).await?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }

    let result = hasher.finalize();
    Ok(format!("{:x}", result))
}

/// 为断点续传初始化哈希状态，读取已有的部分文件并计算哈希
pub async fn seed_hash_for_resume(
    partial_path: &Path,
    existing_bytes: u64,
) -> Result<Sha256, std::io::Error> {
    let mut hasher = Sha256::new();

    if existing_bytes > 0 {
        let file = File::open(partial_path).await?;
        let mut reader = BufReader::new(file);
        let mut buf = [0u8; 65536];
        let mut bytes_read = 0u64;

        while bytes_read < existing_bytes {
            let n = reader.read(&mut buf).await?;
            if n == 0 {
                break;
            }
            let to_read = n.min((existing_bytes - bytes_read) as usize);
            hasher.update(&buf[..to_read]);
            bytes_read += to_read as u64;
        }
    }

    Ok(hasher)
}

/// 检查文件哈希是否匹配
pub fn verify_file_hash(computed_hash: &Sha256, expected_hash: &str) -> bool {
    let computed = format!("{:x}", computed_hash.clone().finalize());
    computed.to_lowercase() == expected_hash.to_lowercase()
}
