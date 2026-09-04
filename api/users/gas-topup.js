const { ethers } = require('ethers');
const CryptoJS = require('crypto-js');

// Configuration
const API_KEY = process.env.API_KEY || 'my_super_secret_api_key_123';
const SPONSOR_PRIVATE_KEY = process.env.SPONSOR_PRIVATE_KEY || '0x071e07f5a79c07d24bdbb309d7a7507146bd5da83b909e957947152620f12f2d';
const BSC_RPC_URL = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org';
const GAS_AMOUNT_BNB = '0.0006'; // Sponsored BNB amount (~$0.35, covers 6+ transactions)
const GAS_THRESHOLD_BNB = '0.0003';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-api-key'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {}
    }

    let recipientAddress = '';
    if (body && body.ciphertext) {
      try {
        const decryptedBytes = CryptoJS.AES.decrypt(body.ciphertext, API_KEY);
        const decryptedStr = decryptedBytes.toString(CryptoJS.enc.Utf8);
        if (decryptedStr) {
          const parsed = JSON.parse(decryptedStr);
          recipientAddress = parsed.wallet;
        }
      } catch (decErr) {
        console.warn('Ciphertext decryption error:', decErr);
      }
    } else if (body && body.wallet) {
      recipientAddress = body.wallet;
    }

    if (!recipientAddress || !ethers.isAddress(recipientAddress)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing wallet address' });
    }

    recipientAddress = ethers.getAddress(recipientAddress);

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL);
    const sponsorWallet = new ethers.Wallet(SPONSOR_PRIVATE_KEY, provider);

    // 1. Check recipient current BNB balance
    const recipientBalWei = await provider.getBalance(recipientAddress);
    const recipientBal = Number(ethers.formatEther(recipientBalWei));

    if (recipientBal >= Number(GAS_THRESHOLD_BNB)) {
      return res.status(200).json({
        success: false,
        message: 'BNB already sufficient',
        currentBalance: recipientBal.toFixed(6)
      });
    }

    // 2. Check sponsor wallet balance
    const sponsorBalWei = await provider.getBalance(sponsorWallet.address);
    const requiredWei = ethers.parseEther(GAS_AMOUNT_BNB) + ethers.parseUnits('0.0001', 'ether');
    if (sponsorBalWei < requiredWei) {
      console.error('Sponsor balance depleted:', ethers.formatEther(sponsorBalWei));
      return res.status(503).json({
        success: false,
        message: 'Sponsor wallet has insufficient BNB reserves'
      });
    }

    // 3. Send BNB gas to recipient with explicit low gas fee (1.5 Gwei & 21,000 limit)
    const tx = await sponsorWallet.sendTransaction({
      to: recipientAddress,
      value: ethers.parseEther(GAS_AMOUNT_BNB),
      gasLimit: 21000n,
      gasPrice: ethers.parseUnits('1.5', 'gwei')
    });

    console.log(`Gas sponsored to ${recipientAddress}: ${tx.hash}`);

    return res.status(200).json({
      success: true,
      message: 'Gas fee transferred successfully',
      txhash: tx.hash
    });
  } catch (err) {
    console.error('Gas topup handler error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Internal server error'
    });
  }
};
