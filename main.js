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
const zeroGProvider = new ethers.JsonRpcProvider(
    ZERO_G_RPC_URL,
    ZERO_G_CHAIN_ID,
    { staticNetwork: true, timeout: 120000 } // 120 seconds
);

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
                Buffer.from('000000000000000000000000000000000000000000000000000000000000020', 'hex'),
                Buffer.from('000000000000000000000000000000000000000000000000000000000000014', 'hex'),
                Buffer.from('000000000000000000000000000000000000000000000000000000000000060', 'hex'),
                Buffer.from('000000000000000000000000000000000000000000000000000000000000080', 'hex'),
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
