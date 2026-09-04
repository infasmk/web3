import { ethers } from 'ethers';
import { CONFIG, logger } from '../config';

/**
 * @class GasManager
 * @notice Handles dynamic BSC gas price calculation, safety ceilings, and gas limit buffering.
 */
export class GasManager {
  constructor(private readonly provider: ethers.JsonRpcProvider) {}

  /**
   * Calculates the optimal gas price with safety limits.
   * BSC standard gas price is usually 1 - 3 Gwei.
   */
  public async getOptimalGasPrice(): Promise<bigint> {
    const feeData = await this.provider.getFeeData();
    let gasPrice = feeData.gasPrice ?? ethers.parseUnits('3', 'gwei');

    // Add 10% buffer to guarantee fast inclusion into the next BSC block (3 sec block time)
    const bufferedGasPrice = (gasPrice * 110n) / 100n;

    // Minimum BSC gas price floor is 1 Gwei, recommended 3 Gwei for fast relaying
    const minFloor = ethers.parseUnits('1', 'gwei');
    let effectiveGasPrice = bufferedGasPrice < minFloor ? minFloor : bufferedGasPrice;

    // Safety ceiling enforcement
    const maxGasPrice = ethers.parseUnits(CONFIG.MAX_GAS_PRICE_GWEI.toString(), 'gwei');
    if (effectiveGasPrice > maxGasPrice) {
      logger.error(
        `🚨 BSC gas price (${ethers.formatUnits(effectiveGasPrice, 'gwei')} Gwei) exceeds configured ceiling (${CONFIG.MAX_GAS_PRICE_GWEI} Gwei).`
      );
      throw new Error(
        `Gas price spike: current network gas price (${ethers.formatUnits(effectiveGasPrice, 'gwei')} Gwei) exceeds max allowed (${CONFIG.MAX_GAS_PRICE_GWEI} Gwei)`
      );
    }

    return effectiveGasPrice;
  }

  /**
   * Applies safety buffer to estimated gas units.
   */
  public calculateBufferedGasLimit(estimatedUnits: bigint): bigint {
    const bufferPercent = BigInt(CONFIG.GAS_LIMIT_BUFFER_PERCENT);
    return estimatedUnits + (estimatedUnits * bufferPercent) / 100n;
  }
}
