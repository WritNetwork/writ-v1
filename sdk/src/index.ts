export {
  HAND_SEED,
  NULLIFIER_SEED,
  DELEGATION_SEED,
  REPUTATION_SEED,
  REPORTER_SEED,
  DISPUTE_SEED,
  ACTION_SWAP,
  ACTION_STAKE,
  ACTION_TRANSFER,
  ACTION_VOTE,
  ACTION_MINT,
  ACTION_ALL,
  MAX_DELEGATIONS,
  MAX_ALLOWED_PROGRAMS,
  MAX_SCORE,
} from "./constants.js";

export {
  DisputeStatus,
} from "./types.js";

export type {
  HandAccount,
  DelegationScope,
  DelegationAccount,
  ReputationAccount,
  DisputeAccount,
  ReporterAccount,
  VerifyResult,
  MintHandParams,
  DelegateParams,
  UpdateScopeParams,
  ConsumeParams,
  DisputeParams,
} from "./types.js";

export {
  HandProtocolError,
  HandNotFoundError,
  DelegationNotFoundError,
  ReputationNotFoundError,
  InvalidProofError,
  AgentNotVerifiedError,
  DelegationExpiredError,
  InsufficientReputationError,
} from "./errors.js";

export {
  findHandPda,
  findNullifierPda,
  findDelegationPda,
  findReputationPda,
  findReporterPda,
  findDisputePda,
} from "./pda.js";

export {
  anchorDiscriminator,
  anchorAccountDiscriminator,
  serializeMintHandIx,
  serializeDelegateIx,
  serializeUpdateScopeIx,
  serializeRevokeDelegationIx,
  serializeConsumeIx,
  serializeInitializeReputationIx,
  serializeOpenDisputeIx,
  deserializeHandAccount,
  deserializeDelegationAccount,
  deserializeReputationAccount,
  deserializeDisputeAccount,
  deserializeReporterAccount,
} from "./serialization.js";

export {
  parseActions,
  formatActions,
  parseDuration,
  lamportsToSol,
  solToLamports,
  shortenPubkey,
  calculateReputationScore,
} from "./utils.js";

export { HandProtocol } from "./client.js";
export type { HandProgramIds } from "./client.js";
// Re-export version for consumers
