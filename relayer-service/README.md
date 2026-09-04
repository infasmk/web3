# BEP-20 Payment Gateway & Gasless Relayer Service (BNB Smart Chain)

Production-grade, gasless merchant settlement gateway for BEP-20 tokens (e.g. USDT) on BNB Smart Chain (BSC).

---

## Architecture Overview

1. **User Role**: Customer connects their Web3 wallet (MetaMask, Bitget, Trust Wallet) and approves the **exact payment amount** to the `BEP20PaymentGateway` contract.
2. **Relayer Service**: A secure Node.js / TypeScript backend service that monitors incoming payment requests, simulates the transfer, submits the transaction on-chain, and **absorbs the BNB gas costs**.
3. **Smart Contract Role**: Verifies that the caller is an authorized relayer, prevents replay attacks via cryptographic order IDs, validates allowances and balances, and safely transfers tokens directly to the merchant's treasury wallet.

```
Customer Wallet                 Backend Relayer              BSC Blockchain
      │                               │                             │
      ├─ 1. approve(gateway, $50) ───►│                             │ (User pays no settlement gas)
      │                               │                             │
      ├─ 2. POST /payments/process ──►│                             │
      │                               ├─ 3. Pre-flight staticCall ──►
      │                               ├─ 4. Nonce & Gas Management  │
      │                               ├─ 5. processPayment(...) ───►│ (Relayer pays BNB gas)
      │                               │                             │
      │                               │◄─── 6. Tx Receipt & Event ──┤
      │◄─ 7. Order Confirmation ──────┤                             │
```

---

## 1. Smart Contract Deployment (`BEP20PaymentGateway`)

The smart contract is available in two formats in the `contracts/` directory:
- `contracts/BEP20PaymentGateway.sol`: Standard OpenZeppelin v5 modular contract.
- `contracts/BEP20PaymentGateway_Flattened.sol`: Fully self-contained, zero-dependency version ready for instant deployment in Remix IDE or Hardhat.

### Deployment Parameters:
- `_initialOwner`: Admin wallet address (Ownable2Step for secure ownership transfer).
- `_treasury`: Merchant wallet address where customer funds are delivered.
- `_initialRelayer`: Public address of the backend relayer wallet that will submit settlement transactions.

### Verifying on BSCScan:
1. Select Compiler Version: `v0.8.20+commit.a1b79de6` (or matching 0.8.20 build).
2. Optimization: Enabled (200 runs).
3. Paste the contents of `BEP20PaymentGateway_Flattened.sol`.

---

## 2. Backend Relayer Service Setup

### Prerequisites
- Node.js `v18+` or `v20+`
- A BSC wallet funded with a small amount of BNB (e.g., 0.05 BNB) to cover transaction gas fees.

### Installation
```bash
cd relayer-service
npm install
```

### Configuration
Copy `.env.example` to `.env` and fill in your details:
```bash
cp .env.example .env
```

Key environment variables:
```ini
BSC_CHAIN_ID=56
BSC_RPC_URL="https://bsc-dataseed1.binance.org"
RELAYER_PRIVATE_KEY="0xYourRelayerPrivateKeyHere"
GATEWAY_CONTRACT_ADDRESS="0xYourDeployedGatewayAddress"
TREASURY_ADDRESS="0xYourMerchantTreasuryAddress"
MAX_GAS_PRICE_GWEI=5.0
PORT=4000
```

### Running the Relayer
```bash
# Development mode with hot-reload
npm run dev

# Production build and run
npm run build
npm start
```

---

## 3. REST API Endpoints

### `POST /api/v1/payments/process`
Submits and executes a customer payment settlement.
**Request Body:**
```json
{
  "token": "0x55d398326f99059fF775485246999027B3197955",
  "customer": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "amount": "25000000000000000000",
  "orderId": "0x4b72616b656e2d6f726465722d39383736350000000000000000000000000000"
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "txHash": "0x8f06...",
  "blockNumber": 39821045,
  "orderId": "0x4b72...",
  "token": "0x55d3...",
  "customer": "0x7099...",
  "treasury": "0x9957...",
  "amount": "25000000000000000000",
  "gasUsed": "84320",
  "effectiveGasPriceGwei": "3.0",
  "totalGasCostBNB": "0.00025296",
  "timestamp": 1725450000
}
```

### `GET /api/v1/payments/readiness?token=...&customer=...&amount=...`
Validates that the customer has sufficient token balance and has approved the gateway before calling process.

### `GET /api/v1/payments/order/:orderId`
Checks whether a given order ID has already been executed on-chain (replay protection check).

### `GET /api/v1/health`
Monitors relayer wallet BNB balance, pending nonces, and smart contract paused state.

---

## 4. Key Security & Production Features

1. **Pre-flight Static Simulation (`staticCall`)**:
   Before broadcasting any transaction to the BSC mempool, the relayer simulates `processPayment.staticCall(...)`. If the customer revoked allowance or depleted their balance, the relayer catches the error locally without spending any BNB gas.

2. **Sequential Mutex Nonce Manager**:
   Prevents transaction collisions, `NONCE_EXPIRED`, and `REPLACEMENT_UNDERPRICED` errors when multiple customers checkout simultaneously.

3. **Gas Ceiling Protection (`MAX_GAS_PRICE_GWEI`)**:
   Protects the relayer wallet from burning excessive BNB during network congestion.

4. **Checks-Effects-Interactions & Replay Protection**:
   `processedOrders[orderId]` is marked `true` prior to token transfer to completely prevent replay and reentrancy attacks.

5. **SafeERC20 Compatibility**:
   Supports all BEP-20 token implementations, including tokens that do not return a boolean value on transfer.
