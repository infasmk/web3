/**
 * One-click script to authorize a relayer on the BEP20PaymentGateway contract.
 * Usage: node scripts/authorize-relayer.js <OWNER_PRIVATE_KEY> <RELAYER_PUBLIC_ADDRESS>
 */

const { ethers } = require('ethers');

async function main() {
  const ownerPrivateKey = process.argv[2] || process.env.OWNER_PRIVATE_KEY;
  const relayerAddress = process.argv[3] || process.env.RELAYER_ADDRESS || '0xed6ab5B3EE03A3658f84EbB42EE141B6aBC6A27A';
  const gatewayAddress = '0x905e4ACc977A37ee3f3C32cD9FB887e255db6dAf';

  if (!ownerPrivateKey) {
    console.error('❌ Missing Owner Private Key.');
    console.log('Usage: node scripts/authorize-relayer.js <OWNER_PRIVATE_KEY> [RELAYER_ADDRESS]');
    process.exit(1);
  }

  const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
  const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);

  console.log(`📡 Connected to BSC Mainnet.`);
  console.log(`👤 Owner wallet:    ${ownerWallet.address}`);
  console.log(`📍 Gateway contract: ${gatewayAddress}`);
  console.log(`🤖 Authorizing:     ${relayerAddress}`);

  const abi = [
    'function owner() view returns (address)',
    'function isRelayer(address) view returns (bool)',
    'function setRelayer(address relayer, bool status) external'
  ];

  const gateway = new ethers.Contract(gatewayAddress, abi, ownerWallet);

  const contractOwner = await gateway.owner();
  if (contractOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
    console.error(`❌ Error: Wallet ${ownerWallet.address} is NOT the owner of this contract.`);
    console.error(`Contract owner is: ${contractOwner}`);
    process.exit(1);
  }

  const alreadyRelayer = await gateway.isRelayer(relayerAddress);
  if (alreadyRelayer) {
    console.log(`✅ Address ${relayerAddress} is ALREADY authorized as a relayer!`);
    return;
  }

  console.log(`⏳ Submitting setRelayer transaction...`);
  const feeData = await provider.getFeeData();
  const tx = await gateway.setRelayer(relayerAddress, true, {
    gasLimit: 80000,
    gasPrice: feeData.gasPrice ?? ethers.parseUnits('3', 'gwei')
  });

  console.log(`🚀 Transaction broadcasted: https://bscscan.com/tx/${tx.hash}`);
  console.log(`⏳ Waiting for block confirmation...`);
  await tx.wait(1);

  const verified = await gateway.isRelayer(relayerAddress);
  console.log(`🎉 SUCCESS! Relayer status on-chain: ${verified}`);
}

main().catch((err) => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
