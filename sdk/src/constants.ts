export const HAND_SEED = Buffer.from("hand");
export const NULLIFIER_SEED = Buffer.from("nullifier");
export const DELEGATION_SEED = Buffer.from("delegation");
export const REPUTATION_SEED = Buffer.from("reputation");
export const REPORTER_SEED = Buffer.from("reporter");
export const DISPUTE_SEED = Buffer.from("dispute");

export const ACTION_SWAP = 1;
export const ACTION_STAKE = 2;
export const ACTION_TRANSFER = 4;
export const ACTION_VOTE = 8;
export const ACTION_MINT = 16;
export const ACTION_ALL = 0xffff;

export const MAX_DELEGATIONS = 5;
export const MAX_ALLOWED_PROGRAMS = 10;
export const MAX_SCORE = 10_000;
