require('dotenv').config();
const { ethers, Wallet, JsonRpcProvider, parseUnits, formatUnits, MaxUint256, Interface } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

const colors = {
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
    gray: "\x1b[90m",
    lightRed: "\x1b[91m",
    lightGreen: "\x1b[92m",
    lightYellow: "\x1b[93m",
    lightBlue: "\x1b[94m",
    lightMagenta: "\x1b[95m",
    lightCyan: "\x1b[96m",
    lightWhite: "\x1b[97m",

    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
    bgGray: "\x1b[100m",
    bgLightRed: "\x1b[101m",
    bgLightGreen: "\x1b[102m",
    bgLightYellow: "\x1b[103m",
    bgLightBlue: "\x1b[104m",
    bgLightMagenta: "\x1b[105m",
    bgLightCyan: "\x1b[106m",
    bgLightWhite: "\x1b[107m",
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bright}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bright}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bright}[SUMMARY] ${msg}${colors.reset}`),
    banner: (titleText = "🍉 19Seniman From Insider 🍉") => {
        const titleLine = `║      ${titleText.padEnd(30)} ║`;
        const border = `${colors.blue}${colors.bright}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bright}${titleLine}${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bright}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bright} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
    wallet: (msg) => console.log(`${colors.lightBlue}[W] ${msg}${colors.reset}`),
};

// =================================================================================================
// === 0G STORAGE UPLOADER FILE - SECTION START
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

let privateKeys = [];
let currentKeyIndex = 0;

// Ethers v6 is assumed due to imports like JsonRpcProvider, parseUnits, formatUnits
const zeroGProvider = new ethers.JsonRpcProvider(ZERO_G_RPC_URL);

function loadPrivateKeys() {
    try {
        privateKeys = []; // Reset array to ensure fresh load
        let index = 1;
        let key;
        do {
            key = process.env[`PRIVATE_KEY_${index}`];
            if (key && isValidPrivateKey(key)) {
                privateKeys.push(key);
            } else if (key) {
                logger.error(`Invalid private key format at PRIVATE_KEY_${index}`);
            }
            index++;
        } while (key);

        if (privateKeys.length === 0) {
            logger.critical('No valid private keys found in .env file');
            return false;
        }

        logger.success(`Loaded ${privateKeys.length} private key(s)`);
        return true;
    } catch (error) {
        logger.critical(`Failed to load private keys: ${error.message}`);
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

function getNextPrivateKey() {
    return privateKeys[currentKeyIndex];
}

function getRandomUserAgent() {
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
            if (proxies.length > 0) logger.info(`Loaded ${proxies.length} proxies.`);
            else logger.warn(`No proxies found in ${PROXY_FILE}`);
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

function createZeroGAxiosInstance() {
    const config = {
        headers: {
            'User-Agent': getRandomUserAgent(),
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
    const privateKey = getNextPrivateKey();
    return new ethers.Wallet(privateKey, zeroGProvider);
}

async function checkZeroGNetworkSync() {
    try {
        logger.loading('Checking 0G network sync...');
        const blockNumber = await zeroGProvider.getBlockNumber();
        logger.success(`0G Network synced at block ${blockNumber}`);
        return true;
    } catch (error) {
        logger.error(`0G Network sync check failed: ${error.message}`);
        return false;
    }
}

async function fetchRandomImage() {
    try {
        logger.loading('Fetching random image...');
        const axiosInstance = createZeroGAxiosInstance();
        const source = IMAGE_SOURCES[Math.floor(Math.random() * IMAGE_SOURCES.length)];
        const response = await axiosInstance.get(source.url, { responseType: source.responseType, maxRedirects: 5 });
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
        const axiosInstance = createZeroGAxiosInstance();
        const response = await axiosInstance.get(`${INDEXER_URL}/file/info/${fileHash}`);
        return response.data.exists || false;
    } catch (error) {
        logger.warn(`Failed to check file hash: ${error.message}`);
        return false;
    }
}

async function prepareImageData(imageBuffer) {
    const MAX_HASH_ATTEMPTS = 5;
    for (let attempt = 1; attempt <= MAX_HASH_ATTEMPTS; attempt++) {
        const hashInput = Buffer.concat([Buffer.from(imageBuffer), crypto.randomBytes(16)]);
        const hash = '0x' + crypto.createHash('sha256').update(hashInput).digest('hex');
        if (!(await checkFileExists(hash))) {
            logger.success(`Generated unique file hash: ${hash}`);
            return { root: hash, data: Buffer.from(imageBuffer).toString('base64') };
        }
        logger.warn(`Hash ${hash} already exists, retrying...`);
    }
    throw new Error(`Failed to generate unique hash after ${MAX_HASH_ATTEMPTS} attempts`);
}

async function uploadToStorage(imageData, wallet, walletIndex) {
    const MAX_RETRIES = 3;
    const TIMEOUT_SECONDS = 300;
    
    logger.loading(`Checking wallet balance for ${wallet.address}...`);
    const balance = await zeroGProvider.getBalance(wallet.address);
    if (balance < parseUnits('0.0015', 'ether')) {
        throw new Error(`Insufficient balance: ${formatUnits(balance, 'ether')} OG`);
    }
    logger.success(`Wallet balance: ${formatUnits(balance, 'ether')} OG`);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            logger.loading(`Uploading file for wallet #${walletIndex + 1} (Attempt ${attempt})...`);
            const axiosInstance = createZeroGAxiosInstance();
            await axiosInstance.post(`${INDEXER_URL}/file/segment`, {
                root: imageData.root, index: 0, data: imageData.data, proof: { siblings: [imageData.root], path: [] }
            }, { headers: { 'content-type': 'application/json' } });
            logger.success('File segment uploaded');

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
            // Dynamically fetch current gas price
            const feeData = await zeroGProvider.getFeeData();
            const gasPrice = feeData.gasPrice || parseUnits('1.03', 'gwei'); // Fallback if gasPrice is null

            logger.loading('Estimating gas...');
            // Add error handling for gas estimation
            let gasEstimate;
            try {
                gasEstimate = await zeroGProvider.estimateGas({ to: ZERO_G_CONTRACT_ADDRESS, data, from: wallet.address, value });
            } catch (estimateError) {
                logger.warn(`Failed to accurately estimate gas, using a higher default. Error: ${estimateError.message}`);
                gasEstimate = 300000n; // A sensible default if estimation fails
            }
            const gasLimit = gasEstimate * 15n / 10n; // Increase gas limit by 50%
            logger.success(`Gas limit set: ${gasLimit}`);

            logger.loading('Sending transaction...');
            const nonce = await zeroGProvider.getTransactionCount(wallet.address, 'latest');
            const tx = await wallet.sendTransaction({ to: ZERO_G_CONTRACT_ADDRESS, data, value, nonce, chainId: ZERO_G_CHAIN_ID, gasPrice, gasLimit });
            logger.info(`Transaction sent: ${EXPLORER_URL}${tx.hash}`);

            logger.loading(`Waiting for confirmation (${TIMEOUT_SECONDS}s)...`);
            const receipt = await tx.wait(1, TIMEOUT_SECONDS * 1000);

            if (receipt && receipt.status === 1) {
                logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
                return receipt;
            } else {
                throw new Error(`Transaction failed (status 0): ${EXPLORER_URL}${tx.hash}`);
            }
        } catch (error) {
            logger.error(`Upload attempt ${attempt} failed: ${error.message}`);
            // Log the full error for debugging
            if (error.receipt) {
                logger.error(`Transaction Receipt Status: ${error.receipt.status}`);
                logger.error(`Transaction Hash: ${error.receipt.hash}`);
            }
            if (attempt < MAX_RETRIES) {
                await countdownDelay(15, `Retrying in`);
            } else {
                throw error;
            }
        }
    }
}

async function runUploads(countPerWallet) {
    logger.banner("0G Storage Uploader");
    if (!loadPrivateKeys()) return;
    loadProxies();

    logger.loading('Checking 0G network status...');
    const network = await zeroGProvider.getNetwork();
    if (network.chainId !== BigInt(ZERO_G_CHAIN_ID)) {
        throw new Error(`Invalid chainId: expected ${ZERO_G_CHAIN_ID}, got ${network.chainId}`);
    }
    logger.success(`Connected to 0G network: chainId ${network.chainId}`);
    if (!(await checkZeroGNetworkSync())) throw new Error('0G Network is not synced');

    logger.step("Available Wallets:");
    privateKeys.forEach((key, index) => {
        const wallet = new ethers.Wallet(key);
        logger.info(`[${index + 1}] ${wallet.address}`);
    });

    const totalUploads = countPerWallet * privateKeys.length;
    logger.info(`Starting ${totalUploads} uploads (${countPerWallet} per wallet)`);

    let successful = 0, failed = 0;
    for (let walletIndex = 0; walletIndex < privateKeys.length; walletIndex++) {
        currentKeyIndex = walletIndex;
        const wallet = initializeZeroGWallet();
        logger.section(`Processing Wallet #${walletIndex + 1} [${wallet.address}]`);

        for (let i = 1; i <= countPerWallet; i++) {
            const uploadNumber = (walletIndex * countPerWallet) + i;
            logger.step(`Upload ${uploadNumber}/${totalUploads}`);
            try {
                const imageBuffer = await fetchRandomImage();
                const imageData = await prepareImageData(imageBuffer);
                await uploadToStorage(imageData, wallet, walletIndex);
                successful++;
                logger.success(`Upload ${uploadNumber} completed`);
                if (uploadNumber < totalUploads) await countdownDelay(5, `Waiting for next upload in`);
            } catch (error) {
                failed++;
                logger.error(`Upload ${uploadNumber} failed: ${error.message}`);
                await countdownDelay(5, `Continuing after error in`);
            }
        }
        if (walletIndex < privateKeys.length - 1) await countdownDelay(10, `Switching to next wallet in`);
    }

    logger.section('Upload Summary');
    logger.summary(`Total wallets: ${privateKeys.length}`);
    logger.summary(`Total attempted: ${totalUploads}`);
    if (successful > 0) logger.success(`Successful: ${successful}`);
    if (failed > 0) logger.error(`Failed: ${failed}`);
}

// =================================================================================================
// === 0G STORAGE UPLOADER FILE - SECTION END
// =================================================================================================


// =================================================================================================
// === JAINE DEFI TESTNET - SECTION START
// =================================================================================================

 const RPC_URL = 'https://evmrpc-testnet.0g.ai/'; 
 const CHAIN_ID = 16601; 
 const provider = new JsonRpcProvider(RPC_URL); 

 const contracts = { 
     router: '0xb95B5953FF8ee5D5d9818CdbEfE363ff2191318c', 
     positionsNFT: '0x44f24b66b3baa3a784dbeee9bfe602f15a2cc5d9', 
     USDT: '0x3ec8a8705be1d5ca90066b37ba62c4183b024ebf', 
     BTC: '0x36f6414ff1df609214ddaba71c84f18bcf00f67d', 
     ETH: '0x0fE9B43625fA7EdD663aDcEC0728DD635e4AbF7c', 
     GIMO: '0xba2ae6c8cddd628a087d7e43c1ba9844c5bf9638' 
 }; 

 const tokenDecimals = { 
     USDT: 6, // *** PERBAIKAN: Mengubah USDT dari 18 menjadi 6 desimal ***
     BTC: 18, 
     ETH: 18, 
     GIMO: 18 
 }; 

 const ERC20_ABI = [ 
     "function approve(address spender, uint256 amount) returns (bool)", 
     "function allowance(address owner, address spender) view returns (uint256)", 
    "function balanceOf(address owner) view returns (uint256)", 
    "function decimals() view returns (uint8)", 
     "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)" 
 ]; 

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

 const createAxiosInstance = (accessToken = null) => { 
     const userAgent = getRandomUserAgent(); 
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

 async function login(wallet) { 
     logger.step(`Starting login process for wallet ${wallet.address}...`); 
     try { 
         const axiosInstance = createAxiosInstance(); 

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

 // Fungsi untuk memeriksa saldo token
 async function checkTokenBalance(wallet, tokenAddress, tokenName, decimals) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider); // Gunakan provider
    try {
        const balance = await tokenContract.balanceOf(wallet.address);
        logger.info(`Wallet ${wallet.address} balance for ${tokenName}: ${formatUnits(balance, decimals)}`);
        return balance;
    } catch (error) {
        logger.error(`Failed to get balance for ${tokenName}: ${error.message}`);
        return 0n;
    }
}

 async function approveToken(wallet, tokenAddress, amount, decimals) { 
     const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet); 
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
         } else {
            logger.info(`Token already approved for sufficient amount.`);
        }
     } catch (error) { 
         logger.error(`Failed to approve: ${error.message}`); 
         throw error; 
     } 
 } 

 async function addLiquidity(wallet) { 
     const btcAmount = "0.000001"; 
     // *** PERBAIKAN: Memastikan usdtAmount hanya memiliki 6 desimal ***
     const usdtAmount = "0.086484"; // Contoh nilai yang dibulatkan/dipotong ke 6 desimal.

     const token0Address = contracts.BTC; 
     const token1Address = contracts.USDT; 
     const token0Decimals = tokenDecimals.BTC; 
     const token1Decimals = tokenDecimals.USDT; 

     logger.step(`Adding liquidity: ${btcAmount} BTC + ${usdtAmount} USDT`); 

    // *** PERBAIKAN: Tambahkan pengecekan saldo sebelum addLiquidity ***
    const btcBalance = await checkTokenBalance(wallet, token0Address, 'BTC', token0Decimals);
    const usdtBalance = await checkTokenBalance(wallet, token1Address, 'USDT', token1Decimals);

    if (btcBalance < parseUnits(btcAmount, token0Decimals)) {
        logger.error(`Insufficient BTC balance for ${wallet.address}. Needed: ${btcAmount}, Have: ${formatUnits(btcBalance, token0Decimals)}`);
        return; // Hentikan operasi jika saldo tidak cukup
    }
    if (usdtBalance < parseUnits(usdtAmount, token1Decimals)) {
        logger.error(`Insufficient USDT balance for ${wallet.address}. Needed: ${usdtAmount}, Have: ${formatUnits(usdtBalance, token1Decimals)}`);
        return; // Hentikan operasi jika saldo tidak cukup
    }

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

    // *** PERBAIKAN: Tambahkan pengecekan saldo sebelum swap ***
    const tokenInBalance = await checkTokenBalance(wallet, tokenInAddress, tokenInName, tokenInDecimals);
    if (tokenInBalance < parseUnits(amount, tokenInDecimals)) {
        logger.error(`Insufficient ${tokenInName} balance for swap. Needed: ${amount}, Have: ${formatUnits(tokenInBalance, tokenInDecimals)}`);
        return; // Hentikan operasi jika saldo tidak cukup
    }

     try { 
         const tokenContract = new ethers.Contract(tokenInAddress, ERC20_ABI, wallet); 
         const spenderAddress = contracts.router; 
         const amountToApprove = parseUnits(amount, tokenInDecimals); 

         const currentAllowance = await tokenContract.allowance(wallet.address, spenderAddress); 
         if (currentAllowance < amountToApprove) { 
             logger.step(`Allowance not sufficient for Router. Approving for ${formatUnits(amountToApprove, tokenInDecimals)}...`); 
             const approveTx = await tokenContract.approve(spenderAddress, ethers.MaxUint256); 
             logger.loading(`Waiting for approval confirmation: ${approveTx.hash}`); 
             await approveTx.wait(); 
             logger.success(`Token approved successfully.`); 
         } else {
            logger.info(`Token already approved for sufficient amount.`);
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
         process.stdout.write(`[⏳] Time until next cycle: ${hours}h, ${minutes}m, ${seconds}s \r`); 
         await new Promise(resolve => setTimeout(resolve, 1000)); 
         remaining--; 
     } 
     console.log('\n'); 
 } 

 async function getOperationChoices(rl) { 
     const question = (query) => new Promise(resolve => rl.question(query, resolve)); 

     const includeAddLiquidity = await question(`${colors.white}[?] Include Add Liquidity in daily cycle? (y/n): ${colors.reset}`); 

     return { 
         addLiquidity: ['y', 'yes'].includes(includeAddLiquidity.toLowerCase()) 
     }; 
 } 

 async function runJaineBot() { 
     logger.banner("JAINE DEFI TESTNET"); 
     const privateKeys = fs.readFileSync('.env', 'utf8') 
         .split('\n') 
         .filter(line => line.startsWith('PRIVATE_KEY_')) 
         .map(line => line.split('=')[1]?.trim()) 
         .filter(Boolean); 

     if (privateKeys.length === 0) { 
         logger.error("No PRIVATE_KEY found in .env file. Please add your private keys."); 
         return; 
     } 
     logger.info(`${privateKeys.length} wallet(s) loaded successfully.`); 
     const wallets = privateKeys.map(pk => new Wallet(pk, provider)); 

     logger.step("Starting login process for all wallets..."); 
     const loginPromises = wallets.map(wallet => login(wallet)); 
     const accessTokens = await Promise.all(loginPromises); 

     if (accessTokens.some(token => token === null)) { 
         logger.error("Some wallets failed to log in. Check the log above for details. The script will stop."); 
         return; 
     } 
     logger.success("All wallets logged in successfully."); 

     logger.step("Starting faucet claim process for all wallets..."); 
     for (const wallet of wallets) { 
         await requestFaucet(wallet, 'BTC'); 
         await requestFaucet(wallet, 'USDT'); 
         await requestFaucet(wallet, 'ETH'); 
         await new Promise(resolve => setTimeout(resolve, 2000)); 
     } 
     logger.success("Faucet claim process finished."); 

     const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); 
     const question = (query) => new Promise(resolve => rl.question(query, resolve)); 
     const dailySetsInput = await question(`\n${colors.white}[?] Enter the number of daily transaction sets: ${colors.reset}`); 
     const dailySets = parseInt(dailySetsInput); 

     if (isNaN(dailySets) || dailySets <= 0) { 
         logger.error("Invalid input. Please enter a number greater than 0."); 
         rl.close(); 
         return; 
     } 

     const operationConfig = await getOperationChoices(rl); 
     rl.close(); 

     logger.info(`Bot will run ${dailySets} transaction set(s) every day.`); 
     if (operationConfig.addLiquidity) logger.info(`✓ Add Liquidity enabled`); 

     while (true) { 
         for (let i = 1; i <= dailySets; i++) { 
             logger.step(`--- Starting Daily Transaction Set ${i} of ${dailySets} ---`); 
             for (const wallet of wallets) { 
                 logger.wallet(`Processing Wallet: ${wallet.address}`); 

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

                 await new Promise(resolve => setTimeout(resolve, 10000)); 
             } 
         } 

         await startCountdown(86400); 
     } 
 } 

// =================================================================================================
// === JAINE DEFI TESTNET - SECTION END
// =================================================================================================


// --- MAIN SCRIPT CONTROLLER ---
async function countdownDelay(durationInSeconds, message) {
    for (let i = durationInSeconds; i > 0; i--) {
        const hours = Math.floor(i / 3600);
        const minutes = Math.floor((i % 3600) / 60);
        const seconds = i % 60;
        const timeString = `${hours > 0 ? hours + 'h ' : ''}${minutes > 0 ? minutes + 'm ' : ''}${seconds}s`;
        logger.countdown(`${message} ${timeString}`);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    process.stdout.write('\n');
}

async function startScript() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const question = (query) => new Promise(resolve => rl.question(query, resolve));
    const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

    logger.banner("Multi-Bot Controller");
    const choice = await question(
        `${colors.white}Which bot would you like to run?\n` +
        `[1] 0G Storage Uploader\n` +
        `[2] Jaine DeFi Bot\n` +
        `Enter your choice: ${colors.reset}`
    );

    if (choice === '1') {
        const countInput = await question(`\n${colors.white}[?] How many files to upload per wallet per 24-hour cycle? ${colors.reset}`);
        const count = parseInt(countInput);
        rl.close();
        
        const uploadCount = (isNaN(count) || count <= 0) ? 1 : count;
        if (isNaN(count) || count <= 0) {
            logger.warn('Invalid number. Defaulting to 1.');
        }

        const runUploaderCycle = async () => {
            try {
                await runUploads(uploadCount);
                logger.info(`0G Uploader cycle finished.`);
                const nextRunTime = new Date(Date.now() + twentyFourHoursInMs);
                logger.info(`Next cycle will start in 24 hours at ${nextRunTime.toLocaleString('id-ID')}`);
            } catch (error) {
                logger.critical(`An error occurred during the uploader cycle: ${error.message}`);
                logger.info(`Retrying in 24 hours...`);
            }
        };

        // Run the first cycle immediately
        await runUploaderCycle();

        // Schedule subsequent cycles every 24 hours
        setInterval(runUploaderCycle, twentyFourHoursInMs);

    } else if (choice === '2') {
        rl.close(); // Jaine bot handles its own readline interface
        await runJaineBot(); // This function already contains the 24-hour loop
    } else {
        logger.error("Invalid choice. Exiting.");
        rl.close();
    }
}

startScript().catch(err => {
    logger.critical(`An unexpected error occurred: ${err.message}`);
    console.error(err);
});
