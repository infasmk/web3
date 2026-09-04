import { ethers } from 'ethers';
import { logger } from '../config';

/**
 * @class NonceManager
 * @notice Thread-safe, serialized nonce manager with automatic on-chain re-sync.
 * Prevents nonce collisions and "replacement transaction underpriced" errors under concurrent load.
 */
export class NonceManager {
  private currentNonce: number | null = null;
  private isLocked: boolean = false;
  private queue: Array<() => void> = [];

  constructor(
    private readonly provider: ethers.JsonRpcProvider,
    private readonly walletAddress: string
  ) {}

  /**
   * Initializes or syncs the local nonce state with the pending transaction count on-chain.
   */
  public async syncNonce(): Promise<number> {
    const onChainPending = await this.provider.getTransactionCount(this.walletAddress, 'pending');
    this.currentNonce = onChainPending;
    logger.info(`🔄 Nonce synchronized for ${this.walletAddress}: ${this.currentNonce}`);
    return this.currentNonce;
  }

  /**
   * Acquires the sequential execution lock.
   */
  private async acquireLock(): Promise<void> {
    if (!this.isLocked) {
      this.isLocked = true;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }

  /**
   * Releases the sequential execution lock to the next queued task.
   */
  private releaseLock(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    } else {
      this.isLocked = false;
    }
  }

  /**
   * Executes a transaction closure while holding the sequential nonce lock.
   * Ensures monotonic nonces and automatic recovery on nonce error.
   */
  public async executeWithNonce<T>(
    fn: (nonce: number) => Promise<T>
  ): Promise<T> {
    await this.acquireLock();
    try {
      if (this.currentNonce === null) {
        await this.syncNonce();
      }

      const assignedNonce = this.currentNonce!;
      // Optimistically increment for the next transaction in sequence
      this.currentNonce! += 1;

      try {
        const result = await fn(assignedNonce);
        return result;
      } catch (err: any) {
        logger.warn(`⚠️ Error executing with nonce ${assignedNonce}: ${err.message}. Re-synchronizing nonce on-chain.`);
        // Reset and resync nonce on failure
        await this.syncNonce();
        throw err;
      }
    } finally {
      this.releaseLock();
    }
  }

  /**
   * Returns current pending nonce for health monitoring.
   */
  public async getPendingNonce(): Promise<number> {
    return this.provider.getTransactionCount(this.walletAddress, 'pending');
  }
}
