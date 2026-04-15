import { Keypair, PublicKey } from "@solana/web3.js";
import {
  findWritPda,
  findNullifierPda,
  findDelegationPda,
  findReputationPda,
  findReporterPda,
  findDisputePda,
} from "../pda.js";
import { HAND_SEED, NULLIFIER_SEED, DELEGATION_SEED, REPUTATION_SEED, REPORTER_SEED, DISPUTE_SEED } from "../constants.js";

const PROGRAM_ID = new PublicKey("11111111111111111111111111111111");

describe("PDA derivation", () => {
  it("findWritPda derives deterministically", () => {
    const authority = Keypair.generate().publicKey;
    const [pda1, bump1] = findWritPda(authority, PROGRAM_ID);
    const [pda2, bump2] = findWritPda(authority, PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
    expect(bump1).toBe(bump2);
  });

  it("findWritPda matches manual derivation", () => {
    const authority = Keypair.generate().publicKey;
    const [pda] = findWritPda(authority, PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [HAND_SEED, authority.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findNullifierPda derives deterministically", () => {
    const nullifier = Buffer.alloc(32, 0xab);
    const [pda1] = findNullifierPda(nullifier, PROGRAM_ID);
    const [pda2] = findNullifierPda(nullifier, PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(true);
  });

  it("findDelegationPda uses hand + agent seeds", () => {
    const hand = Keypair.generate().publicKey;
    const agent = Keypair.generate().publicKey;
    const [pda] = findDelegationPda(hand, agent, PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [DELEGATION_SEED, hand.toBuffer(), agent.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findReputationPda uses hand seed", () => {
    const hand = Keypair.generate().publicKey;
    const [pda] = findReputationPda(hand, PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [REPUTATION_SEED, hand.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findReporterPda uses reporter program seed", () => {
    const reporter = Keypair.generate().publicKey;
    const [pda] = findReporterPda(reporter, PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [REPORTER_SEED, reporter.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("findDisputePda uses agent + challenger seeds", () => {
    const agent = Keypair.generate().publicKey;
    const challenger = Keypair.generate().publicKey;
    const [pda] = findDisputePda(agent, challenger, PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [DISPUTE_SEED, agent.toBuffer(), challenger.toBuffer()],
      PROGRAM_ID,
    );
    expect(pda.equals(expected)).toBe(true);
  });

  it("different authorities produce different PDAs", () => {
    const a1 = Keypair.generate().publicKey;
    const a2 = Keypair.generate().publicKey;
    const [pda1] = findWritPda(a1, PROGRAM_ID);
    const [pda2] = findWritPda(a2, PROGRAM_ID);
    expect(pda1.equals(pda2)).toBe(false);
  });
});
