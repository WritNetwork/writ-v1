import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  Transaction,
  TransactionSignature,
  GetProgramAccountsFilter,
} from "@solana/web3.js";
import BN from "bn.js";

import {
  HandAccount,
  DelegationAccount,
  ReputationAccount,
  DisputeAccount,
  VerifyResult,
  MintHandParams,
  DelegateParams,
  UpdateScopeParams,
  DisputeParams,
} from "./types.js";
import {
  findHandPda,
  findNullifierPda,
  findDelegationPda,
  findReputationPda,
  findDisputePda,
} from "./pda.js";
import {
  serializeMintHandIx,
  serializeDelegateIx,
  serializeUpdateScopeIx,
  serializeRevokeDelegationIx,
  serializeInitializeReputationIx,
  serializeOpenDisputeIx,
  deserializeHandAccount,
  deserializeDelegationAccount,
  deserializeReputationAccount,
  deserializeDisputeAccount,
  anchorAccountDiscriminator,
} from "./serialization.js";
import {
  HandNotFoundError,
  DelegationNotFoundError,
  AgentNotVerifiedError,
  DelegationExpiredError,
  InsufficientReputationError,
} from "./errors.js";
import { calculateReputationScore } from "./utils.js";
import { DELEGATION_SEED } from "./constants.js";

export interface HandProgramIds {
  handRegistry: PublicKey;
  delegation: PublicKey;
  reputation: PublicKey;
  handGate: PublicKey;
}

export class HandProtocol {
  private connection: Connection;
  private programIds: HandProgramIds;

  constructor(connection: Connection, programIds: HandProgramIds) {
    this.connection = connection;
    this.programIds = programIds;
  }

  /* ---------------------------------------------------------------- */
  /*  Hand operations                                                  */
  /* ---------------------------------------------------------------- */

  async mintHand(
    params: MintHandParams,
    payer: Keypair,
  ): Promise<TransactionSignature> {
    const [handPda] = findHandPda(payer.publicKey, this.programIds.handRegistry);
    const [nullifierPda] = findNullifierPda(params.nullifier, this.programIds.handRegistry);

    const data = serializeMintHandIx(params);

    const ix = new TransactionInstruction({
      programId: this.programIds.handRegistry,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: handPda, isSigner: false, isWritable: true },
        { pubkey: nullifierPda, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendTransaction([ix], [payer]);
  }

  async getHand(authority: PublicKey): Promise<HandAccount | null> {
    const [handPda] = findHandPda(authority, this.programIds.handRegistry);
    const accountInfo = await this.connection.getAccountInfo(handPda);
    if (!accountInfo) return null;
    return deserializeHandAccount(accountInfo.data as Buffer);
  }

  async hasHand(authority: PublicKey): Promise<boolean> {
    const [handPda] = findHandPda(authority, this.programIds.handRegistry);
    const accountInfo = await this.connection.getAccountInfo(handPda);
    return accountInfo !== null;
  }

  /* ---------------------------------------------------------------- */
  /*  Delegation operations                                            */
  /* ---------------------------------------------------------------- */

  async delegate(
    params: DelegateParams,
    handOwner: Keypair,
  ): Promise<TransactionSignature> {
    const [handPda] = findHandPda(handOwner.publicKey, this.programIds.handRegistry);
    const [delegationPda] = findDelegationPda(
      handPda,
      params.agent,
      this.programIds.delegation,
    );

    const data = serializeDelegateIx(params);

    const ix = new TransactionInstruction({
      programId: this.programIds.delegation,
      keys: [
        { pubkey: handOwner.publicKey, isSigner: true, isWritable: true },
        { pubkey: handPda, isSigner: false, isWritable: true },
        { pubkey: params.agent, isSigner: false, isWritable: false },
        { pubkey: delegationPda, isSigner: false, isWritable: true },
        { pubkey: this.programIds.handRegistry, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendTransaction([ix], [handOwner]);
  }

  async updateScope(
    params: UpdateScopeParams,
    handOwner: Keypair,
  ): Promise<TransactionSignature> {
    const [handPda] = findHandPda(handOwner.publicKey, this.programIds.handRegistry);
    const [delegationPda] = findDelegationPda(
      handPda,
      params.agent,
      this.programIds.delegation,
    );

    const data = serializeUpdateScopeIx(params);

    const ix = new TransactionInstruction({
      programId: this.programIds.delegation,
      keys: [
        { pubkey: handOwner.publicKey, isSigner: true, isWritable: false },
        { pubkey: handPda, isSigner: false, isWritable: false },
        { pubkey: delegationPda, isSigner: false, isWritable: true },
      ],
      data,
    });

    return this.sendTransaction([ix], [handOwner]);
  }

  async revokeDelegation(
    agent: PublicKey,
    handOwner: Keypair,
  ): Promise<TransactionSignature> {
    const [handPda] = findHandPda(handOwner.publicKey, this.programIds.handRegistry);
    const [delegationPda] = findDelegationPda(
      handPda,
      agent,
      this.programIds.delegation,
    );

    const data = serializeRevokeDelegationIx();

    const ix = new TransactionInstruction({
      programId: this.programIds.delegation,
      keys: [
        { pubkey: handOwner.publicKey, isSigner: true, isWritable: true },
        { pubkey: handPda, isSigner: false, isWritable: true },
        { pubkey: delegationPda, isSigner: false, isWritable: true },
        { pubkey: this.programIds.handRegistry, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendTransaction([ix], [handOwner]);
  }

  async getDelegation(
    hand: PublicKey,
    agent: PublicKey,
  ): Promise<DelegationAccount | null> {
    const [delegationPda] = findDelegationPda(
      hand,
      agent,
      this.programIds.delegation,
    );
    const accountInfo = await this.connection.getAccountInfo(delegationPda);
    if (!accountInfo) return null;
    return deserializeDelegationAccount(accountInfo.data as Buffer);
  }

  async getDelegationsForHand(
    hand: PublicKey,
  ): Promise<DelegationAccount[]> {
    const discriminator = anchorAccountDiscriminator("DelegationAccount");

    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: discriminator.toString("base64"), encoding: "base64" } },
      { memcmp: { offset: 8, bytes: hand.toBase58() } },
    ];

    const accounts = await this.connection.getProgramAccounts(
      this.programIds.delegation,
      { filters },
    );

    return accounts.map((a) =>
      deserializeDelegationAccount(a.account.data as Buffer),
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Verification                                                     */
  /* ---------------------------------------------------------------- */

  async verifyAgent(agent: PublicKey): Promise<VerifyResult> {
    const delegations = await this.findDelegationsForAgent(agent);

    if (delegations.length === 0) {
      throw new AgentNotVerifiedError(agent.toBase58());
    }

    const now = Math.floor(Date.now() / 1000);
    const activeDelegation = delegations.find(
      (d) => d.active && d.scope.expiresAt.toNumber() > now,
    );

    if (!activeDelegation) {
      const latest = delegations[0];
      throw new DelegationExpiredError(
        agent.toBase58(),
        latest.scope.expiresAt.toNumber(),
      );
    }

    const [handPda] = findHandPda(
      activeDelegation.hand,
      this.programIds.handRegistry,
    );

    let reputationScore = 0;
    try {
      const rep = await this.getReputation(activeDelegation.hand);
      if (rep) {
        reputationScore = calculateReputationScore(rep);
      }
    } catch {
      // reputation account may not exist yet
    }

    return {
      isValid: true,
      handKey: activeDelegation.hand,
      reputationScore,
      delegatedAt: activeDelegation.delegatedAt,
      expiresAt: activeDelegation.scope.expiresAt,
      allowedActions: activeDelegation.scope.allowedActions,
    };
  }

  async verifyAgentWithReputation(
    agent: PublicKey,
    minScore: number,
  ): Promise<VerifyResult> {
    const result = await this.verifyAgent(agent);

    if (result.reputationScore < minScore) {
      throw new InsufficientReputationError(result.reputationScore, minScore);
    }

    return result;
  }

  async verifyAgentWithScope(
    agent: PublicKey,
    requiredAction: number,
    requiredProgram: PublicKey,
    lamports: bigint,
  ): Promise<VerifyResult> {
    const delegations = await this.findDelegationsForAgent(agent);

    if (delegations.length === 0) {
      throw new AgentNotVerifiedError(agent.toBase58());
    }

    const now = Math.floor(Date.now() / 1000);
    const lamportsBN = new BN(lamports.toString());

    const matching = delegations.find((d) => {
      if (!d.active) return false;
      if (d.scope.expiresAt.toNumber() <= now) return false;
      if ((d.scope.allowedActions & requiredAction) === 0) return false;

      // Check program is in allowed list (empty list = all allowed)
      if (d.scope.allowedPrograms.length > 0) {
        const found = d.scope.allowedPrograms.some((p) =>
          p.equals(requiredProgram),
        );
        if (!found) return false;
      }

      // Check lamports limits
      if (lamportsBN.gt(d.scope.maxLamportsPerTx)) return false;
      const remaining = d.scope.maxLamportsTotal.sub(d.scope.spentLamports);
      if (lamportsBN.gt(remaining)) return false;

      return true;
    });

    if (!matching) {
      throw new AgentNotVerifiedError(agent.toBase58());
    }

    let reputationScore = 0;
    try {
      const rep = await this.getReputation(matching.hand);
      if (rep) {
        reputationScore = calculateReputationScore(rep);
      }
    } catch {
      // reputation account may not exist
    }

    return {
      isValid: true,
      handKey: matching.hand,
      reputationScore,
      delegatedAt: matching.delegatedAt,
      expiresAt: matching.scope.expiresAt,
      allowedActions: matching.scope.allowedActions,
    };
  }

  /* ---------------------------------------------------------------- */
  /*  Reputation                                                       */
  /* ---------------------------------------------------------------- */

  async getReputation(hand: PublicKey): Promise<ReputationAccount | null> {
    const [reputationPda] = findReputationPda(hand, this.programIds.reputation);
    const accountInfo = await this.connection.getAccountInfo(reputationPda);
    if (!accountInfo) return null;
    return deserializeReputationAccount(accountInfo.data as Buffer);
  }

  async initializeReputation(
    hand: PublicKey,
    payer: Keypair,
  ): Promise<TransactionSignature> {
    const [reputationPda] = findReputationPda(hand, this.programIds.reputation);
    const data = serializeInitializeReputationIx();

    const ix = new TransactionInstruction({
      programId: this.programIds.reputation,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: hand, isSigner: false, isWritable: false },
        { pubkey: reputationPda, isSigner: false, isWritable: true },
        { pubkey: this.programIds.handRegistry, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendTransaction([ix], [payer]);
  }

  /* ---------------------------------------------------------------- */
  /*  Dispute                                                          */
  /* ---------------------------------------------------------------- */

  async openDispute(
    params: DisputeParams,
    challenger: Keypair,
  ): Promise<TransactionSignature> {
    const [disputePda] = findDisputePda(
      params.agent,
      challenger.publicKey,
      this.programIds.reputation,
    );
    const [reputationPda] = findReputationPda(
      params.hand,
      this.programIds.reputation,
    );

    const data = serializeOpenDisputeIx(params);

    const ix = new TransactionInstruction({
      programId: this.programIds.reputation,
      keys: [
        { pubkey: challenger.publicKey, isSigner: true, isWritable: true },
        { pubkey: params.agent, isSigner: false, isWritable: false },
        { pubkey: params.hand, isSigner: false, isWritable: false },
        { pubkey: disputePda, isSigner: false, isWritable: true },
        { pubkey: reputationPda, isSigner: false, isWritable: true },
        { pubkey: this.programIds.handRegistry, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    });

    return this.sendTransaction([ix], [challenger]);
  }

  async getDispute(
    agent: PublicKey,
    challenger: PublicKey,
  ): Promise<DisputeAccount | null> {
    const [disputePda] = findDisputePda(
      agent,
      challenger,
      this.programIds.reputation,
    );
    const accountInfo = await this.connection.getAccountInfo(disputePda);
    if (!accountInfo) return null;
    return deserializeDisputeAccount(accountInfo.data as Buffer);
  }

  /* ---------------------------------------------------------------- */
  /*  Internal helpers                                                 */
  /* ---------------------------------------------------------------- */

  private async findDelegationsForAgent(
    agent: PublicKey,
  ): Promise<DelegationAccount[]> {
    const discriminator = anchorAccountDiscriminator("DelegationAccount");

    // agent is at offset 8 (discriminator) + 32 (hand pubkey) = 40
    const filters: GetProgramAccountsFilter[] = [
      { memcmp: { offset: 0, bytes: discriminator.toString("base64"), encoding: "base64" } },
      { memcmp: { offset: 40, bytes: agent.toBase58() } },
    ];

    const accounts = await this.connection.getProgramAccounts(
      this.programIds.delegation,
      { filters },
    );

    return accounts.map((a) =>
      deserializeDelegationAccount(a.account.data as Buffer),
    );
  }

  private async sendTransaction(
    instructions: TransactionInstruction[],
    signers: Keypair[],
  ): Promise<TransactionSignature> {
    const tx = new Transaction();
    for (const ix of instructions) {
      tx.add(ix);
    }

    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = signers[0].publicKey;

    tx.sign(...signers);

    const rawTx = tx.serialize();
    const signature = await this.connection.sendRawTransaction(rawTx, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    await this.connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed",
    );

    return signature;
  }
}

// Default commitment for read operations
const DEFAULT_COMMITMENT = 'confirmed';
