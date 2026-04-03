import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  ACTION_SWAP,
  ACTION_STAKE,
  ACTION_TRANSFER,
  ACTION_VOTE,
  ACTION_MINT,
  MAX_SCORE,
} from "./constants.js";
import type { ReputationAccount } from "./types.js";

const ACTION_MAP: Record<string, number> = {
  swap: ACTION_SWAP,
  stake: ACTION_STAKE,
  transfer: ACTION_TRANSFER,
  vote: ACTION_VOTE,
  mint: ACTION_MINT,
};

const REVERSE_ACTION_MAP: [number, string][] = [
  [ACTION_SWAP, "swap"],
  [ACTION_STAKE, "stake"],
  [ACTION_TRANSFER, "transfer"],
  [ACTION_VOTE, "vote"],
  [ACTION_MINT, "mint"],
];

/**
 * Convert human-readable action names to a bitflag integer.
 * e.g. ["swap", "stake"] -> 3
 */
export function parseActions(actions: string[]): number {
  let flags = 0;
  for (const action of actions) {
    const lower = action.toLowerCase();
    const bit = ACTION_MAP[lower];
    if (bit === undefined) {
      throw new Error(`Unknown action: ${action}. Valid: ${Object.keys(ACTION_MAP).join(", ")}`);
    }
    flags |= bit;
  }
  return flags;
}

/**
 * Convert a bitflag integer back to action names.
 * e.g. 3 -> ["swap", "stake"]
 */
export function formatActions(flags: number): string[] {
  const result: string[] = [];
  for (const [bit, name] of REVERSE_ACTION_MAP) {
    if ((flags & bit) !== 0) {
      result.push(name);
    }
  }
  return result;
}

/**
 * Parse a human-readable duration string to seconds.
 * Supports: "72h", "7d", "30m", "2w"
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)\s*(s|m|h|d|w)$/i);
  if (!match) {
    throw new Error(`Invalid duration format: "${duration}". Use e.g. "72h", "7d", "30m", "2w"`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    case "w":
      return value * 604800;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

/**
 * Convert lamports (bigint) to SOL.
 */
export function lamportsToSol(lamports: bigint): number {
  return Number(lamports) / 1_000_000_000;
}

/**
 * Convert SOL to lamports (bigint).
 */
export function solToLamports(sol: number): bigint {
  return BigInt(Math.round(sol * 1_000_000_000));
}

/**
 * Shorten a pubkey for display: "7xKq...3nF"
 */
export function shortenPubkey(pubkey: PublicKey): string {
  const str = pubkey.toBase58();
  return `${str.slice(0, 4)}...${str.slice(-3)}`;
}

/**
 * Calculate reputation score matching the on-chain formula:
 *   base = (successfulActions / totalActions) * MAX_SCORE
 *   penalty = disputesLost * 500
 *   score = max(0, base - penalty)
 */
export function calculateReputationScore(rep: ReputationAccount): number {
  const total = rep.totalActions.toNumber();
  if (total === 0) return 0;

  const successful = rep.successfulActions.toNumber();
  const base = Math.floor((successful * MAX_SCORE) / total);
  const penalty = rep.disputesLost * 500;

  return Math.max(0, base - penalty);
}

export function defaultScope(): {
  allowedPrograms: never[];
  maxLamportsPerTx: bigint;
  maxLamportsTotal: bigint;
  spentLamports: bigint;
  expiresAt: number;
  allowedActions: number;
} {
  return {
    allowedPrograms: [],
    maxLamportsPerTx: BigInt(0),
    maxLamportsTotal: BigInt(0),
    spentLamports: BigInt(0),
    expiresAt: 0,
    allowedActions: 0xFFFF,
  };
}
