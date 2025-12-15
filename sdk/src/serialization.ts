import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  HandAccount,
  DelegationAccount,
  DelegationScope,
  ReputationAccount,
  DisputeAccount,
  DisputeStatus,
  ReporterAccount,
  DelegateParams,
  UpdateScopeParams,
  ConsumeParams,
  DisputeParams,
  MintHandParams,
} from "./types.js";

/* ------------------------------------------------------------------ */
/*  Anchor discriminator                                               */
/* ------------------------------------------------------------------ */

/**
 * Compute the 8-byte Anchor instruction discriminator.
 * sha256("global:<instruction_name>")[0..8]
 */
export function anchorDiscriminator(instructionName: string): Buffer {
  const crypto = require("crypto") as typeof import("crypto");
  const hash = crypto
    .createHash("sha256")
    .update(`global:${instructionName}`)
    .digest();
  return hash.subarray(0, 8);
}

/**
 * Compute the 8-byte Anchor account discriminator.
 * sha256("account:<AccountName>")[0..8]
 */
export function anchorAccountDiscriminator(accountName: string): Buffer {
  const crypto = require("crypto") as typeof import("crypto");
  const hash = crypto
    .createHash("sha256")
    .update(`account:${accountName}`)
    .digest();
  return hash.subarray(0, 8);
}

/* ------------------------------------------------------------------ */
/*  Low-level buffer helpers                                           */
/* ------------------------------------------------------------------ */

class BufferWriter {
  private parts: Buffer[] = [];

  writeU8(v: number): void {
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.parts.push(b);
  }

  writeU16LE(v: number): void {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(v, 0);
    this.parts.push(b);
  }

  writeU32LE(v: number): void {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v, 0);
    this.parts.push(b);
  }

  writeI64LE(v: BN): void {
    const b = v.toArrayLike(Buffer, "le", 8);
    this.parts.push(b);
  }

  writeU64LE(v: BN): void {
    const b = v.toArrayLike(Buffer, "le", 8);
    this.parts.push(b);
  }

  writeU128LE(v: BN): void {
    const b = v.toArrayLike(Buffer, "le", 16);
    this.parts.push(b);
  }

  writePubkey(pk: PublicKey): void {
    this.parts.push(pk.toBuffer());
  }

  writeBool(v: boolean): void {
    this.writeU8(v ? 1 : 0);
  }

  writeBytes(data: Buffer): void {
    this.writeU32LE(data.length);
    this.parts.push(data);
  }

  writeString(s: string): void {
    const encoded = Buffer.from(s, "utf-8");
    this.writeU32LE(encoded.length);
    this.parts.push(encoded);
  }

  writePubkeyVec(keys: PublicKey[]): void {
    this.writeU32LE(keys.length);
    for (const k of keys) {
      this.writePubkey(k);
    }
  }

  writeFixedBytes(data: Buffer): void {
    this.parts.push(data);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.parts);
  }
}

class BufferReader {
  private offset = 0;
  constructor(private data: Buffer) {}

  readU8(): number {
    const v = this.data.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readU16LE(): number {
    const v = this.data.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  readU32LE(): number {
    const v = this.data.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  readI64LE(): BN {
    const slice = this.data.subarray(this.offset, this.offset + 8);
    this.offset += 8;
    return new BN(slice, "le");
  }

  readU64LE(): BN {
    const slice = this.data.subarray(this.offset, this.offset + 8);
    this.offset += 8;
    return new BN(slice, "le");
  }

  readU128LE(): BN {
    const slice = this.data.subarray(this.offset, this.offset + 16);
    this.offset += 16;
    return new BN(slice, "le");
  }

  readPubkey(): PublicKey {
    const slice = this.data.subarray(this.offset, this.offset + 32);
    this.offset += 32;
    return new PublicKey(slice);
  }

  readBool(): boolean {
    return this.readU8() === 1;
  }

  readBytes(): Buffer {
    const len = this.readU32LE();
    const slice = this.data.subarray(this.offset, this.offset + len);
    this.offset += len;
    return Buffer.from(slice);
  }

  readFixedBytes(len: number): number[] {
    const slice = this.data.subarray(this.offset, this.offset + len);
    this.offset += len;
    return Array.from(slice);
  }

  readString(): string {
    const len = this.readU32LE();
    const slice = this.data.subarray(this.offset, this.offset + len);
    this.offset += len;
    return slice.toString("utf-8");
  }

  readPubkeyVec(): PublicKey[] {
    const len = this.readU32LE();
    const keys: PublicKey[] = [];
    for (let i = 0; i < len; i++) {
      keys.push(this.readPubkey());
    }
    return keys;
  }

  skip(n: number): void {
    this.offset += n;
  }

  get remaining(): number {
    return this.data.length - this.offset;
  }
}

/* ------------------------------------------------------------------ */
/*  Instruction serialization                                          */
/* ------------------------------------------------------------------ */

export function serializeMintHandIx(params: MintHandParams): Buffer {
  const disc = anchorDiscriminator("mint_hand");
  const w = new BufferWriter();
  w.writeFixedBytes(disc);
  w.writeBytes(params.nullifier);
  w.writeBytes(params.proof);
  return w.toBuffer();
}

export function serializeDelegateIx(params: DelegateParams): Buffer {
  const disc = anchorDiscriminator("delegate");
  const w = new BufferWriter();
  w.writeFixedBytes(disc);
  w.writePubkeyVec(params.allowedPrograms);
  w.writeU64LE(params.maxLamportsPerTx);
  w.writeU64LE(params.maxLamportsTotal);
  w.writeI64LE(params.expiresAt);
  w.writeU16LE(params.allowedActions);
  return w.toBuffer();
}

export function serializeUpdateScopeIx(params: UpdateScopeParams): Buffer {
  const disc = anchorDiscriminator("update_scope");
  const w = new BufferWriter();
  w.writeFixedBytes(disc);
  w.writePubkeyVec(params.allowedPrograms);
  w.writeU64LE(params.maxLamportsPerTx);
  w.writeU64LE(params.maxLamportsTotal);
  w.writeI64LE(params.expiresAt);
  w.writeU16LE(params.allowedActions);
  return w.toBuffer();
}

export function serializeRevokeDelegationIx(): Buffer {
  return anchorDiscriminator("revoke_delegation");
}

export function serializeConsumeIx(params: ConsumeParams): Buffer {
  const disc = anchorDiscriminator("consume");
  const w = new BufferWriter();
  w.writeFixedBytes(disc);
  w.writeU16LE(params.action);
  w.writeU64LE(params.lamports);
  return w.toBuffer();
}

export function serializeInitializeReputationIx(): Buffer {
  return anchorDiscriminator("initialize_reputation");
}

export function serializeOpenDisputeIx(params: DisputeParams): Buffer {
  const disc = anchorDiscriminator("open_dispute");
  const w = new BufferWriter();
  w.writeFixedBytes(disc);
  w.writeString(params.evidenceUri);
  w.writeU64LE(params.stakeLamports);
  return w.toBuffer();
}

/* ------------------------------------------------------------------ */
/*  Account deserialization                                            */
/* ------------------------------------------------------------------ */

export function deserializeHandAccount(data: Buffer): HandAccount {
  const reader = new BufferReader(data);
  reader.skip(8); // discriminator
  const authority = reader.readPubkey();
  const nullifier = reader.readFixedBytes(32);
  const mint = reader.readPubkey();
  const verifiedAt = reader.readI64LE();
  const delegationsCount = reader.readU8();
  const active = reader.readBool();
  const bump = reader.readU8();
  return { authority, nullifier, mint, verifiedAt, delegationsCount, active, bump };
}

function readDelegationScope(reader: BufferReader): DelegationScope {
  const allowedPrograms = reader.readPubkeyVec();
  const maxLamportsPerTx = reader.readU64LE();
  const maxLamportsTotal = reader.readU64LE();
  const spentLamports = reader.readU64LE();
  const expiresAt = reader.readI64LE();
  const allowedActions = reader.readU16LE();
  return {
    allowedPrograms,
    maxLamportsPerTx,
    maxLamportsTotal,
    spentLamports,
    expiresAt,
    allowedActions,
  };
}

export function deserializeDelegationAccount(data: Buffer): DelegationAccount {
  const reader = new BufferReader(data);
  reader.skip(8); // discriminator
  const hand = reader.readPubkey();
  const agent = reader.readPubkey();
  const scope = readDelegationScope(reader);
  const delegatedAt = reader.readI64LE();
  const lastConsumedAt = reader.readI64LE();
  const active = reader.readBool();
  const bump = reader.readU8();
  return { hand, agent, scope, delegatedAt, lastConsumedAt, active, bump };
}

export function deserializeReputationAccount(data: Buffer): ReputationAccount {
  const reader = new BufferReader(data);
  reader.skip(8); // discriminator
  const hand = reader.readPubkey();
  const totalActions = reader.readU64LE();
  const successfulActions = reader.readU64LE();
  const totalVolumeLamports = reader.readU128LE();
  const disputesReceived = reader.readU32LE();
  const disputesLost = reader.readU32LE();
  const score = reader.readU16LE();
  const lastUpdated = reader.readI64LE();
  const createdAt = reader.readI64LE();
  const bump = reader.readU8();
  return {
    hand,
    totalActions,
    successfulActions,
    totalVolumeLamports,
    disputesReceived,
    disputesLost,
    score,
    lastUpdated,
    createdAt,
    bump,
  };
}

export function deserializeDisputeAccount(data: Buffer): DisputeAccount {
  const reader = new BufferReader(data);
  reader.skip(8); // discriminator
  const agent = reader.readPubkey();
  const challenger = reader.readPubkey();
  const hand = reader.readPubkey();
  const evidenceUri = reader.readString();
  const stakeLamports = reader.readU64LE();
  const statusByte = reader.readU8();
  const status: DisputeStatus =
    statusByte === 1
      ? DisputeStatus.Upheld
      : statusByte === 2
        ? DisputeStatus.Rejected
        : DisputeStatus.Pending;
  const createdAt = reader.readI64LE();
  const resolvedAt = reader.readI64LE();
  const bump = reader.readU8();
  return { agent, challenger, hand, evidenceUri, stakeLamports, status, createdAt, resolvedAt, bump };
}

export function deserializeReporterAccount(data: Buffer): ReporterAccount {
  const reader = new BufferReader(data);
  reader.skip(8); // discriminator
  const programId = reader.readPubkey();
  const authorizedBy = reader.readPubkey();
  const reportsSubmitted = reader.readU64LE();
  const registeredAt = reader.readI64LE();
  const active = reader.readBool();
  const bump = reader.readU8();
  return { programId, authorizedBy, reportsSubmitted, registeredAt, active, bump };
}
