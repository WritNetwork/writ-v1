import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  parseActions,
  formatActions,
  parseDuration,
  lamportsToSol,
  solToLamports,
  shortenPubkey,
  calculateReputationScore,
} from "../utils.js";
import { ACTION_SWAP, ACTION_STAKE, ACTION_TRANSFER } from "../constants.js";
import type { ReputationAccount } from "../types.js";

describe("parseActions", () => {
  it("parses single action", () => {
    expect(parseActions(["swap"])).toBe(ACTION_SWAP);
  });

  it("parses multiple actions", () => {
    expect(parseActions(["swap", "stake"])).toBe(ACTION_SWAP | ACTION_STAKE);
  });

  it("is case-insensitive", () => {
    expect(parseActions(["SWAP", "Transfer"])).toBe(ACTION_SWAP | ACTION_TRANSFER);
  });

  it("throws on unknown action", () => {
    expect(() => parseActions(["fly"])).toThrow("Unknown action");
  });

  it("returns 0 for empty array", () => {
    expect(parseActions([])).toBe(0);
  });
});

describe("formatActions", () => {
  it("formats single flag", () => {
    expect(formatActions(ACTION_SWAP)).toEqual(["swap"]);
  });

  it("formats combined flags", () => {
    expect(formatActions(ACTION_SWAP | ACTION_STAKE)).toEqual(["swap", "stake"]);
  });

  it("returns empty for 0", () => {
    expect(formatActions(0)).toEqual([]);
  });
});

describe("parseDuration", () => {
  it("parses hours", () => {
    expect(parseDuration("72h")).toBe(72 * 3600);
  });

  it("parses days", () => {
    expect(parseDuration("7d")).toBe(7 * 86400);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(30 * 60);
  });

  it("parses weeks", () => {
    expect(parseDuration("2w")).toBe(2 * 604800);
  });

  it("parses seconds", () => {
    expect(parseDuration("120s")).toBe(120);
  });

  it("throws on invalid format", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
  });
});

describe("lamportsToSol / solToLamports", () => {
  it("converts lamports to sol", () => {
    expect(lamportsToSol(1_000_000_000n)).toBe(1);
  });

  it("converts sol to lamports", () => {
    expect(solToLamports(1)).toBe(1_000_000_000n);
  });

  it("handles fractional sol", () => {
    expect(solToLamports(0.5)).toBe(500_000_000n);
  });
});

describe("shortenPubkey", () => {
  it("shortens a pubkey", () => {
    const pk = Keypair.generate().publicKey;
    const shortened = shortenPubkey(pk);
    expect(shortened).toMatch(/^.{4}\.\.\..{3}$/);
  });
});

describe("calculateReputationScore", () => {
  const makeRep = (total: number, successful: number, disputesLost: number): ReputationAccount => ({
    hand: Keypair.generate().publicKey,
    totalActions: new BN(total),
    successfulActions: new BN(successful),
    totalVolumeLamports: new BN(0),
    disputesReceived: 0,
    disputesLost,
    score: 0,
    lastUpdated: new BN(0),
    createdAt: new BN(0),
    bump: 0,
  });

  it("returns 0 for zero actions", () => {
    expect(calculateReputationScore(makeRep(0, 0, 0))).toBe(0);
  });

  it("returns MAX_SCORE for perfect record", () => {
    expect(calculateReputationScore(makeRep(100, 100, 0))).toBe(10_000);
  });

  it("penalizes disputes", () => {
    expect(calculateReputationScore(makeRep(100, 100, 2))).toBe(9_000);
  });

  it("floors at 0", () => {
    expect(calculateReputationScore(makeRep(100, 10, 5))).toBe(0);
  });
});
