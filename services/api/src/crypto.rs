use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Algorithm, Argon2, Params, Version,
};
use hmac::{Hmac, Mac};
use rand::{rngs::OsRng, RngCore};
use sha2::{Digest, Sha256};

fn argon2() -> Argon2<'static> {
    // OWASP baseline for Argon2id: 19 MiB, 2 iterations, 1 lane.
    Argon2::new(Algorithm::Argon2id, Version::V0x13, Params::new(19 * 1024, 2, 1, None).unwrap())
}

pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut OsRng);
    argon2()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| anyhow!("hash failed: {e}"))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|parsed| argon2().verify_password(password.as_bytes(), &parsed).is_ok())
        .unwrap_or(false)
}

/// A real hash to verify against when the email does not exist, so login takes the same
/// time either way and cannot be used to discover accounts.
pub fn dummy_hash() -> &'static str {
    static HASH: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    HASH.get_or_init(|| hash_password(&random_token(16)).expect("argon2 works"))
}

pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    OsRng.fill_bytes(&mut buf);
    hex::encode(buf)
}

pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut buf = vec![0u8; len];
    OsRng.fill_bytes(&mut buf);
    buf
}

pub fn sha256(data: &[u8]) -> Vec<u8> {
    Sha256::digest(data).to_vec()
}

pub fn salted_hash(salt: &[u8], value: &str) -> Vec<u8> {
    let mut h = Sha256::new();
    h.update(salt);
    h.update(value.as_bytes());
    h.finalize().to_vec()
}

pub fn hmac_sha256(key: &[u8], msg: &[u8]) -> Vec<u8> {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("hmac accepts any key length");
    mac.update(msg);
    mac.finalize().into_bytes().to_vec()
}

pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    use subtle::ConstantTimeEq;
    a.len() == b.len() && a.ct_eq(b).into()
}

/// AES-256-GCM. Output is nonce (12 bytes) followed by ciphertext.
pub fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>> {
    let cipher = Aes256Gcm::new(key.into());
    let nonce_bytes = random_bytes(12);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|_| anyhow!("encrypt failed"))?;
    Ok([nonce_bytes, ct].concat())
}

pub fn decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 13 {
        return Err(anyhow!("ciphertext too short"));
    }
    let cipher = Aes256Gcm::new(key.into());
    cipher
        .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
        .map_err(|_| anyhow!("decrypt failed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn password_roundtrip() {
        let h = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", &h));
        assert!(!verify_password("wrong", &h));
        assert!(!verify_password("anything", dummy_hash()));
    }

    #[test]
    fn aes_roundtrip() {
        let key = [7u8; 32];
        let ct = encrypt(&key, b"+254700000000").unwrap();
        assert_eq!(decrypt(&key, &ct).unwrap(), b"+254700000000");
        assert!(decrypt(&[8u8; 32], &ct).is_err());
    }
}
