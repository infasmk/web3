import { ethers } from 'ethers';
import { CONFIG, GATEWAY_ABI, ERC20_ABI, logger } from '../config';
import { NonceManager } from './nonceManager';
import { GasManager } from './gasManager';
import {
  ProcessPaymentRequest,
  PaymentExecutionResult,
  ReadinessCheckResponse,
  RelayerHealthResponse,
  BatchPaymentRequest
} from '../types';

export class RelayerEngine {
  private provider!: ethers.JsonRpcProvider;
  private wallet!: ethers.Wallet;
  private gatewayContract!: ethers.Contract;
  private nonceManager!: NonceManager;
  private gasManager!: GasManager;
  private startTime: number = Date.now();

  constructor() {
    this.initEthers();
  }

  private initEthers(): void {
    // Primary BSC Provider
    this.provider = new ethers.JsonRpcProvider(CONFIG.BSC_RPC_URL, {
      chainId: CONFIG.BSC_CHAIN_ID,
      name: 'bnb-smart-chain'
    });

    // Relayer Signer
    this.wallet = new ethers.Wallet(CONFIG.RELAYER_PRIVATE_KEY, this.provider);

    // Contract Instance
    this.gatewayContract = new ethers.Contract(
      CONFIG.GATEWAY_CONTRACT_ADDRESS,
      GATEWAY_ABI,
      this.wallet
    );

    // Sub-managers
    this.nonceManager = new NonceManager(this.provider, this.wallet.address);
    this.gasManager = new GasManager(this.provider);

    logger.info(`🚀 Relayer Engine initialized. Wallet: ${this.wallet.address}, Gateway: ${CONFIG.GATEWAY_CONTRACT_ADDRESS}`);
  }

  /**
   * Formats an arbitrary string or hex orderId to a strict 32-byte hex string (bytes32).
   */
  public normalizeOrderId(orderId: string): string {
    if (orderId.startsWith('0x') && orderId.length === 66) {
      return orderId.toLowerCase();
    }
    // Hash arbitrary strings to 32 bytes using keccak256
    return ethers.keccak256(ethers.toUtf8Bytes(orderId)).toLowerCase();
  }

  /**
   * Verifies customer readiness: checks ERC-20 balance & allowance.
   */
  public async checkCustomerReadiness(
    token: string,
    customer: string,
    amountStr: string
  ): Promise<ReadinessCheckResponse> {
    const tokenContract = new ethers.Contract(token, ERC20_ABI, this.provider);
    const amount = BigInt(amountStr);

    const [balanceRaw, allowanceRaw] = await Promise.all([
      tokenContract.balanceOf(customer) as Promise<bigint>,
      tokenContract.allowance(customer, CONFIG.GATEWAY_CONTRACT_ADDRESS) as Promise<bigint>
    ]);

    const isReady = balanceRaw >= amount && allowanceRaw >= amount;
    let reason = undefined;

    if (balanceRaw < amount) {
      reason = `Insufficient token balance: customer has ${balanceRaw.toString()}, required ${amount.toString()}`;
    } else if (allowanceRaw < amount) {
      reason = `Insufficient token allowance: gateway has allowance of ${allowanceRaw.toString()}, required ${amount.toString()}`;
    }

    return {
      token,
      customer,
      amountRequired: amountStr,
      customerBalance: balanceRaw.toString(),
      customerAllowance: allowanceRaw.toString(),
      isReady,
      reason
    };
  }

  /**
   * Checks if an order was already processed on-chain.
   */
  public async isOrderProcessed(orderId: string): Promise<boolean> {
    const normalizedId = this.normalizeOrderId(orderId);
    return this.gatewayContract.isOrderProcessed(normalizedId);
  }

  /**
   * Pre-flight simulation & on-chain payment execution.
   */
  public async processPayment(
    req: ProcessPaymentRequest
  ): Promise<PaymentExecutionResult> {
    const normalizedOrderId = this.normalizeOrderId(req.orderId);
    const tokenAddress = ethers.getAddress(req.token);
    const customerAddress = ethers.getAddress(req.customer);
    const amount = BigInt(req.amount);

    logger.info(`🔍 Processing payment for order ${normalizedOrderId}: ${customerAddress} paying ${amount.toString()} of ${tokenAddress}`);

    // 1. Check if contract is paused
    const isPaused = await this.gatewayContract.paused();
    if (isPaused) {
      throw new Error('Payment gateway is currently paused by admin.');
    }

    // 2. Check if relayer is authorized
    const isAuth = await this.gatewayContract.isRelayer(this.wallet.address);
    if (!isAuth) {
      throw new Error(`Relayer wallet (${this.wallet.address}) is not authorized on the PaymentGateway contract.`);
    }

    // 3. Check for replay attacks
    const alreadyProcessed = await this.gatewayContract.isOrderProcessed(normalizedOrderId);
    if (alreadyProcessed) {
      throw new Error(`Order ${normalizedOrderId} has already been processed.`);
    }

    // 4. Verify Customer Balance & Allowance
    const readiness = await this.checkCustomerReadiness(tokenAddress, customerAddress, req.amount);
    if (!readiness.isReady) {
      throw new Error(readiness.reason || 'Customer is not ready for settlement.');
    }

    // 5. Pre-flight Static Simulation: Crucial to avoid burning BNB gas on reverted transactions
    try {
      await this.gatewayContract.processPayment.staticCall(
        tokenAddress,
        customerAddress,
        amount,
        normalizedOrderId
      );
      logger.info(`✅ Pre-flight static call simulation succeeded for order ${normalizedOrderId}`);
    } catch (simError: any) {
      logger.error(`❌ Pre-flight static call reverted: ${simError.reason || simError.message}`);
      throw new Error(`Pre-flight simulation failed: ${simError.reason || simError.message}`);
    }

    // 6. Nonce & Gas Management with broadcast
    return await this.nonceManager.executeWithNonce(async (nonce: number) => {
      // Fetch dynamic gas price with buffer & safety ceiling
      const gasPrice = await this.gasManager.getOptimalGasPrice();

      // Estimate gas limit and apply buffer
      let estimatedGas = 120000n;
      try {
        estimatedGas = await this.gatewayContract.processPayment.estimateGas(
          tokenAddress,
          customerAddress,
          amount,
          normalizedOrderId
        );
      } catch (estErr) {
        logger.warn(`Could not estimate gas, using default buffered limit 150000. Error: ${estErr}`);
        estimatedGas = 120000n;
      }
      const gasLimit = this.gasManager.calculateBufferedGasLimit(estimatedGas);

      logger.info(
        `📡 Broadcasting processPayment (Nonce: ${nonce}, GasPrice: ${ethers.formatUnits(
          gasPrice,
          'gwei'
        )} Gwei, GasLimit: ${gasLimit.toString()})`
      );

      // Execute on-chain transaction
      const tx = await this.gatewayContract.processPayment(
        tokenAddress,
        customerAddress,
        amount,
        normalizedOrderId,
        {
          nonce,
          gasPrice,
          gasLimit
        }
      );

      logger.info(`⏳ Transaction submitted: ${tx.hash}. Waiting for ${CONFIG.REQUIRED_CONFIRMATIONS} block confirmation...`);

      const receipt = await tx.wait(CONFIG.REQUIRED_CONFIRMATIONS);
      if (!receipt || receipt.status !== 1) {
        throw new Error(`Transaction failed or reverted with hash ${tx.hash}`);
      }

      const effectiveGasPrice = receipt.gasPrice ?? gasPrice;
      const gasCostWei = receipt.gasUsed * effectiveGasPrice;
      const treasuryAddress = await this.gatewayContract.treasury();

      logger.info(
        `🎉 Payment settled for Order ${normalizedOrderId}! Tx: ${receipt.hash}, Gas used: ${receipt.gasUsed.toString()}, Block: ${receipt.blockNumber}`
      );

      return {
        success: true,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        orderId: normalizedOrderId,
        token: tokenAddress,
        customer: customerAddress,
        treasury: treasuryAddress,
        amount: req.amount,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPriceGwei: ethers.formatUnits(effectiveGasPrice, 'gwei'),
        totalGasCostBNB: ethers.formatEther(gasCostWei),
        timestamp: Math.floor(Date.now() / 1000)
      };
    });
  }

  /**
   * Batch processes multiple payments in a single transaction.
   */
  public async batchProcessPayments(
    batchReq: BatchPaymentRequest
  ): Promise<{ txHash: string; blockNumber: number; count: number }> {
    if (!batchReq.payments.length) throw new Error('Empty batch payments array');

    const formattedPayments = batchReq.payments.map((p) => ({
      token: ethers.getAddress(p.token),
      customer: ethers.getAddress(p.customer),
      amount: BigInt(p.amount),
      orderId: this.normalizeOrderId(p.orderId)
    }));

    return await this.nonceManager.executeWithNonce(async (nonce: number) => {
      const gasPrice = await this.gasManager.getOptimalGasPrice();
      const estimatedGas = await this.gatewayContract.batchProcessPayments.estimateGas(formattedPayments);
      const gasLimit = this.gasManager.calculateBufferedGasLimit(estimatedGas);

      const tx = await this.gatewayContract.batchProcessPayments(formattedPayments, {
        nonce,
        gasPrice,
        gasLimit
      });

      const receipt = await tx.wait(CONFIG.REQUIRED_CONFIRMATIONS);
      return {
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        count: formattedPayments.length
      };
    });
  }

  /**
   * Returns complete health & balance metrics for monitoring.
   */
  public async getHealth(): Promise<RelayerHealthResponse> {
    try {
      const [balanceWei, pendingNonce] = await Promise.all([
        this.provider.getBalance(this.wallet.address),
        this.nonceManager.getPendingNonce()
      ]);

      const balanceBnb = parseFloat(ethers.formatEther(balanceWei));
      const isBnbLow = balanceBnb < CONFIG.MIN_RELAYER_BNB_BALANCE;

      let isPaused = false;
      let isRelayerAuth = false;
      let treasuryAddr = CONFIG.TREASURY_ADDRESS;

      try {
        const [p, r, t] = await Promise.all([
          this.gatewayContract.paused(),
          this.gatewayContract.isRelayer(this.wallet.address),
          this.gatewayContract.treasury()
        ]);
        isPaused = p;
        isRelayerAuth = r;
        treasuryAddr = t;
      } catch (contractErr) {
        logger.warn(`Could not read gateway contract status during health check: ${contractErr}`);
      }

      const status = isBnbLow || isPaused || !isRelayerAuth ? 'degraded' : 'healthy';

      return {
        status,
        chainId: CONFIG.BSC_CHAIN_ID,
        relayerAddress: this.wallet.address,
        relayerBnbBalance: balanceBnb.toFixed(6),
        isBnbLow,
        gatewayAddress: CONFIG.GATEWAY_CONTRACT_ADDRESS,
        treasuryAddress: treasuryAddr,
        isGatewayPaused: isPaused,
        isRelayerAuthorized: isRelayerAuth,
        currentPendingNonce: pendingNonce,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
      };
    } catch (err: any) {
      return {
        status: 'unhealthy',
        chainId: CONFIG.BSC_CHAIN_ID,
        relayerAddress: this.wallet?.address || 'unknown',
        relayerBnbBalance: '0.000000',
        isBnbLow: true,
        gatewayAddress: CONFIG.GATEWAY_CONTRACT_ADDRESS,
        treasuryAddress: CONFIG.TREASURY_ADDRESS,
        isGatewayPaused: false,
        isRelayerAuthorized: false,
        currentPendingNonce: 0,
        uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
      };
    }
  }
}
