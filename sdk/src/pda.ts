import { PublicKey } from "@solana/web3.js";
import {
  HAND_SEED,
  NULLIFIER_SEED,
  DELEGATION_SEED,
  REPUTATION_SEED,
  REPORTER_SEED,
  DISPUTE_SEED,
} from "./constants.js";

export function findWritPda(
  authority: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [HAND_SEED, authority.toBuffer()],
    programId,
  );
}

export function findNullifierPda(
  nullifier: Buffer,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [NULLIFIER_SEED, nullifier],
    programId,
  );
}

export function findDelegationPda(
  hand: PublicKey,
  agent: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DELEGATION_SEED, hand.toBuffer(), agent.toBuffer()],
    programId,
  );
}

export function findReputationPda(
  hand: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPUTATION_SEED, hand.toBuffer()],
    programId,
  );
}

export function findReporterPda(
  reporterProgram: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [REPORTER_SEED, reporterProgram.toBuffer()],
    programId,
  );
}

export function findDisputePda(
  agent: PublicKey,
  challenger: PublicKey,
  programId: PublicKey,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [DISPUTE_SEED, agent.toBuffer(), challenger.toBuffer()],
    programId,
  );
}

// All PDA functions use findProgramAddressSync for deterministic derivation
