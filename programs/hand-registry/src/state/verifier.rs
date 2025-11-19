use anchor_lang::prelude::*;
use ark_bn254::{Bn254, Fr, G1Affine, G2Affine};
use ark_ff::PrimeField;
use ark_groth16::{prepare_verifying_key, verify_proof, Proof, VerifyingKey};
use ark_serialize::CanonicalDeserialize;
use sha2::{Digest, Sha256};

use crate::error::HandError;

// ── Development Verification Key ────────────────────────────────────────────
// These are zeroed placeholder constants that MUST be replaced with actual
// verification key points generated from a trusted-setup ceremony before
// any mainnet deployment. The sizes match BN254 curve point serialization:
//   G1 uncompressed = 64 bytes, G2 uncompressed = 128 bytes.

/// VK alpha_g1 — G1 point (64 bytes uncompressed)
const VK_ALPHA_G1: [u8; 64] = [0u8; 64];
/// VK beta_g2 — G2 point (128 bytes uncompressed)
const VK_BETA_G2: [u8; 128] = [0u8; 128];
/// VK gamma_g2 — G2 point (128 bytes uncompressed)
const VK_GAMMA_G2: [u8; 128] = [0u8; 128];
/// VK delta_g2 — G2 point (128 bytes uncompressed)
const VK_DELTA_G2: [u8; 128] = [0u8; 128];
/// VK IC[0] — G1 point (64 bytes uncompressed)
const VK_IC_0: [u8; 64] = [0u8; 64];
/// VK IC[1] — G1 point (64 bytes uncompressed)
const VK_IC_1: [u8; 64] = [0u8; 64];

/// Verify a Groth16 proof over the BN254 curve.
///
/// # Arguments
/// * `proof_a` — serialized G1 point (proof.a)
/// * `proof_b` — serialized G2 point (proof.b)
/// * `proof_c` — serialized G1 point (proof.c)
/// * `public_signals` — list of 32-byte public inputs (field elements)
///
/// # Returns
/// `Ok(true)` if the proof is valid, `Ok(false)` if it is invalid,
/// or an error if deserialization fails.
pub fn verify_groth16_proof(
    proof_a: &[u8],
    proof_b: &[u8],
    proof_c: &[u8],
    public_signals: &[[u8; 32]],
) -> Result<bool> {
    // Deserialize proof components
    let a = G1Affine::deserialize_uncompressed(&*proof_a)
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let b = G2Affine::deserialize_uncompressed(&*proof_b)
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let c = G1Affine::deserialize_uncompressed(&*proof_c)
        .map_err(|_| error!(HandError::InvalidVerificationData))?;

    let proof = Proof::<Bn254> { a, b, c };

    // Deserialize public inputs
    let mut public_inputs: Vec<Fr> = Vec::with_capacity(public_signals.len());
    for signal in public_signals {
        let fr = Fr::from_le_bytes_mod_order(signal);
        public_inputs.push(fr);
    }

    // Build the verification key from embedded constants
    let vk = build_verification_key()?;
    let pvk = prepare_verifying_key(&vk);

    // Execute the pairing check
    let valid = verify_proof(&pvk, &proof, &public_inputs)
        .map_err(|_| error!(HandError::InvalidProof))?;

    Ok(valid)
}

/// Reconstruct the verification key from embedded constant byte arrays.
fn build_verification_key() -> Result<VerifyingKey<Bn254>> {
    let alpha_g1 = G1Affine::deserialize_uncompressed(&VK_ALPHA_G1[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let beta_g2 = G2Affine::deserialize_uncompressed(&VK_BETA_G2[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let gamma_g2 = G2Affine::deserialize_uncompressed(&VK_GAMMA_G2[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let delta_g2 = G2Affine::deserialize_uncompressed(&VK_DELTA_G2[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let ic_0 = G1Affine::deserialize_uncompressed(&VK_IC_0[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;
    let ic_1 = G1Affine::deserialize_uncompressed(&VK_IC_1[..])
        .map_err(|_| error!(HandError::InvalidVerificationData))?;

    Ok(VerifyingKey::<Bn254> {
        alpha_g1,
        beta_g2,
        gamma_g2,
        delta_g2,
        gamma_abc_g1: vec![ic_0, ic_1],
    })
}

/// Compute a deterministic nullifier hash from raw input bytes.
/// Uses SHA-256 truncated/mapped into a 32-byte output suitable
/// for use as a PDA seed and on-chain identifier.
pub fn compute_nullifier_hash(input: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"hand-nullifier-v1");
    hasher.update(input);
    let result = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&result);
    out
}
