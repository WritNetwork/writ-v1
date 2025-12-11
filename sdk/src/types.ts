import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

/* ------------------------------------------------------------------ */
/*  Enums                                                              */
/* ------------------------------------------------------------------ */

export enum DisputeStatus {
  Pending = 0,
  Upheld = 1,
  Rejected = 2,
}

/* ------------------------------------------------------------------ */
/*  On-chain account shapes                                            */
/* ------------------------------------------------------------------ */

export interface HandAccount {
  authority: PublicKey;
  nullifier: number[];
  mint: PublicKey;
  verifiedAt: BN;
  delegationsCount: number;
  active: boolean;
  bump: number;
}

export interface DelegationScope {
  allowedPrograms: PublicKey[];
  maxLamportsPerTx: BN;
  maxLamportsTotal: BN;
  spentLamports: BN;
  expiresAt: BN;
  allowedActions: number;
}

export interface DelegationAccount {
  hand: PublicKey;
  agent: PublicKey;
  scope: DelegationScope;
  delegatedAt: BN;
  lastConsumedAt: BN;
  active: boolean;
  bump: number;
}

export interface ReputationAccount {
  hand: PublicKey;
  totalActions: BN;
  successfulActions: BN;
  totalVolumeLamports: BN;
  disputesReceived: number;
  disputesLost: number;
  score: number;
  lastUpdated: BN;
  createdAt: BN;
  bump: number;
}

export interface DisputeAccount {
  agent: PublicKey;
  challenger: PublicKey;
  hand: PublicKey;
  evidenceUri: string;
  stakeLamports: BN;
  status: DisputeStatus;
  createdAt: BN;
  resolvedAt: BN;
  bump: number;
}

export interface ReporterAccount {
  programId: PublicKey;
  authorizedBy: PublicKey;
  reportsSubmitted: BN;
  registeredAt: BN;
  active: boolean;
  bump: number;
}

export interface VerifyResult {
  isValid: boolean;
  handKey: PublicKey;
  reputationScore: number;
  delegatedAt: BN;
  expiresAt: BN;
  allowedActions: number;
}

/* ------------------------------------------------------------------ */
/*  Instruction parameter types                                        */
/* ------------------------------------------------------------------ */

export interface MintHandParams {
  nullifier: Buffer;
  proof: Buffer;
}

export interface DelegateParams {
  agent: PublicKey;
  allowedPrograms: PublicKey[];
  maxLamportsPerTx: BN;
  maxLamportsTotal: BN;
  expiresAt: BN;
  allowedActions: number;
}

export interface UpdateScopeParams {
  agent: PublicKey;
  allowedPrograms: PublicKey[];
  maxLamportsPerTx: BN;
  maxLamportsTotal: BN;
  expiresAt: BN;
  allowedActions: number;
}

export interface ConsumeParams {
  hand: PublicKey;
  agent: PublicKey;
  action: number;
  lamports: BN;
  targetProgram: PublicKey;
}

export interface DisputeParams {
  agent: PublicKey;
  hand: PublicKey;
  evidenceUri: string;
  stakeLamports: BN;
}
