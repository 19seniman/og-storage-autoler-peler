require('dotenv').config();
const { ethers, Wallet, JsonRpcProvider, parseUnits, formatUnits, MaxUint256, Interface, Contract } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

const controllerColors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
};

const controllerLogger = {
    info: (msg) => console.log(`${controllerColors.cyan}[i] ${msg}${controllerColors.reset}`),
    warn: (msg) => console.log(`${controllerColors.yellow}[!] ${msg}${controllerColors.reset}`),
    error: (msg) => console.log(`${controllerColors.red}[x] ${msg}${controllerColors.reset}`),
    success: (msg) => console.log(`${controllerColors.green}[+] ${msg}${controllerColors.reset}`),
    loading: (msg) => console.log(`${controllerColors.magenta}[*] ${msg}${controllerColors.reset}`),
    step: (msg) => console.log(`${controllerColors.blue}[>] ${controllerColors.bright}${msg}${controllerColors.reset}`),
    critical: (msg) => console.log(`${controllerColors.red}${controllerColors.bright}[FATAL] ${msg}${controllerColors.reset}`),
    summary: (msg) => console.log(`${controllerColors.green}${controllerColors.bright}[SUMMARY] ${msg}${controllerColors.reset}`),
    banner: (titleText = "🍉 Multi-Bot Controller 🍉") => {
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
};


// =================================================================================================
// === 0G STORAGE UPLOADER BOT - SECTION START
// =================================================================================================
const ZERO_G_CHAIN_ID = 16601;
const ZERO_G_RPC_URL = 'https://evmrpc-testnet.0g.ai';
const ZERO_G_CONTRACT_ADDRESS = '0x5f1d96895e442fc0168fa2f9fb1ebef93cb5035e';
const ZERO_G_METHOD_ID = '0xef3e12dc';
const PROXY_FILE = 'proxies.txt';
const INDEXER_URL = 'https://indexer-storage-testnet-turbo.0g.ai';
const EXPLORER_URL = 'https://chainscan-galileo.0g.ai/tx/';

const IMAGE_SOURCES = [
    { url: 'https://picsum.photos/800/600', responseType: 'arraybuffer' },
    { url: 'https://loremflickr.com/800/600', responseType: 'arraybuffer' }
];

let privateKeys_0g = [];
let currentKeyIndex_0g = 0;

const zeroGProvider = new JsonRpcProvider(ZERO_G_RPC_URL);

function loadPrivateKeysFor0g() {
    try {
        privateKeys_0g = []; // Reset array to ensure fresh load
        let index = 1;
        let key;
        do {
            key = process.env[`PRIVATE_KEY_${index}`];
            if (key && isValidPrivateKey(key)) {
                privateKeys_0g.push(key);
            } else if (key) {
                controllerLogger.error(`Invalid private key format at PRIVATE_KEY_${index}`);
            }
            index++;
        } while (key);

        if (privateKeys_0g.length === 0) {
            controllerLogger.critical('No valid private keys found in .env file for 0G Bot.');
            return false;
        }

        controllerLogger.success(`Loaded ${privateKeys_0g.length} private key(s) for 0G Bot.`);
        return true;
    } catch (error) {
        controllerLogger.critical(`Failed to load private keys: ${error.message}`);
        return false;
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

function getNextPrivateKeyFor0g() {
    return privateKeys_0g[currentKeyIndex_0g];
}

function getRandomUserAgentFor0g() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

let proxies = [];
let currentProxyIndex = 0;

function loadProxies() {
    try {
        if (fs.existsSync(PROXY_FILE)) {
            const data = fs.readFileSync(PROXY_FILE, 'utf8');
            proxies = data.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
            if (proxies.length > 0) controllerLogger.info(`Loaded ${proxies.length} proxies.`);
            else controllerLogger.warn(`No proxies found in ${PROXY_FILE}`);
        } else {
            controllerLogger.warn(`Proxy file ${PROXY_FILE} not found`);
        }
    } catch (error) {
        controllerLogger.error(`Failed to load proxies: ${error.message}`);
    }
}

function getNextProxy() {
    if (proxies.length === 0) return null;
    const proxy = proxies[currentProxyIndex];
    currentProxyIndex = (currentProxyIndex + 1) % proxies.length;
    return proxy;
}

function createZeroGAxiosInstance() {
    const config = {
        headers: {
            'User-Agent': getRandomUserAgentFor0g(),
            'accept': 'application/json, text/plain, */*',
            'Referer': 'https://storagescan-galileo.0g.ai/',
        }
    };
    const proxy = getNextProxy();
    if (proxy) {
        config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    return axios.create(config);
}

function initializeZeroGWallet() {
    const privateKey = getNextPrivateKeyFor0g();
    return new ethers.Wallet(privateKey, zeroGProvider);
}

async function checkZeroGNetworkSync() {
    try {
        controllerLogger.loading('Checking 0G network sync...');
        const blockNumber = await zeroGProvider.getBlockNumber();
        controllerLogger.success(`0G Network synced at block ${blockNumber}`);
        return true;
    } catch (error) {
        controllerLogger.error(`0G Network sync check failed: ${error.message}`);
        return false;
    }
}

async function fetchRandomImage() {
    try {
        controllerLogger.loading('Fetching random image...');
        const axiosInstance = createZeroGAxiosInstance();
        const source = IMAGE_SOURCES[Math.floor(Math.random() * IMAGE_SOURCES.length)];
        const response = await axiosInstance.get(source.url, { responseType: source.responseType, maxRedirects: 5 });
        controllerLogger.success('Image fetched successfully');
        return response.data;
    } catch (error) {
        controllerLogger.error(`Error fetching image: ${error.message}`);
        throw error;
    }
}

async function checkFileExists(fileHash) {
    try {
        controllerLogger.loading(`Checking file hash ${fileHash}...`);
        const axiosInstance = createZeroGAxiosInstance();
        const response = await axiosInstance.get(`${INDEXER_URL}/file/info/${fileHash}`);
        return response.data.exists || false;
    } catch (error) {
        controllerLogger.warn(`Failed to check file hash: ${error.message}`);
        return false;
    }
}

async function prepareImageData(imageBuffer) {
    const MAX_HASH_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_HASH_ATTEMPTS; attempt++) {
        const hashInput = Buffer.concat([Buffer.from(imageBuffer), crypto.randomBytes(16)]);
        const hash = '0x' + crypto.createHash('sha256').update(hashInput).digest('hex');
        if (!(await checkFileExists(hash))) {
            controllerLogger.success(`Generated unique file hash: ${hash}`);
            return { root: hash, data: Buffer.from(imageBuffer).toString('base64') };
        }
        controllerLogger.warn(`Hash ${hash} already exists, retrying...`);
    }
    throw new Error(`Failed to generate unique hash after ${MAX_HASH_ATTEMPTS} attempts`);
}

async function uploadToStorage(imageData, wallet, walletIndex) {
    const MAX_RETRIES = 3;
    const TIMEOUT_SECONDS = 300;
    
    controllerLogger.loading(`Checking wallet balance for ${wallet.address}...`);
    const balance = await zeroGProvider.getBalance(wallet.address);
    if (balance < parseUnits('0.0015', 'ether')) {
        throw new Error(`Insufficient balance: ${formatUnits(balance, 'ether')} OG`);
    }
    controllerLogger.success(`Wallet balance: ${formatUnits(balance, 'ether')} OG`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            controllerLogger.loading(`Uploading file for wallet #${walletIndex + 1} (Attempt ${attempt})...`);
            const axiosInstance = createZeroGAxiosInstance();
            await axiosInstance.post(`${INDEXER_URL}/file/segment`, {
                root: imageData.root, index: 0, data: imageData.data, proof: { siblings: [imageData.root], path: [] }
            }, { headers: { 'content-type': 'application/json' } });
            controllerLogger.success('File segment uploaded');

            const data = ethers.concat([
                Buffer.from(ZERO_G_METHOD_ID.slice(2), 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000020', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000014', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000060', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000080', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
                crypto.randomBytes(32),
                Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex')
            ]);

            const value = parseUnits('0.000839233398436224', 'ether');
            const gasPrice = parseUnits('1.03', 'gwei');

            controllerLogger.loading('Estimating gas...');
            const gasEstimate = await zeroGProvider.estimateGas({ to: ZERO_G_CONTRACT_ADDRESS, data, from: wallet.address, value });
            const gasLimit = gasEstimate * 15n / 10n;
            controllerLogger.success(`Gas limit set: ${gasLimit}`);

            controllerLogger.loading('Sending transaction...');
            const nonce = await zeroGProvider.getTransactionCount(wallet.address, 'latest');
            const tx = await wallet.sendTransaction({ to: ZERO_G_CONTRACT_ADDRESS, data, value, nonce, chainId: ZERO_G_CHAIN_ID, gasPrice, gasLimit });
            controllerLogger.info(`Transaction sent: ${EXPLORER_URL}${tx.hash}`);

            controllerLogger.loading(`Waiting for confirmation (${TIMEOUT_SECONDS}s)...`);
            const receipt = await tx.wait(1, TIMEOUT_SECONDS * 1000);

            if (receipt && receipt.status === 1) {
                controllerLogger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
                return receipt;
            } else {
                throw new Error(`Transaction failed: ${EXPLORER_URL}${tx.hash}`);
            }
        } catch (error) {
            controllerLogger.error(`Upload attempt ${attempt} failed: ${error.message}`);
            if (attempt < MAX_RETRIES) {
                await countdownDelay(15, `Retrying in`);
            } else {
                throw error;
            }
        }
    }
}

async function runUploads(countPerWallet) {
    controllerLogger.banner("0G Storage Uploader");
    if (!loadPrivateKeysFor0g()) return;
    loadProxies();

    controllerLogger.loading('Checking 0G network status...');
    const network = await zeroGProvider.getNetwork();
    if (network.chainId !== BigInt(ZERO_G_CHAIN_ID)) {
        throw new Error(`Invalid chainId: expected ${ZERO_G_CHAIN_ID}, got ${network.chainId}`);
    }
    controllerLogger.success(`Connected to 0G network: chainId ${network.chainId}`);
    if (!(await checkZeroGNetworkSync())) throw new Error('0G Network is not synced');

    controllerLogger.step("Available Wallets:");
    privateKeys_0g.forEach((key, index) => {
        const wallet = new ethers.Wallet(key);
        controllerLogger.info(`[${index + 1}] ${wallet.address}`);
    });

    const totalUploads = countPerWallet * privateKeys_0g.length;
    controllerLogger.info(`Starting ${totalUploads} uploads (${countPerWallet} per wallet)`);

    let successful = 0, failed = 0;
    for (let walletIndex = 0; walletIndex < privateKeys_0g.length; walletIndex++) {
        currentKeyIndex_0g = walletIndex;
        const wallet = initializeZeroGWallet();
        controllerLogger.section(`Processing Wallet #${walletIndex + 1} [${wallet.address}]`);

        for (let i = 1; i <= countPerWallet; i++) {
            const uploadNumber = (walletIndex * countPerWallet) + i;
            controllerLogger.step(`Upload ${uploadNumber}/${totalUploads}`);
            try {
                const imageBuffer = await fetchRandomImage();
                const imageData = await prepareImageData(imageBuffer);
                await uploadToStorage(imageData, wallet, walletIndex);
                successful++;
                controllerLogger.success(`Upload ${uploadNumber} completed`);
                if (uploadNumber < totalUploads) await countdownDelay(5, `Waiting for next upload in`);
            } catch (error) {
                failed++;
                controllerLogger.error(`Upload ${uploadNumber} failed: ${error.message}`);
                await countdownDelay(5, `Continuing after error in`);
            }
        }
        if (walletIndex < privateKeys_0g.length - 1) await countdownDelay(10, `Switching to next wallet in`);
    }

    controllerLogger.section('Upload Summary');
    controllerLogger.summary(`Total wallets: ${privateKeys_0g.length}`);
    controllerLogger.summary(`Total attempted: ${totalUploads}`);
    if (successful > 0) controllerLogger.success(`Successful: ${successful}`);
    if (failed > 0) controllerLogger.error(`Failed: ${failed}`);
}

// =================================================================================================
// === 0G STORAGE UPLOADER BOT - SECTION END
// =================================================================================================


// =================================================================================================
// === JAINE DEFI Testnet
// =================================================================================================
const jaineColors = {
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    white: '\x1b[37m',
    cyan: '\x1b[36m',
    reset: '\x1b[0m',
    bold: '\x1b[1m'
};

const jaineLogger = {
    info: (msg) => console.log(`${jaineColors.green}[✓] ${msg}${jaineColors.reset}`),
    wallet: (msg) => console.log(`${jaineColors.yellow}[➤] ${msg}${jaineColors.reset}`),
    error: (msg) => console.log(`${jaineColors.red}[✗] ${msg}${jaineColors.reset}`),
    success: (msg) => console.log(`${jaineColors.green}[✓] ${msg}${jaineColors.reset}`),
    loading: (msg) => console.log(`${jaineColors.cyan}[⟳] ${msg}${jaineColors.reset}`),
    step: (msg) => console.log(`${jaineColors.white}[➤] ${msg}${jaineColors.reset}`),
    banner: () => {
        console.log(`${jaineColors.cyan}${jaineColors.bold}`);
        console.log('---------------------------------------------');
        console.log('     Jaine 0G Auto Bot - Airdrop Insiders    ');
        console.log(`---------------------------------------------${jaineColors.reset}\n`);
    },
    agent: (msg) => console.log(`${jaineColors.white}${msg}${jaineColors.reset}`)
};

const jaineUserAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/118.0",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
];

const getJaineRandomUserAgent = () => jaineUserAgents[Math.floor(Math.random() * jaineUserAgents.length)];

const JAINE_RPC_URL = 'https://evmrpc-testnet.0g.ai/';
const JAINE_CHAIN_ID = 16601;
const jaineProvider = new JsonRpcProvider(JAINE_RPC_URL);

const jaineContracts = {
    router: '0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c',
    positionsNFT: '0x44f24b66b3baa3a784dbeee9bfe602f15a2cc5d9',
    USDT: '0x3ec8a8705be1d5ca90066b37ba62c4183b024ebf',
    BTC: '0x36f6414ff1df609214ddaba71c84f18bcf00f67d',
    ETH: '0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c',
    GIMO: '0xba2ae6c8cddd628a087d7e43c1ba9844c5bf9638'
};

const jaineTokenDecimals = {
    USDT: 18,
    BTC: 18,
    ETH: 18,
    GIMO: 18
};

const JAINE_ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

function jaineEncodeAddress(addr) {
    return addr.toLowerCase().replace('0x', '').padStart(64, '0');
}

function jaineEncodeUint(n) {
    return BigInt(n).toString(16).padStart(64, '0');
}

function jaineEncodeInt(n) {
    const bn = BigInt(n);
    const bitmask = (1n << 256n) - 1n;
    const twosComplement = bn & bitmask;
    return twosComplement.toString(16).padStart(64, '0');
}

const createJaineAxiosInstance = (accessToken = null) => {
    const userAgent = getJaineRandomUserAgent();
    const headers = {
        'User-Agent': userAgent,
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.6',
        'content-type': 'application/json',
        'priority': 'u=1, i',
        'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Brave";v="138"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'sec-gpc': '1',
        'Referer': 'https://test.jaine.app/'
    };
    if (accessToken) {
        headers['authorization'] = `Bearer ${accessToken}`;
        headers['apikey'] = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ3NzYwNDAwLCJleHAiOjE5MDU1MjY4MDB9.gfxfHjuyAN0wDdTQ_z_YTgIEoDCBVWuAhBC6gD3lf_8';
    }
    return axios.create({ headers });
};

async function jaineLogin(wallet) {
    jaineLogger.step(`Starting login process for wallet ${wallet.address}...`);
    try {
        const axiosInstance = createJaineAxiosInstance();

        jaineLogger.loading('Getting nonce...');
        const nonceResponse = await axiosInstance.post('https://siwe.zer0.exchange/nonce', {
            provider: "siwe",
            chain_id: JAINE_CHAIN_ID,
            wallet: wallet.address,
            ref: "",
            connector: { name: "OKX Wallet", type: "injected", id: "com.okex.wallet" }
        });
        const { nonce } = nonceResponse.data;
        if (!nonce) throw new Error('Failed to get nonce.');
        jaineLogger.success('Nonce successfully obtained.');

        const issuedAt = new Date().toISOString();
        const message = `test.jaine.app wants you to sign in with your Ethereum account:\n${wallet.address}\n\n\nURI: https://test.jaine.app\nVersion: 1\nChain ID: ${JAINE_CHAIN_ID}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
        jaineLogger.loading('Signing message...');
        const signature = await wallet.signMessage(message);
        jaineLogger.success('Message signed successfully.');

        jaineLogger.loading('Sending signature for verification...');
        const signInResponse = await axiosInstance.post('https://siwe.zer0.exchange/sign-in', {
            provider: "siwe",
            chain_id: JAINE_CHAIN_ID,
            wallet: wallet.address,
            message: message,
            signature: signature
        });
        const { email, token } = signInResponse.data;
        if (!token) throw new Error('Failed to get sign-in token.');
        jaineLogger.success('Sign-in token obtained successfully.');

        jaineLogger.loading('Verifying authentication token...');
        const verifyHeaders = {
            ...axiosInstance.defaults.headers.common,
            "content-type": "application/json;charset=UTF-8",
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ3NzYwNDAwLCJleHAiOjE5MDU1MjY4MDB9.gfxfHjuyAN0wDdTQ_z_YTgIEoDCBVWuAhBC6gD3lf_8',
            'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ3NzYwNDAwLCJleHAiOjE5MDU1MjY4MDB9.gfxfHjuyAN0wDdTQ_z_YTgIEoDCBVWuAhBC6gD3lf_8',
            'x-client-info': 'supabase-js-web/2.49.4',
            'x-supabase-api-version': '2024-01-01'
        };

        const verifyResponse = await axios.post('https://app.zer0.exchange/auth/v1/verify', {
            type: "email",
            email: email,
            token: token,
            gotrue_meta_security: {}
        }, {
            headers: verifyHeaders
        });

        const { access_token } = verifyResponse.data;
        if (!access_token) throw new Error('Failed to get access token.');

        jaineLogger.success(`Login successful for wallet ${wallet.address}.`);
        return access_token;
    } catch (error) {
        const errorMessage = error.response ? JSON.stringify(error.response.data) : error.message;
        jaineLogger.error(`Login failed for ${wallet.address}: ${errorMessage}`);
        return null;
    }
}

async function jaineRequestFaucet(wallet, tokenName) {
    if (!['ETH', 'USDT', 'BTC'].includes(tokenName)) {
        jaineLogger.error(`Faucet not available for ${tokenName}. Only ETH, USDT, and BTC are supported.`);
        return;
    }

    const tokenAddress = jaineContracts[tokenName];
    jaineLogger.step(`Requesting faucet for ${tokenName} token...`);
    try {
        const tx = await wallet.sendTransaction({
            to: tokenAddress,
            data: '0x1249c58b', 
            gasLimit: 60000 
        });

        jaineLogger.loading(`Waiting for ${tokenName} faucet confirmation: ${tx.hash}`);
        const receipt = await tx.wait();
        if (receipt.status === 1) {
            jaineLogger.success(`Faucet for ${tokenName} claimed successfully. Hash: ${tx.hash}`);
        } else {
            jaineLogger.error(`Faucet for ${tokenName} failed. Transaction reverted. Hash: ${tx.hash}`);
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
        
        jaineLogger.error(`Failed to request ${tokenName} faucet: ${errorMessage}`);
        
        if (error.transactionHash) {
             jaineLogger.error(`Failed transaction hash: ${error.transactionHash}`);
        } else if (error.receipt) {
             jaineLogger.error(`Failed transaction hash: ${error.receipt.hash}`);
        }
    }
}

async function jaineApproveToken(wallet, tokenAddress, amount, decimals) {
    const tokenContract = new ethers.Contract(tokenAddress, JAINE_ERC20_ABI, wallet);
    const spenderAddress = jaineContracts.positionsNFT;
    const amountToApprove = parseUnits(amount, decimals);

    try {
        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        if (currentAllowance < amountToApprove) {
            jaineLogger.step(`Allowance not sufficient for PositionsNFT. Approving for ${formatUnits(amountToApprove, decimals)}...`);
            const approveTx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
            jaineLogger.loading(`Waiting for approval confirmation: ${approveTx.hash}`);
            await approveTx.wait();
            jaineLogger.success(`Token approved successfully.`);
        }
    } catch (error) {
        jaineLogger.error(`Failed to approve: ${error.message}`);
        throw error;
    }
}

async function jaineAddLiquidity(wallet) {
    const btcAmount = "0.000001";
    const usdtAmount = "0.086483702551157391";

    const token0Address = jaineContracts.BTC;
    const token1Address = jaineContracts.USDT;
    const token0Decimals = jaineTokenDecimals.BTC;
    const token1Decimals = jaineTokenDecimals.USDT;

    jaineLogger.step(`Adding liquidity: ${btcAmount} BTC + ${usdtAmount} USDT`);

    try {
        await jaineApproveToken(wallet, token0Address, btcAmount, token0Decimals);
        await jaineApproveToken(wallet, token1Address, usdtAmount, token1Decimals);

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
            jaineEncodeAddress(token0Address) +
            jaineEncodeAddress(token1Address) +
            jaineEncodeUint(fee) +
            jaineEncodeInt(tickLower) +
            jaineEncodeInt(tickUpper) +
            jaineEncodeUint(amount0Desired) +
            jaineEncodeUint(amount1Desired) +
            jaineEncodeUint(amount0Min) +
            jaineEncodeUint(amount1Min) +
            jaineEncodeAddress(wallet.address) +
            jaineEncodeUint(deadline);

        const tx = {
            to: jaineContracts.positionsNFT,
            data: calldata,
            gasLimit: 600000,
        };

        jaineLogger.loading(`Sending add liquidity transaction...`);
        const addLiqTx = await wallet.sendTransaction(tx);
        jaineLogger.loading(`Waiting for add liquidity confirmation: ${addLiqTx.hash}`);
        const receipt = await addLiqTx.wait();

        if (receipt.status === 1) {
            jaineLogger.success(`Add liquidity successful! Hash: ${addLiqTx.hash}`);
            const erc721Interface = new Interface(JAINE_ERC20_ABI);
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
                jaineLogger.info(`Minted new position with tokenId: ${tokenId}`);
            }
        } else {
            jaineLogger.error(`Add liquidity failed! Hash: ${addLiqTx.hash}`);
        }
    } catch (error) {
        jaineLogger.error(`Add liquidity failed: ${error.message}`);
    }
}

async function jaineExecuteSwap(wallet, tokenInName, tokenOutName, amount) {
    const tokenInAddress = jaineContracts[tokenInName];
    const tokenOutAddress = jaineContracts[tokenOutName];
    const tokenInDecimals = jaineTokenDecimals[tokenInName];

    jaineLogger.step(`Starting swap of ${amount} ${tokenInName} -> ${tokenOutName}...`);

    try {
        const tokenContract = new ethers.Contract(tokenInAddress, JAINE_ERC20_ABI, wallet);
        const spenderAddress = jaineContracts.router;
        const amountToApprove = parseUnits(amount, tokenInDecimals);

        const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress);
        if (currentAllowance < amountToApprove) {
            jaineLogger.step(`Allowance not sufficient for Router. Approving for ${formatUnits(amountToApprove, tokenInDecimals)}...`);
            const approveTx = await tokenContract.approve(spenderAddress, ethers.MaxUint256);
            jaineLogger.loading(`Waiting for approval confirmation: ${approveTx.hash}`);
            await approveTx.wait();
            jaineLogger.success(`Token approved successfully.`);
        }

        const methodId = '0x414bf389';
        const fee = (tokenInName === 'USDT' || tokenOutName === 'USDT') ? 500 : 100;
        const amountIn = parseUnits(amount, tokenInDecimals);
        const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
        const amountOutMinimum = 0;

        const calldata =
            methodId +
            jaineEncodeAddress(tokenInAddress) +
            jaineEncodeAddress(tokenOutAddress) +
            jaineEncodeUint(fee) +
            jaineEncodeAddress(wallet.address) +
            jaineEncodeUint(deadline) +
            jaineEncodeUint(amountIn) +
            jaineEncodeUint(amountOutMinimum) +
            '0'.repeat(64);

        const tx = {
            to: jaineContracts.router,
            data: calldata,
            gasLimit: 300000,
        };

        jaineLogger.loading(`Sending swap transaction...`);
        const swapTx = await wallet.sendTransaction(tx);
        jaineLogger.loading(`Waiting for swap confirmation: ${swapTx.hash}`);
        const receipt = await swapTx.wait();

        if (receipt.status === 1) {
            jaineLogger.success(`Swap successful! Hash: ${swapTx.hash}`);
        } else {
            jaineLogger.error(`Swap failed! Hash: ${swapTx.hash}`);
        }
    } catch (error) {
        jaineLogger.error(`Swap failed completely: ${error.message}`);
    }
}

function jaineGetRandomAmount(min, max, precision = 8) {
    return (Math.random() * (max - min) + min).toFixed(precision);
}

async function jaineStartCountdown(durationInSeconds) {
    jaineLogger.info(`All daily cycles complete. Starting 24-hour countdown...`);
    let remaining = durationInSeconds;
    while (remaining > 0) {
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        process.stdout.write(`[⏳] Time until next cycle: ${hours}h, ${minutes}m, ${seconds}s \r`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        remaining--;
    }
    console.log('\n');
}

async function jaineGetOperationChoices(rl) {
    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    const includeAddLiquidity = await question(`${jaineColors.white}[?] Include Add Liquidity in daily cycle? (y/n): ${jaineColors.reset}`);

    return {
        addLiquidity: ['y', 'yes'].includes(includeAddLiquidity.toLowerCase())
    };
}

// Renamed from main() to runJaineBot() for better integration with the controller
async function runJaineBot() {
    jaineLogger.banner();

    const privateKeys = fs.readFileSync('.env', 'utf8')
        .split('\n')
        .filter(line => line.startsWith('PRIVATE_KEY_'))
        .map(line => line.split('=')[1]?.trim())
        .filter(Boolean);

    if (privateKeys.length === 0) {
        jaineLogger.error("No PRIVATE_KEY found in .env file. Please add your private keys.");
        return;
    }
    jaineLogger.info(`${privateKeys.length} wallet(s) loaded successfully.`);
    const wallets = privateKeys.map(pk => new Wallet(pk, jaineProvider));

    jaineLogger.step("Starting login process for all wallets...");
    const loginPromises = wallets.map(wallet => jaineLogin(wallet));
    const accessTokens = await Promise.all(loginPromises);

    if (accessTokens.some(token => token === null)) {
        jaineLogger.error("Some wallets failed to log in. Check the log above for details. The script will stop.");
        return;
    }
    jaineLogger.success("All wallets logged in successfully.");

    jaineLogger.step("Starting faucet claim process for all wallets...");
    for (const wallet of wallets) {
        await jaineRequestFaucet(wallet, 'BTC');
        await jaineRequestFaucet(wallet, 'USDT');
        await jaineRequestFaucet(wallet, 'ETH');
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    jaineLogger.success("Faucet claim process finished.");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query) => new Promise(resolve => rl.question(query, resolve));
    const dailySetsInput = await question(`\n${jaineColors.white}[?] Enter the number of daily transaction sets: ${jaineColors.reset}`);
    const dailySets = parseInt(dailySetsInput);

    if (isNaN(dailySets) || dailySets <= 0) {
        jaineLogger.error("Invalid input. Please enter a number greater than 0.");
        rl.close();
        return;
    }

    const operationConfig = await jaineGetOperationChoices(rl);
    rl.close();

    jaineLogger.info(`Bot will run ${dailySets} transaction set(s) every day.`);
    if (operationConfig.addLiquidity) jaineLogger.info(`✓ Add Liquidity enabled`);

    while (true) {
        for (let i = 1; i <= dailySets; i++) {
            jaineLogger.step(`--- Starting Daily Transaction Set ${i} of ${dailySets} ---`);
            for (const wallet of wallets) {
                jaineLogger.wallet(`Processing Wallet: ${wallet.address}`);

                if (operationConfig.addLiquidity) {
                    await jaineAddLiquidity(wallet);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

                const btcAmount = jaineGetRandomAmount(0.00000015, 0.00000020, 8);
                await jaineExecuteSwap(wallet, 'BTC', 'USDT', btcAmount);
                await new Promise(resolve => setTimeout(resolve, 5000));

                const usdtToBtcAmount = jaineGetRandomAmount(1.5, 2.5, 2);
                await jaineExecuteSwap(wallet, 'USDT', 'BTC', usdtToBtcAmount);
                await new Promise(resolve => setTimeout(resolve, 5000));

                const usdtToGimoAmount = jaineGetRandomAmount(100, 105, 2);
                await jaineExecuteSwap(wallet, 'USDT', 'GIMO', usdtToGimoAmount);
                await new Promise(resolve => setTimeout(resolve, 5000));

                const gimoAmount = jaineGetRandomAmount(0.0001, 0.00015, 5);
                await jaineExecuteSwap(wallet, 'GIMO', 'USDT', gimoAmount);

                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }

        await jaineStartCountdown(86400);
    }
}
// =================================================================================================
// === JAINE DEFI BOT - SECTION END
// =================================================================================================


// --- MAIN SCRIPT CONTROLLER ---
async function countdownDelay(durationInSeconds, message) {
    for (let i = durationInSeconds; i > 0; i--) {
        const hours = Math.floor(i / 3600);
        const minutes = Math.floor((i % 3600) / 60);
        const seconds = i % 60;
        const timeString = `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;
        controllerLogger.countdown(`${message} ${timeString}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write('\n');
}

async function startScript() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query) => new Promise(resolve => rl.question(query, resolve));
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

    controllerLogger.banner("Multi-Bot Controller");
    const choice = await question(
        `${controllerColors.white}Which bot would you like to run?\n` +
        `[1] 0G Storage Uploader\n` +
        `[2] Jaine DeFi Bot\n` +
        `Enter your choice: ${controllerColors.reset}`
    );

    if (choice === '1') {
        const countInput = await question(`\n${controllerColors.white}[?] How many files to upload per wallet per 24-hour cycle? ${controllerColors.reset}`);
        const count = parseInt(countInput);
        rl.close();
        
        const uploadCount = (isNaN(count) || count <= 0) ? 1 : count;
        if (isNaN(count) || count <= 0) {
            controllerLogger.warn('Invalid number. Defaulting to 1.');
        }

        const runUploaderCycle = async () => {
            try {
                await runUploads(uploadCount);
                controllerLogger.info(`0G Uploader cycle finished.`);
                const nextRunTime = new Date(Date.now() + twentyFourHoursInMs);
                controllerLogger.info(`Next cycle will start in 24 hours at ${nextRunTime.toLocaleString('id-ID')}`);
            } catch (error) {
                controllerLogger.critical(`An error occurred during the uploader cycle: ${error.message}`);
                controllerLogger.info(`Retrying in 24 hours...`);
            }
        };

        // Run the first cycle immediately
        await runUploaderCycle();

        // Schedule subsequent cycles every 24 hours
        setInterval(runUploaderCycle, twentyFourHoursInMs);

    } else if (choice === '2') {
        // The Jaine bot handles its own readline interface, so we close the main one.
        rl.close(); 
        // The runJaineBot function now contains the entire logic from the new script.
        await runJaineBot(); 
    } else {
        controllerLogger.error("Invalid choice. Exiting.");
        rl.close();
    }
}

startScript().catch(err => {
    controllerLogger.critical(`An unexpected error occurred: ${err.message}`);
    console.error(err);
});
