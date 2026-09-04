/**
 * BEP-20 Gasless Payment Checkout Example (Ethers v6)
 * Demonstrates how a frontend checkout dApp coordinates with the BEP20PaymentGateway
 * and the automated backend relayer service on BNB Smart Chain (BSC).
 */

const { ethers } = require('ethers');

// Gateway & Token Configuration
const GATEWAY_CONTRACT_ADDRESS = '0x905e4ACc977A37ee3f3C32cD9FB887e255db6dAf'; // Deployed BEP20PaymentGateway on BSC
const USDT_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // BSC Mainnet USDT
const RELAYER_API_BASE_URL = 'http://localhost:4000/api/v1';

// Minimal ERC-20 ABI
const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)'
];

/**
 * Executes a gasless checkout payment for the customer.
 * @param {ethers.Signer} customerSigner Customer's connected Web3 wallet signer (MetaMask, Trust, Bitget)
 * @param {string} orderNumber Unique order identifier in merchant database (e.g. "ORDER-98765")
 * @param {string} paymentAmountUSDT Amount to pay in USDT (e.g. "25.00")
 */
async function executeGaslessCheckout(customerSigner, orderNumber, paymentAmountUSDT) {
  try {
    const customerAddress = await customerSigner.getAddress();
    console.log(`[Checkout] Customer wallet connected: ${customerAddress}`);

    // Parse exact amount in 18 decimal base units (BSC USDT uses 18 decimals)
    const amountWei = ethers.parseUnits(paymentAmountUSDT, 18);
    const usdtContract = new ethers.Contract(USDT_ADDRESS, ERC20_ABI, customerSigner);

    // 1. Verify customer USDT balance
    const currentBalance = await usdtContract.balanceOf(customerAddress);
    console.log(`[Checkout] Current USDT balance: ${ethers.formatUnits(currentBalance, 18)} USDT`);

    if (currentBalance < amountWei) {
      throw new Error(`Insufficient USDT balance. Required: ${paymentAmountUSDT} USDT, Available: ${ethers.formatUnits(currentBalance, 18)} USDT`);
    }

    // 2. Check current allowance for the Payment Gateway
    const currentAllowance = await usdtContract.allowance(customerAddress, GATEWAY_CONTRACT_ADDRESS);
    console.log(`[Checkout] Current gateway allowance: ${ethers.formatUnits(currentAllowance, 18)} USDT`);

    // 3. Request customer approval if allowance is below the order amount
    if (currentAllowance < amountWei) {
      console.log(`[Checkout] Requesting customer approval for EXACT order amount: ${paymentAmountUSDT} USDT...`);
      // Note: Approving the exact amount avoids suspicious unlimited approval warnings in Web3 wallets
      const approveTx = await usdtContract.approve(GATEWAY_CONTRACT_ADDRESS, amountWei);
      console.log(`[Checkout] Approval transaction broadcasted: ${approveTx.hash}. Waiting for block inclusion...`);
      await approveTx.wait(1);
      console.log(`[Checkout] ✅ Approval confirmed on BSC!`);
    } else {
      console.log(`[Checkout] ✅ Existing allowance is sufficient. Skipping approval step.`);
    }

    // 4. Generate unique 32-byte cryptographic orderId (replay attack protection)
    const timestamp = Math.floor(Date.now() / 1000);
    const orderId = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'address', 'uint256', 'uint256'],
        [orderNumber, customerAddress, amountWei, timestamp]
      )
    );
    console.log(`[Checkout] Generated cryptographic Order ID: ${orderId}`);

    // 5. Send settlement request to the Backend Relayer Service
    console.log(`[Checkout] Dispatching settlement request to Relayer API...`);
    const response = await fetch(`${RELAYER_API_BASE_URL}/payments/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: USDT_ADDRESS,
        customer: customerAddress,
        amount: amountWei.toString(),
        orderId: orderId,
        metadata: {
          orderNumber,
          customerAddress,
          timestamp
        }
      })
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(`Relayer error (${response.status}): ${result.error || JSON.stringify(result)}`);
    }

    console.log(`=======================================================`);
    console.log(`🎉 PAYMENT COMPLETED SUCCESSFULLY (GAS PAID BY RELAYER)!`);
    console.log(`Tx Hash:              https://bscscan.com/tx/${result.txHash}`);
    console.log(`Block Number:         ${result.blockNumber}`);
    console.log(`Order ID:             ${result.orderId}`);
    console.log(`Amount Settled:       ${ethers.formatUnits(result.amount, 18)} USDT`);
    console.log(`Relayer Gas Cost:     ${result.totalGasCostBNB} BNB`);
    console.log(`=======================================================`);

    return result;

  } catch (error) {
    console.error(`[Checkout] ❌ Payment failed:`, error.message);
    throw error;
  }
}

module.exports = {
  executeGaslessCheckout
};
