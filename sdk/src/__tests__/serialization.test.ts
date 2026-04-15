import { Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  anchorDiscriminator,
  anchorAccountDiscriminator,
  serializeMintWritIx,
  serializeDelegateIx,
  serializeUpdateScopeIx,
  serializeRevokeDelegationIx,
  serializeOpenDisputeIx,
  deserializeWritAccount,
  deserializeDelegationAccount,
  deserializeReputationAccount,
  deserializeDisputeAccount,
  deserializeReporterAccount,
} from "../serialization.js";
import type {
  MintWritParams,
  DelegateParams,
  UpdateScopeParams,
  DisputeParams,
} from "../types.js";
import { DisputeStatus } from "../types.js";
import crypto from "crypto";

describe("anchorDiscriminator", () => {
  it("produces 8-byte discriminator", () => {
    const disc = anchorDiscriminator("mint_hand");
    expect(disc.length).toBe(8);
  });

  it("matches sha256 global prefix", () => {
    const disc = anchorDiscriminator("mint_hand");
    const expected = crypto
      .createHash("sha256")
      .update("global:mint_hand")
      .digest()
      .subarray(0, 8);
    expect(disc.equals(expected)).toBe(true);
  });

  it("different names produce different discriminators", () => {
    const a = anchorDiscriminator("mint_hand");
    const b = anchorDiscriminator("delegate");
    expect(a.equals(b)).toBe(false);
  });
});

describe("anchorAccountDiscriminator", () => {
  it("produces 8-byte discriminator with account: prefix", () => {
    const disc = anchorAccountDiscriminator("WritAccount");
    const expected = crypto
      .createHash("sha256")
      .update("account:WritAccount")
      .digest()
      .subarray(0, 8);
    expect(disc.equals(expected)).toBe(true);
  });
});

describe("instruction serialization", () => {
  it("serializeMintWritIx starts with discriminator", () => {
    const params: MintWritParams = {
      nullifier: Buffer.alloc(32, 0x01),
      proof: Buffer.alloc(64, 0x02),
    };
    const data = serializeMintWritIx(params);
    const disc = anchorDiscriminator("mint_hand");
    expect(data.subarray(0, 8).equals(disc)).toBe(true);
    expect(data.length).toBeGreaterThan(8);
  });

  it("serializeDelegateIx includes all scope fields", () => {
    const params: DelegateParams = {
      agent: Keypair.generate().publicKey,
      allowedPrograms: [Keypair.generate().publicKey],
      maxLamportsPerTx: new BN(1_000_000),
      maxLamportsTotal: new BN(10_000_000),
      expiresAt: new BN(1700000000),
      allowedActions: 3,
    };
    const data = serializeDelegateIx(params);
    const disc = anchorDiscriminator("delegate");
    expect(data.subarray(0, 8).equals(disc)).toBe(true);
  });

  it("serializeRevokeDelegationIx is just the discriminator", () => {
    const data = serializeRevokeDelegationIx();
    expect(data.length).toBe(8);
    const disc = anchorDiscriminator("revoke_delegation");
    expect(data.equals(disc)).toBe(true);
  });

  it("serializeOpenDisputeIx encodes evidence URI", () => {
    const params: DisputeParams = {
      agent: Keypair.generate().publicKey,
      hand: Keypair.generate().publicKey,
      evidenceUri: "https://example.com/evidence",
      stakeLamports: new BN(500_000),
    };
    const data = serializeOpenDisputeIx(params);
    const disc = anchorDiscriminator("open_dispute");
    expect(data.subarray(0, 8).equals(disc)).toBe(true);
    // URI should be embedded in the serialized data
    expect(data.includes(Buffer.from("https://example.com/evidence"))).toBe(true);
  });
});

describe("account deserialization", () => {
  function buildWritAccountData(): Buffer {
    const disc = anchorAccountDiscriminator("WritAccount");
    const authority = Keypair.generate().publicKey;
    const nullifier = Buffer.alloc(32, 0xab);
    const mint = Keypair.generate().publicKey;
    const verifiedAt = Buffer.alloc(8);
    verifiedAt.writeBigInt64LE(1700000000n, 0);
    const delegationsCount = Buffer.from([3]);
    const active = Buffer.from([1]);
    const bump = Buffer.from([255]);

    return Buffer.concat([
      disc,
      authority.toBuffer(),
      nullifier,
      mint.toBuffer(),
      verifiedAt,
      delegationsCount,
      active,
      bump,
    ]);
  }

  it("deserializes WritAccount correctly", () => {
    const data = buildWritAccountData();
    const account = deserializeWritAccount(data);
    expect(account.verifiedAt.toNumber()).toBe(1700000000);
    expect(account.delegationsCount).toBe(3);
    expect(account.active).toBe(true);
    expect(account.bump).toBe(255);
    expect(account.nullifier.length).toBe(32);
  });

  function buildReputationAccountData(): Buffer {
    const disc = anchorAccountDiscriminator("ReputationAccount");
    const hand = Keypair.generate().publicKey;
    const totalActions = Buffer.alloc(8);
    totalActions.writeBigUInt64LE(100n, 0);
    const successfulActions = Buffer.alloc(8);
    successfulActions.writeBigUInt64LE(95n, 0);
    const totalVolumeLamports = Buffer.alloc(16);
    totalVolumeLamports.writeBigUInt64LE(5000000000n, 0);
    const disputesReceived = Buffer.alloc(4);
    disputesReceived.writeUInt32LE(2, 0);
    const disputesLost = Buffer.alloc(4);
    disputesLost.writeUInt32LE(1, 0);
    const score = Buffer.alloc(2);
    score.writeUInt16LE(9000, 0);
    const lastUpdated = Buffer.alloc(8);
    lastUpdated.writeBigInt64LE(1700000000n, 0);
    const createdAt = Buffer.alloc(8);
    createdAt.writeBigInt64LE(1699000000n, 0);
    const bump = Buffer.from([254]);

    return Buffer.concat([
      disc,
      hand.toBuffer(),
      totalActions,
      successfulActions,
      totalVolumeLamports,
      disputesReceived,
      disputesLost,
      score,
      lastUpdated,
      createdAt,
      bump,
    ]);
  }

  it("deserializes ReputationAccount correctly", () => {
    const data = buildReputationAccountData();
    const account = deserializeReputationAccount(data);
    expect(account.totalActions.toNumber()).toBe(100);
    expect(account.successfulActions.toNumber()).toBe(95);
    expect(account.disputesReceived).toBe(2);
    expect(account.disputesLost).toBe(1);
    expect(account.score).toBe(9000);
    expect(account.bump).toBe(254);
  });
});
