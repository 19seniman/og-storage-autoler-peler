require('dotenv').config();
const { ethers, Wallet, JsonRpcProvider, Interface, Contract } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

const controllerColors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    bright: "\x1b[1m"
};

const logger = {
    info: (msg) => console.log(`${controllerColors.cyan}[i] ${msg}${controllerColors.reset}`),
    warn: (msg) => console.log(`${controllerColors.yellow}[!] ${msg}${controllerColors.reset}`),
    error: (msg) => console.log(`${controllerColors.red}[x] ${msg}${controllerColors.reset}`),
    success: (msg) => console.log(`${controllerColors.green}[+] ${msg}${controllerColors.reset}`),
    loading: (msg) => console.log(`${controllerColors.magenta}[*] ${msg}${controllerColors.reset}`),
    step: (msg) => console.log(`${controllerColors.blue}[>] ${controllerColors.bright}${msg}${controllerColors.reset}`),
    critical: (msg) => console.log(`${controllerColors.red}${controllerColors.bright}[FATAL] ${msg}${controllerColors.reset}`),
    summary: (msg) => console.log(`${controllerColors.green}${controllerColors.bright}[SUMMARY] ${msg}${controllerColors.reset}`),
    banner: (titleText = "0G Storage Scan & Jaine Bot - Airdrop Insiders") => {
        const titleLine = `║      ${titleText.padEnd(30)} ║`;
        const border = `${controllerColors.blue}${controllerColors.bright}╔═════════════════════════════════════════╗${controllerColors.reset}`;
        const title = `${controllerColors.blue}${controllerColors.bright}${titleLine}${controllerColors.reset}`;
        const bottomBorder = `${controllerColors.blue}${controllerColors.bright}╚═════════════════════════════════════════╝${controllerColors.reset}`;
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(45);
        console.log(`\n${controllerColors.gray}${line}${controllerColors.reset}`);
        if (msg) console.log(`${controllerColors.white}${controllerColors.bright} ${msg} ${controllerColors.reset}`);
        console.log(`${controllerColors.gray}${line}${controllerColors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${controllerColors.blue}[⏰] ${msg}${controllerColors.reset}`),
    wallet: (msg) => console.log(`${controllerColors.yellow}[➤] ${msg}${controllerColors.reset}`),
};

// Ethers v6 compatible functions
const parseUnits = ethers.parseUnits;
const parseEther = ethers.parseEther;
const formatEther = ethers.formatEther;
const formatUnits = ethers.formatUnits; // Added for Jaine bot functions

const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CHAIN_ID = 16601;
const CONTRACT_ADDRESS = '0x5f1d96895e442fc0168fa2f9fb1ebef93cb5035e'; // 0G Storage Contract
const METHOD_ID = '0xef3e12dc'; // 0G Storage Method ID
const PROXY_FILE = 'proxies.txt';
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai';
const EXPLORER_URL = 'https://chainscan-galileo.0g.ai/tx/';

const IMAGE_SOURCES = [
    { url: 'https://picsum.photos/800/600', responseType: 'arraybuffer' },
    { url: 'https://loremflickr.com/800/600', responseType: 'arraybuffer' }
];

const contracts = {
    router: '0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c',
    positionsNFT: '0x44f24b66b3baa3a784dbeee9bfe602f15a2cc5d9',
    USDT: '0x3ec8a8705be1d5ca90066b37ba62c4183b024ebf',
    BTC: '0x36f6414ff1df609214ddaba71c84f18bcf00f67d',
    ETH: '0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c',
    GIMO: '0xba2ae6c8cddd628a087d7e43c1ba9844c5bf9638'
};

const tokenDecimals = {
    USDT: 18,
    BTC: 18,
    ETH: 18,
    GIMO: 18
};

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

let privateKeys = [];
let currentKeyIndex = 0;

const provider = new JsonRpcProvider(RPC_URL);

function loadPrivateKeys() {
    try {
        let index = 1;
        let key = process.env[`PRIVATE_KEY_${index}`];

        if (!key && index === 1 && process.env.PRIVATE_KEY) {
            key = process.env.PRIVATE_KEY;
        }

        while (key) {
            if (isValidPrivateKey(key)) {
                privateKeys.push(key);
            } else {
                logger.error(`Invalid private key at PRIVATE_KEY_${index}`);
            }
            index++;
            key = process.env[`PRIVATE_KEY_${index}`];
        }

        if (privateKeys.length === 0) {
            logger.critical('No valid private keys found in .env file');
            process.exit(1);
        }

        logger.success(`Loaded ${privateKeys.length} private key(s)`);
    } catch (error) {
        logger.critical(`Failed to load private keys: ${error.message}`);
        process.exit(1);
    }
}

function isValidPrivateKey(key) {
    key = key.trim();
    if (!key.startsWith('0x')) key = '0x' + key;
    try {
        const bytes = Buffer.from(key.replace('0x', ''), 'hex');
        return key.length === 66 && bytes.length === 32;
    } catch (error) {
        return false;
    }
}

function getNextPrivateKey() {
    return privateKeys[currentKeyIndex];
}

function rotatePrivateKey() {
    currentKeyIndex = (currentKeyIndex + 1) % privateKeys.length;
    return privateKeys[currentKeyIndex];
}

const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

let proxies = [];
let currentProxyIndex = 0;

function loadProxies() {
    try {
        if (fs.existsSync(PROXY_FILE)) {
            const data = fs.readFileSync(PROXY_FILE, 'utf8');
            proxies = data.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));

            if (proxies.length > 0) {
                logger.info(`Loaded ${proxies.length} proxies from ${PROXY_FILE}`);
            } else {
                logger.warn(`No proxies found in ${PROXY_FILE}`);
            }
        } else {
            logger.warn(`Proxy file ${PROXY_FILE} not found`);
        }
    } catch (error) {
        logger.error(`Failed to load proxies: ${error.message}`);
    }
}

function getNextProxy() {
    if (proxies.length === 0) return null;
    const proxy = proxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
    return proxy;
}

function extractProxyIP(proxy) {
    try {
        let cleanProxy = proxy.replace(/^https?:\/\//, '').replace(/.*@/, '');
        const ip = cleanProxy.split(':')[0];
        return ip || cleanProxy;
    } catch (error) {
        return proxy;
    }
}

function createAxiosInstance(accessToken = null) {
    const userAgent = getRandomUserAgent();
    const headers = {
        'User-Agent': userAgent,
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.8',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'sec-gpc': '1',
        'Referer': 'https://storagescan-galileo.0g.ai/', // Default for 0G Storage Scan
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    if (accessToken) {
        headers['accept'] = '*/*';
        headers['accept-language'] = 'en-US,en;q=0.6';
        headers['content-type'] = 'application/json';
        headers['priority'] = 'u=1, i';
        headers['sec-ch-ua'] = '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"';
        headers['sec-ch-ua-mobile'] = '?0';
        headers['sec-ch-ua-platform'] = '"Windows"';
        headers['sec-fetch-dest'] = 'empty';
        headers['sec-fetch-mode'] = 'cors';
        headers['sec-fetch-site'] = 'cross-site';
        headers['sec-gpc'] = '1';
        headers['Referer'] = 'https://test.jaine.app/'; // Override for Jaine bot
        headers['authorization'] = `Bearer ${accessToken}`;
        headers['apikey'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ3NzYwNDAwLCJleHAiOjE5MDU1MjY4MDB9.gfxfHjuyAN0wDdTQ_z_YTgIEoDCBVWuAhBC6gD3lf_8';
    }

    const config = { headers };

    const proxy = getNextProxy();
    if (proxy) {
        const proxyIP = extractProxyIP(proxy);
        logger.info(`Using proxy IP: ${proxyIP}`);
        config.httpsAgent = new HttpsProxyAgent(proxy);
    }

    return axios.create(config);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function initializeWallet() {
    const privateKey = getNextPrivateKey();
    return new Wallet(privateKey, provider);
}

async function checkNetworkSync() {
    try {
        logger.loading('Checking network sync...');
        const blockNumber = await provider.getBlockNumber();
        logger.success(`Network synced at block ${blockNumber}`);
        return true;
    } catch (error) {
        logger.error(`Network sync check failed: ${error.message}`);
        return false;
    }
}

async function fetchRandomImage() {
    try {
        logger.loading('Fetching random image...');
        const axiosInstance = createAxiosInstance(); // No access token needed for this
        const source = IMAGE_SOURCES[Math.floor(Math.random() * IMAGE_SOURCES.length)];
        const response = await axiosInstance.get(source.url, {
            responseType: source.responseType,
            maxRedirects: 5
        });
        logger.success('Image fetched successfully');
        return response.data;
    } catch (error) {
        logger.error(`Error fetching image: ${error.message}`);
        throw error;
    }
}

async function checkFileExists(fileHash) {
    try {
        logger.loading(`Checking file hash ${fileHash}...`);
        const axiosInstance = createAxiosInstance(); // No access token needed for this
        const response = await axiosInstance.get(`${INDEXER_URL}/file/info/${fileHash}`);
        return response.data.exists || false;
    } catch (error) {
        logger.warn(`Failed to check file hash: ${error.message}`);
        return false;
    }
}

async function prepareImageData(imageBuffer) {
    const MAX_HASH_ATTEMPTS = 5;
    let attempt = 1;

    while (attempt <= MAX_HASH_ATTEMPTS) {
        try {
            const salt = crypto.randomBytes(16).toString('hex');
            const timestamp = Date.now().toString();
            const hashInput = Buffer.concat([
                Buffer.from(imageBuffer),
                Buffer.from(salt),
                Buffer.from(timestamp)
            ]);
            const hash = '0x' + crypto.createHash('sha256').update(hashInput).digest('hex');
            const fileExists = await checkFileExists(hash);
            if (fileExists) {
                logger.warn(`Hash ${hash} already exists, retrying...`);
                attempt++;
                continue;
            }
            const imageBase64 = Buffer.from(imageBuffer).toString('base64');
            logger.success(`Generated unique file hash: ${hash}`);
            return {
                root: hash,
                data: imageBase64
            };
        } catch (error) {
            logger.error(`Error generating hash (attempt ${attempt}): ${error.message}`);
            attempt++;
            if (attempt > MAX_HASH_ATTEMPTS) {
                throw new Error(`Failed to generate unique hash after ${MAX_HASH_ATTEMPTS} attempts`);
            }
        }
    }
}

async function uploadToStorage(imageData, wallet, walletIndex) {
    const MAX_RETRIES = 3;
    const TIMEOUT_SECONDS = 300;
    let attempt = 1;

    logger.loading(`Checking wallet balance for ${wallet.address}...`);
    const balance = await provider.getBalance(wallet.address);
    const minBalance = parseEther('0.0015');
    if (BigInt(balance) < BigInt(minBalance)) {
        throw new Error(`Insufficient balance: ${formatEther(balance)} OG`);
    }
    logger.success(`Wallet balance: ${formatEther(balance)} OG`);

    while (attempt <= MAX_RETRIES) {
        try {
            logger.loading(`Uploading file for wallet #${walletIndex + 1} [${wallet.address}] (Attempt ${attempt}/${MAX_RETRIES})...`);
            const axiosInstance = createAxiosInstance(); // No access token needed for this
            await axiosInstance.post(`${INDEXER_URL}/file/segment`, {
                root: imageData.root,
                index: 0,
                data: imageData.data,
                proof: {
                    siblings: [imageData.root],
                    path: []
                }
            }, {
                headers: {
                    'content-type': 'application/json'
                }
            });
            logger.success('File segment uploaded');

            const contentHash = crypto.randomBytes(32);
            const data = ethers.concat([
                Buffer.from(METHOD_ID.slice(2), 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000020', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000014', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000060', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000080', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
                contentHash,
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
            ]);

            const value = parseEther('0.000839233398436224');
            const gasPrice = parseUnits('1.029599997', 'gwei');

            logger.loading('Estimating gas...');
            let gasLimit;
            try {
                const gasEstimate = await provider.estimateGas({
                    to: CONTRACT_ADDRESS,
                    data,
                    from: wallet.address,
                    value
                });
                gasLimit = BigInt(gasEstimate) * 15n / 10n;
                logger.success(`Gas limit set: ${gasLimit}`);
            } catch (error) {
                gasLimit = 300000n;
                logger.warn(`Gas estimation failed, using default: ${gasLimit}`);
            }

            const gasCost = BigInt(gasPrice) * gasLimit;
            const requiredBalance = gasCost + BigInt(value);
            if (BigInt(balance) < requiredBalance) {
                throw new Error(`Insufficient balance for transaction: ${formatEther(balance)} OG`);
            }

            logger.loading('Sending transaction...');
            const nonce = await provider.getTransactionCount(wallet.address, 'latest');
            const txParams = {
                to: CONTRACT_ADDRESS,
                data,
                value,
                nonce,
                chainId: CHAIN_ID,
                gasPrice,
                gasLimit
            };

            const tx = await wallet.sendTransaction(txParams);
            const txLink = `${EXPLORER_URL}${tx.hash}`;
            logger.info(`Transaction sent: ${tx.hash}`);
            logger.info(`Explorer: ${txLink}`);

            logger.loading(`Waiting for confirmation (${TIMEOUT_SECONDS}s)...`);
            let receipt;
            try {
                receipt = await Promise.race([
                    tx.wait(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${TIMEOUT_SECONDS} seconds`)), TIMEOUT_SECONDS * 1000))
                ]);
            } catch (error) {
                if (error.message.includes('Timeout')) {
                    logger.warn(`Transaction timeout after ${TIMEOUT_SECONDS}s`);
                    receipt = await provider.getTransactionReceipt(tx.hash);
                    if (receipt && receipt.status === 1) {
                        logger.success(`Late confirmation in block ${receipt.blockNumber}`);
                    } else {
                        throw new Error(`Transaction failed or pending: ${txLink}`);
                    }
                } else {
                    throw error;
                }
            }

            if (receipt.status === 1) {
                logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
                logger.success(`File uploaded, root hash: ${imageData.root}`);
                return receipt;
            } else {
                throw new Error(`Transaction failed: ${txLink}`);
            }
        } catch (error) {
            logger.error(`Upload attempt ${attempt} failed: ${error.message}`);
            if (attempt < MAX_RETRIES) {
                const delay = 10 + Math.random() * 20;
                logger.warn(`Retrying after ${delay.toFixed(2)}s...`);
                await new Promise(resolve => setTimeout(resolve, delay * 1000));
                attempt++;
                continue;
            }
            throw error;
        }
    }
}

// Jaine Bot specific functions
function encodeAddress(addr) {
    return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

function encodeUint(n) {
    return BigInt(n).toString(16).padStart(64, '0');
}

function encodeInt(n) {
    const bn = BigInt(n);
    const bitmask = (1n << 256n) - 1n;
    const twosComplement = bn & bitmask;
    return twosComplement.toString(16).padStart(64, '0');
}

async function login(wallet) {
    logger.step(`Starting login process for wallet ${wallet.address}...`);
    try {
        const axiosInstance = createAxiosInstance(); // No access token yet

        logger.loading('Getting nonce...');
        const nonceResponse = await axiosInstance.post('https://siwe.zer0.exchange/nonce', {
            provider: "siwe",
            chain_id: CHAIN_ID,
            wallet: wallet.address,
            ref: "",
            connector: { name: "OKX Wallet", type: "injected", id: "com.okex.wallet" }
        });
        const { nonce } = nonceResponse.data;
        if (!nonce) throw new Error('Failed to get nonce.');
        logger.success('Nonce successfully obtained.');

        const issuedAt = new Date().toISOString();
        const message = `test.jaine.app wants you to sign in with your Ethereum account:\n${wallet.address}\n\n\nURI: https://test.jaine.app\nVersion: 1\nChain ID: ${CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
        logger.loading('Signing message...');
        const signature = await wallet.signMessage(message);
        logger.success('Message signed successfully.');

        logger.loading('Sending signature for verification...');
        const signInResponse = await axiosInstance.post('https://siwe.zer0.exchange/sign-in', {
            provider: "siwe",
            chain_id: CHAIN_ID,
            wallet: wallet.address,
            message: message,
            signature: signature
        });
        const { email, token } = signInResponse.data;
        if (!token) throw new Error('Failed to get sign-in token.');
        logger.success('Sign-in token obtained successfully.');

        logger.loading('Verifying authentication token...');
        // Re-create axios instance with the token for verification step
        const verifyAxiosInstance = createAxiosInstance(token); // Use token here
        const verifyResponse = await verifyAxiosInstance.post('https://app.zer0.exchange/auth/v1/verify', {
            type: "email",
            email: email,
            token: token,
            gotrue_meta_security: {}
        });

        const { access_token } = verifyResponse.data;
        if (!access_token) throw new Error('Failed to get access token.');

        logger.success(`Login successful for wallet ${wallet.address}.`);
        return access_token;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        logger.error(`Login failed for ${wallet.address}: ${errorMessage}`);
        return null;
    }
}

async function requestFaucet(wallet, tokenName) {
    if (!['ETH', 'USDT', 'BTC'].includes(tokenName)) {
        logger.error(`Faucet not available for ${tokenName}. Only ETH, USDT, and BTC are supported.`);
        return;
    }

    const tokenAddress = contracts[tokenName];
    logger.step(`Requesting faucet for ${tokenName} token...`);
    try {
        const tx = await wallet.sendTransaction({
            to: tokenAddress,
            data: '0x1249c58b',
            gasLimit: 60000
        });

        logger.loading(`Waiting for ${tokenName} faucet confirmation: ${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            logger.success(`Faucet for ${tokenName} claimed successfully. Hash: ${tx.hash}`);
        } else {
            logger.error(`Faucet for ${tokenName} failed. Transaction reverted. Hash: ${tx.hash}`);
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.reason) {
            errorMessage = error.reason;
        } else if (error.data && error.data.message) {
            errorMessage = error.data.message;
        } else if (error.error && error.error.message) {
            errorMessage = error.error.message;
        }

        logger.error(`Failed to request ${tokenName} faucet: ${errorMessage}`);

        if (error.transactionHash) {
            logger.error(`Failed transaction hash: ${error.transactionHash}`);
        } else if (error.receipt) {
            logger.error(`Failed transaction hash: ${error.receipt.hash}`);
        }
    }
}

async function approveToken(wallet, tokenAddress, amount, decimals) {
    const tokenContract = new Contract(tokenAddress, ERC20_ABI, wallet);
    const spenderAddress = contracts.positionsNFT;
    const amountToApprove = parseUnits(amount, decimals);

    try {
        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        if (currentAllowance < amountToApprove) {
            logger.step(`Allowance not sufficient for PositionsNFT. Approving for ${formatUnits(amountToApprove, decimals)}...`);
            const approveTx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
            logger.loading(`Waiting for approval confirmation: ${approveTx.hash}`);
            await approveTx.wait();
            logger.success(`Token approved successfully.`);
        }
    } catch (error) {
        logger.error(`Failed to approve: ${error.message}`);
        throw error;
    }
}

async function addLiquidity(wallet) {
    const btcAmount = "0.000001";
    const usdtAmount = "0.086483702551157391";

    const token0Address = contracts.BTC;
    const token1Address = contracts.USDT;
    const token0Decimals = tokenDecimals.BTC;
    const token1Decimals = tokenDecimals.USDT;

    logger.step(`Adding liquidity: ${btcAmount} BTC + ${usdtAmount} USDT`);

    try {
        await approveToken(wallet, token0Address, btcAmount, token0Decimals);
        await approveToken(wallet, token1Address, usdtAmount, token1Decimals);

        const methodId = '0x88316456';
        const fee = 100;
        const tickLower = -887272;
        const tickUpper = 887272;
        const amount0Desired = parseUnits(btcAmount, token0Decimals);
        const amount1Desired = parseUnits(usdtAmount, token1Decimals);
        const amount0Min = (amount0Desired * 95n) / 100n;
        const amount1Min = (amount1Desired * 95n) / 100n;
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

        const calldata =
            methodId +
            encodeAddress(token0Address) +
            encodeAddress(token1Address) +
            encodeUint(fee) +
            encodeInt(tickLower) +
            encodeInt(tickUpper) +
            encodeUint(amount0Desired) +
            encodeUint(amount1Desired) +
            encodeUint(amount0Min) +
            encodeUint(amount1Min) +
            encodeAddress(wallet.address) +
            encodeUint(deadline);

        const tx = {
            to: contracts.positionsNFT,
            data: calldata,
            gasLimit: 600000,
        };

        logger.loading(`Sending add liquidity transaction...`);
        const addLiqTx = await wallet.sendTransaction(tx);
        logger.loading(`Waiting for add liquidity confirmation: ${addLiqTx.hash}`);
        const receipt = await addLiqTx.wait();

        if (receipt.status === 1) {
            logger.success(`Add liquidity successful! Hash: ${addLiqTx.hash}`);
            const erc721Interface = new Interface(ERC20_ABI);
            const transferLog = receipt.logs.find(log => {
                try {
                    const parsedLog = erc721Interface.parseLog(log);
                    return parsedLog && parsedLog.name === 'Transfer' && parsedLog.args.to.toLowerCase() === wallet.address.toLowerCase();
                } catch (e) {
                    return false;
                }
            });

            if (transferLog) {
                const parsedLog = erc721Interface.parseLog(transferLog);
                const tokenId = parsedLog.args.tokenId.toString();
                logger.info(`Minted new position with tokenId: ${tokenId}`);
            }
        } else {
            logger.error(`Add liquidity failed! Hash: ${addLiqTx.hash}`);
        }
    } catch (error) {
        logger.error(`Add liquidity failed: ${error.message}`);
    }
}

async function executeSwap(wallet, tokenInName, tokenOutName, amount) {
    const tokenInAddress = contracts[tokenInName];
    const tokenOutAddress = contracts[tokenOutName];
    const tokenInDecimals = tokenDecimals[tokenInName];

    logger.step(`Starting swap of ${amount} ${tokenInName} -> ${tokenOutName}...`);

    try {
        const tokenContract = new Contract(tokenInAddress, ERC20_ABI, wallet);
        const spenderAddress = contracts.router;
        const amountToApprove = parseUnits(amount, tokenInDecimals);

        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        if (currentAllowance < amountToApprove) {
            logger.step(`Allowance not sufficient for Router. Approving for ${formatUnits(amountToApprove, tokenInDecimals)}...`);
            const approveTx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
            logger.loading(`Waiting for approval confirmation: ${approveTx.hash}`);
            await approveTx.wait();
            logger.success(`Token approved successfully.`);
        }

        const methodId = '0x414bf389';
        const fee = (tokenInName === 'USDT' || tokenOutName === 'USDT') ? 500 : 100;
        const amountIn = parseUnits(amount, tokenInDecimals);
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const amountOutMinimum = 0;

        const calldata =
            methodId +
            encodeAddress(tokenInAddress) +
            encodeAddress(tokenOutAddress) +
            encodeUint(fee) +
            encodeAddress(wallet.address) +
            encodeUint(deadline) +
            encodeUint(amountIn) +
            encodeUint(amountOutMinimum) +
            '0'.repeat(64);

        const tx = {
            to: contracts.router,
            data: calldata,
            gasLimit: 300000,
        };

        logger.loading(`Sending swap transaction...`);
        const swapTx = await wallet.sendTransaction(tx);
        logger.loading(`Waiting for swap confirmation: ${swapTx.hash}`);
        const receipt = await swapTx.wait();

        if (receipt.status === 1) {
            logger.success(`Swap successful! Hash: ${swapTx.hash}`);
        } else {
            logger.error(`Swap failed! Hash: ${swapTx.hash}`);
        }
    } catch (error) {
        logger.error(`Swap failed completely: ${error.message}`);
    }
}

function getRandomAmount(min, max, precision = 8) {
    return (Math.random() * (max - min) + min).toFixed(precision);
}

async function startCountdown(durationInSeconds) {
    logger.info(`All daily cycles complete. Starting 24-hour countdown...`);
    let remaining = durationInSeconds;
    while (remaining > 0) {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        logger.countdown(`Time until next cycle: ${hours}h, ${minutes}m, ${seconds}s `);
        await new Promise(resolve => setTimeout(resolve, 1000));
        remaining--;
    }
    console.log('\n'); // Newline after countdown finishes
}

async function getOperationChoices(rl) {
    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    const includeAddLiquidity = await question(`${controllerColors.white}[?] Include Add Liquidity in daily cycle? (y/n): ${controllerColors.reset}`);

    return {
        addLiquidity: ['y', 'yes'].includes(includeAddLiquidity.toLowerCase())
    };
}

async function main() {
    try {
        logger.banner();
        loadPrivateKeys();
        loadProxies();

        logger.loading('Checking network status...');
        const network = await provider.getNetwork();
        if (BigInt(network.chainId) !== BigInt(CHAIN_ID)) {
            throw new Error(`Invalid chainId: expected ${CHAIN_ID}, got ${network.chainId}`);
        }
        logger.success(`Connected to network: chainId ${network.chainId}`);

        const isNetworkSynced = await checkNetworkSync();
        if (!isNetworkSynced) {
            throw new Error('Network is not synced');
        }

        console.log(controllerColors.cyan + "Available wallets:" + controllerColors.reset);
        const wallets = privateKeys.map(key => new Wallet(key, provider));
        wallets.forEach((wallet, index) => {
            console.log(`${controllerColors.green}[${index + 1}]${controllerColors.reset} ${wallet.address}`);
        });
        console.log();

        logger.step("Starting login process for all wallets...");
        const loginPromises = wallets.map(wallet => login(wallet));
        const accessTokens = await Promise.all(loginPromises);

        if (accessTokens.some(token => token === null)) {
            logger.critical("Some wallets failed to log in. Check the log above for details. The script will stop.");
            rl.close();
            process.exit(1);
        }
        logger.success("All wallets logged in successfully.");

        logger.step("Starting faucet claim process for all wallets...");
        for (const wallet of wallets) {
            await requestFaucet(wallet, 'BTC');
            await requestFaucet(wallet, 'USDT');
            await requestFaucet(wallet, 'ETH');
            await new Promise(resolve => setTimeout(resolve, 2000)); // Small delay between faucet requests
        }
        logger.success("Faucet claim process finished.");

        const dailySetsInput = await new Promise(resolve => rl.question(`\n${controllerColors.white}[?] Enter the number of daily transaction sets: ${controllerColors.reset}`, resolve));
        const dailySets = parseInt(dailySetsInput);

        if (isNaN(dailySets) || dailySets <= 0) {
            logger.error("Invalid input. Please enter a number greater than 0.");
            rl.close();
            process.exit(1);
        }

        const operationConfig = await getOperationChoices(rl);
        rl.close(); // Close readline after all questions are answered

        logger.info(`Bot will run ${dailySets} transaction set(s) every day.`);
        if (operationConfig.addLiquidity) logger.info(`✓ Add Liquidity enabled`);

        while (true) {
            for (let i = 1; i <= dailySets; i++) {
                logger.section(`--- Starting Daily Transaction Set ${i} of ${dailySets} ---`);
                for (let walletIndex = 0; walletIndex < wallets.length; walletIndex++) {
                    const wallet = wallets[walletIndex];
                    logger.wallet(`Processing Wallet: ${wallet.address}`);

                    // Jaine Bot operations
                    if (operationConfig.addLiquidity) {
                        await addLiquidity(wallet);
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }

                    const btcAmount = getRandomAmount(0.00000015, 0.00000020, 8);
                    await executeSwap(wallet, 'BTC', 'USDT', btcAmount);
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    const usdtToBtcAmount = getRandomAmount(1.5, 2.5, 2);
                    await executeSwap(wallet, 'USDT', 'BTC', usdtToBtcAmount);
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    const usdtToGimoAmount = getRandomAmount(100, 105, 2);
                    await executeSwap(wallet, 'USDT', 'GIMO', usdtToGimoAmount);
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    const gimoAmount = getRandomAmount(0.0001, 0.00015, 5);
                    await executeSwap(wallet, 'GIMO', 'USDT', gimoAmount);
                    await new Promise(resolve => setTimeout(resolve, 5000));

                    // 0G Storage Scan operations
                    try {
                        const imageBuffer = await fetchRandomImage();
                        const imageData = await prepareImageData(imageBuffer);
                        await uploadToStorage(imageData, wallet, walletIndex);
                        logger.success(`0G Storage Upload completed for wallet ${wallet.address}`);
                    } catch (error) {
                        logger.error(`0G Storage Upload failed for wallet ${wallet.address}: ${error.message}`);
                    }

                    await new Promise(resolve => setTimeout(resolve, 10000)); // Delay after all operations for a wallet
                }
            }

            logger.info('All daily transaction sets completed. Entering cooldown.');
            await startCountdown(86400); // 24 hours
        }

    } catch (error) {
        logger.critical(`Main process error: ${error.message}`);
        if (!rl.closed) rl.close();
        process.exit(1);
    }
}

main().catch(err => {
    logger.critical("An unexpected error occurred outside the main loop:", err);
    if (!rl.closed) rl.close();
    process.exit(1);
});
