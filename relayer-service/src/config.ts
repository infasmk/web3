import dotenv from 'dotenv';
import { z } from 'zod';
import winston from 'winston';

dotenv.config();

const envSchema = z.object({
  BSC_CHAIN_ID: z.coerce.number().default(56),
  BSC_RPC_URL: z.string().url().default('https://bsc-dataseed1.binance.org'),
  BSC_FALLBACK_RPC_URLS: z.string().optional().default('https://bsc-dataseed2.binance.org,https://bsc-dataseed3.binance.org'),
  RELAYER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid 32-byte hex private key'),
  GATEWAY_CONTRACT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid gateway contract address'),
  TREASURY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid treasury address'),
  DEFAULT_TOKEN_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default('0x55d398326f99059fF775485246999027B3197955'),
  MAX_GAS_PRICE_GWEI: z.coerce.number().positive().default(5.0),
  GAS_LIMIT_BUFFER_PERCENT: z.coerce.number().min(0).max(100).default(15),
  REQUIRED_CONFIRMATIONS: z.coerce.number().min(1).default(1),
  MIN_RELAYER_BNB_BALANCE: z.coerce.number().positive().default(0.01),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.string().default('info'),
  RELAYER_API_SECRET: z.string().min(16).default('development_secret_key_1234567890'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Configuration validation failed:', parsed.error.format());
  // In development/test mode, fallback with default placeholder to avoid crashing if env is not yet populated
}

export const CONFIG = parsed.success
  ? parsed.data
  : {
      BSC_CHAIN_ID: Number(process.env.BSC_CHAIN_ID) || 56,
      BSC_RPC_URL: process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org',
      BSC_FALLBACK_RPC_URLS: process.env.BSC_FALLBACK_RPC_URLS || 'https://bsc-dataseed2.binance.org',
      RELAYER_PRIVATE_KEY:
        process.env.RELAYER_PRIVATE_KEY ||
        '0x1234567890123456789012345678901234567890123456789012345678901234',
      GATEWAY_CONTRACT_ADDRESS:
        process.env.GATEWAY_CONTRACT_ADDRESS ||
        '0x0000000000000000000000000000000000000000',
      TREASURY_ADDRESS:
        process.env.TREASURY_ADDRESS || '0x9957eb7d92998582c75D7344ffd9c6Dd03d4aADB',
      DEFAULT_TOKEN_ADDRESS:
        process.env.DEFAULT_TOKEN_ADDRESS ||
        '0x55d398326f99059fF775485246999027B3197955',
      MAX_GAS_PRICE_GWEI: Number(process.env.MAX_GAS_PRICE_GWEI) || 5.0,
      GAS_LIMIT_BUFFER_PERCENT: Number(process.env.GAS_LIMIT_BUFFER_PERCENT) || 15,
      REQUIRED_CONFIRMATIONS: Number(process.env.REQUIRED_CONFIRMATIONS) || 1,
      MIN_RELAYER_BNB_BALANCE: Number(process.env.MIN_RELAYER_BNB_BALANCE) || 0.01,
      PORT: Number(process.env.PORT) || 4000,
      HOST: process.env.HOST || '0.0.0.0',
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      RELAYER_API_SECRET: process.env.RELAYER_API_SECRET || 'development_secret_key_1234567890',
    };

export const logger = winston.createLogger({
  level: CONFIG.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `[${timestamp}] ${level}: ${message}${metaStr}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

export const GATEWAY_ABI = [
  'function processPayment(address token, address customer, uint256 amount, bytes32 orderId) external',
  'function batchProcessPayments(tuple(address token, address customer, uint256 amount, bytes32 orderId)[] payments) external',
  'function isOrderProcessed(bytes32 orderId) external view returns (bool)',
  'function checkPaymentReadiness(address token, address customer, uint256 amount) external view returns (bool ready, uint256 balance, uint256 allowance)',
  'function treasury() external view returns (address)',
  'function isRelayer(address relayer) external view returns (bool)',
  'function paused() external view returns (bool)',
  'event PaymentProcessed(address indexed customer, address indexed token, address indexed treasury, uint256 amount, bytes32 orderId, uint256 timestamp)'
];

export const ERC20_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];
