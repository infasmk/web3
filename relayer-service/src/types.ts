export interface ProcessPaymentRequest {
  token: string;
  customer: string;
  amount: string; // Base units (e.g. 1000000000000000000 for 1 USDT 18 decimals)
  orderId: string; // 32-byte hex string (0x...) or plaintext string to be hashed
  metadata?: Record<string, unknown>;
}

export interface BatchPaymentRequest {
  payments: ProcessPaymentRequest[];
}

export interface PaymentExecutionResult {
  success: boolean;
  txHash: string;
  blockNumber: number;
  orderId: string;
  token: string;
  customer: string;
  treasury: string;
  amount: string;
  gasUsed: string;
  effectiveGasPriceGwei: string;
  totalGasCostBNB: string;
  timestamp: number;
}

export interface OrderStatusResponse {
  orderId: string;
  isProcessed: boolean;
  timestamp?: number;
}

export interface ReadinessCheckResponse {
  token: string;
  customer: string;
  amountRequired: string;
  customerBalance: string;
  customerAllowance: string;
  isReady: boolean;
  reason?: string;
}

export interface RelayerHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  chainId: number;
  relayerAddress: string;
  relayerBnbBalance: string;
  isBnbLow: boolean;
  gatewayAddress: string;
  treasuryAddress: string;
  isGatewayPaused: boolean;
  isRelayerAuthorized: boolean;
  currentPendingNonce: number;
  uptimeSeconds: number;
}
