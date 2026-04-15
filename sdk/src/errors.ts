export class WritProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WritProtocolError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class WritNotFoundError extends WritProtocolError {
  constructor(key: string) {
    super(`HAND account not found for ${key}`);
    this.name = "WritNotFoundError";
  }
}

export class DelegationNotFoundError extends WritProtocolError {
  constructor(hand: string, agent: string) {
    super(`Delegation not found for hand=${hand}, agent=${agent}`);
    this.name = "DelegationNotFoundError";
  }
}

export class ReputationNotFoundError extends WritProtocolError {
  constructor(hand: string) {
    super(`Reputation account not found for hand=${hand}`);
    this.name = "ReputationNotFoundError";
  }
}

export class InvalidProofError extends WritProtocolError {
  constructor() {
    super("Invalid zero-knowledge proof");
    this.name = "InvalidProofError";
  }
}

export class AgentNotVerifiedError extends WritProtocolError {
  constructor(agent: string) {
    super(`Agent ${agent} has no valid delegation from any HAND`);
    this.name = "AgentNotVerifiedError";
  }
}

export class DelegationExpiredError extends WritProtocolError {
  constructor(agent: string, expiresAt: number) {
    super(`Delegation for agent ${agent} expired at ${new Date(expiresAt * 1000).toISOString()}`);
    this.name = "DelegationExpiredError";
  }
}

export class InsufficientReputationError extends WritProtocolError {
  constructor(current: number, required: number) {
    super(`Reputation score ${current} is below required ${required}`);
    this.name = "InsufficientReputationError";
  }
}

export const ERROR_CODE_MAP: Record<number, string> = {
  6000: 'InvalidProof',
  6001: 'NullifierAlreadyUsed',
  6002: 'WritAlreadyExists',
  6003: 'MaxDelegationsReached',
};
