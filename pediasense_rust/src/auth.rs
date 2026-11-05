use sha2::{Digest, Sha256};
use uuid::Uuid;

const SALT: &str = "pediasense_clinical_secret_salt_v1";

pub fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(SALT.as_bytes());
    hasher.update(password.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    let computed = hash_password(password);
    computed == stored_hash
}

pub fn generate_token() -> String {
    format!("ps_{}", Uuid::new_v4().simple())
}
