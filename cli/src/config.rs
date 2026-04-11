use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use thiserror::Error;

use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::read_keypair_file;
use solana_sdk::signer::keypair::Keypair;

#[derive(Error, Debug)]
pub enum ConfigError {
    #[error("Failed to read config file: {0}")]
    ReadError(#[from] std::io::Error),
    #[error("Failed to parse config file: {0}")]
    ParseError(String),
    #[error("Failed to read keypair from {path}: {source}")]
    KeypairError {
        path: String,
        source: std::io::Error,
    },
    #[error("Config directory not found — cannot determine home directory")]
    HomeDirNotFound,
    #[error("Invalid program ID '{0}': {1}")]
    InvalidProgramId(String, String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgramIds {
    pub hand_registry: String,
    pub delegation: String,
    pub reputation: String,
    pub hand_gate: String,
}

impl Default for ProgramIds {
    fn default() -> Self {
        Self {
            hand_registry: "HANDreg1111111111111111111111111111111111111".to_string(),
            delegation: "HANDde1e111111111111111111111111111111111111".to_string(),
            reputation: "HANDrep1111111111111111111111111111111111111".to_string(),
            hand_gate: "HANDgate111111111111111111111111111111111111".to_string(),
        }
    }
}

impl ProgramIds {
    pub fn hand_registry_pubkey(&self) -> Result<Pubkey, ConfigError> {
        self.hand_registry
            .parse::<Pubkey>()
            .map_err(|e| ConfigError::InvalidProgramId(self.hand_registry.clone(), e.to_string()))
    }

    pub fn delegation_pubkey(&self) -> Result<Pubkey, ConfigError> {
        self.delegation
            .parse::<Pubkey>()
            .map_err(|e| ConfigError::InvalidProgramId(self.delegation.clone(), e.to_string()))
    }

    pub fn reputation_pubkey(&self) -> Result<Pubkey, ConfigError> {
        self.reputation
            .parse::<Pubkey>()
            .map_err(|e| ConfigError::InvalidProgramId(self.reputation.clone(), e.to_string()))
    }

    pub fn hand_gate_pubkey(&self) -> Result<Pubkey, ConfigError> {
        self.hand_gate
            .parse::<Pubkey>()
            .map_err(|e| ConfigError::InvalidProgramId(self.hand_gate.clone(), e.to_string()))
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HandConfig {
    pub rpc_url: String,
    pub keypair_path: String,
    pub network: String,
    pub program_ids: ProgramIds,
}

impl Default for HandConfig {
    fn default() -> Self {
        let default_keypair = dirs::home_dir()
            .map(|h| h.join(".config/solana/id.json").to_string_lossy().to_string())
            .unwrap_or_else(|| "~/.config/solana/id.json".to_string());

        Self {
            rpc_url: "https://api.devnet.solana.com".to_string(),
            keypair_path: default_keypair,
            network: "devnet".to_string(),
            program_ids: ProgramIds::default(),
        }
    }
}

fn config_dir() -> Result<PathBuf, ConfigError> {
    let home = dirs::home_dir().ok_or(ConfigError::HomeDirNotFound)?;
    Ok(home.join(".hand"))
}

fn config_path() -> Result<PathBuf, ConfigError> {
    Ok(config_dir()?.join("config.toml"))
}

pub fn load_config() -> Result<HandConfig, ConfigError> {
    let path = config_path()?;

    if !path.exists() {
        let config = HandConfig::default();
        save_config(&config)?;
        return Ok(config);
    }

    let content = fs::read_to_string(&path)?;

    // Parse with toml_edit for round-trip fidelity, then deserialize via serde
    let doc = content
        .parse::<toml_edit::DocumentMut>()
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;

    let config: HandConfig = toml_edit::de::from_document(doc)
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;

    Ok(config)
}

pub fn save_config(config: &HandConfig) -> Result<(), ConfigError> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir)?;

    let toml_string = toml_edit::ser::to_string_pretty(config)
        .map_err(|e| ConfigError::ParseError(e.to_string()))?;

    fs::write(config_path()?, toml_string)?;
    Ok(())
}

pub fn load_keypair(config: &HandConfig) -> Result<Keypair, ConfigError> {
    let path = shellexpand(&config.keypair_path);
    read_keypair_file(&path).map_err(|e| ConfigError::KeypairError {
        path: path.clone(),
        source: std::io::Error::new(std::io::ErrorKind::Other, e.to_string()),
    })
}

/// Minimal tilde expansion for keypair paths.
fn shellexpand(path: &str) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(rest).to_string_lossy().to_string();
        }
    }
    path.to_string()
}

/// Validate that config has required fields populated
pub fn validate_config(config: &HandConfig) -> bool {
    !config.rpc_url.is_empty() && !config.keypair_path.is_empty()
}
