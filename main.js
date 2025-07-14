require('dotenv').config();
const { ethers, AbiCoder } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

// Objek 'colors' dan 'loggerTheme' tidak diubah, tetap sama.
const colors = {
    reset: "\x1b[0m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
    bold: "\x1b[1m"
};

const loggerTheme = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    italic: "\x1b[3m",
    underline: "\x1b[4m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    bgGray: "\x1b[100m",
};

const fancyBox = (title, subtitle) => {
    // Menambahkan pengaman jika title atau subtitle tidak ada
    const mainTitle = title || '';
    const subTitle = subtitle || '';
    console.log(`${loggerTheme.cyan}${loggerTheme.bold}`);
    console.log('╔══════════════════════════════════════════════╗');
    console.log(`║  ${mainTitle.padEnd(42)}  ║`);
    if (subtitle) {
        console.log(`║  ${subTitle.padEnd(42)}  ║`);
    }
    console.log('╚══════════════════════════════════════════════╝');
    console.log(loggerTheme.reset);
};

// --- PERBAIKAN: Menambahkan level 'debug' dan 'critical' pada logger ---
const logger = {
    info: (msg) => console.log(`${loggerTheme.blue}[ ℹ️ INFO ] → ${msg}${loggerTheme.reset}`),
    warn: (msg) => console.log(`${loggerTheme.yellow}[ ⚠️ WARNING ] → ${msg}${loggerTheme.reset}`),
    error: (msg) => console.log(`${loggerTheme.red}[ ✖️ ERROR ] → ${msg}${loggerTheme.reset}`),
    success: (msg) => console.log(`${loggerTheme.green}[ ✔️ DONE ] → ${msg}${loggerTheme.reset}`),
    loading: (msg) => console.log(`${loggerTheme.cyan}[ ⌛️ LOADING ] → ${msg}${loggerTheme.reset}`),
    step: (msg) => console.log(`${loggerTheme.magenta}[ ➔ STEP ] → ${msg}${loggerTheme.reset}`),
    debug: (msg) => console.log(`${colors.gray}[ 🐞 DEBUG ] → ${msg}${colors.reset}`),
    critical: (msg) => {
        console.log(`${loggerTheme.red}${loggerTheme.bold}[ 💥 CRITICAL ] → ${msg}${loggerTheme.reset}`);
        process.exit(1); // Menambahkan exit agar program berhenti
    },
    banner: () => fancyBox(' 🍉🍉 Free Plestine 🍉🍉', '— 19Seniman From Insider 🏴‍☠️ —'),
};


const CHAIN_ID = 16601;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x5f1D96895e442FC0168FA2F9fb1EBeF93Cb5035e';
const PROXY_FILE = 'proxies.txt';

let privateKeys = [];

// --- PERBAIKAN: Menyederhanakan fungsi loadPrivateKeys ---
function loadPrivateKeys() {
    const keys = Object.keys(process.env).filter(k => k.startsWith('PRIVATE_KEY'));
    if (keys.length === 0) {
        logger.critical('No private keys found in .env file. Name them PRIVATE_KEY, PRIVATE_KEY_1, etc.');
    }

    privateKeys = keys.map(k => process.env[k]).filter(Boolean); // Filter nilai yang kosong

    if (privateKeys.length === 0) {
        logger.critical('Private keys are defined but empty in .env file.');
    }

    logger.success(`Loaded ${privateKeys.length} private key(s) from .env file`);
}

function getRandomUserAgent() {
    const userAgents = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
}

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
                logger.warn(`No proxies found in ${PROXY_FILE}, proceeding without proxies.`);
            }
        } else {
            logger.warn(`Proxy file ${PROXY_FILE} not found, proceeding without proxies.`);
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

function createAxiosInstance() {
    const config = {
        headers: {
            'User-Agent': getRandomUserAgent()
        }
    };
    const proxy = getNextProxy();
    if (proxy) {
        logger.debug(`Using proxy: ${proxy}`);
        config.httpsAgent = new HttpsProxyAgent(proxy);
    }
    return axios.create(config);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function getGasPrice() {
    try {
        const feeData = await provider.getFeeData();
        // Menambahkan buffer 10% untuk memastikan transaksi tidak gagal karena gas rendah
        const maxFeePerGas = (feeData.maxFeePerGas * 110n) / 100n;
        const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 110n) / 100n;

        return { maxFeePerGas, maxPriorityFeePerGas };
    } catch (error) {
        logger.error(`Error getting gas price: ${error.message}. Using fallback values.`);
        // Fallback jika RPC gagal memberikan data gas
        return {
            maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("0.1", "gwei")
        };
    }
}

async function fetchRandomImage() {
    try {
        logger.loading('Fetching random image...');
        const axiosInstance = createAxiosInstance();
        const response = await axiosInstance.get('https://picsum.photos/800/600', {
            responseType: 'arraybuffer'
        });
        logger.success('Random image fetched successfully.');
        return response.data;
    } catch (error) {
        logger.error(`Error fetching image: ${error.message}`);
        throw error;
    }
}

async function prepareImageData(imageBuffer) {
    const hash = '0x' + crypto.createHash('sha256').update(imageBuffer).digest('hex');
    logger.success(`Generated file hash: ${hash}`);
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    return { root: hash, data: imageBase64 };
}

// --- PERBAIKAN TOTAL: Membuat fungsi encodeTransactionData menjadi dinamis ---
function encodeTransactionData(fileRoot) {
    // Method ID untuk fungsi 'submit' adalah 0xef3e12dc
    const methodId = '0xef3e12dc';

    // Tipe data parameter sesuai dengan yang diharapkan oleh kontrak
    // (bytes32, bytes, bytes, bytes)
    const paramTypes = ['bytes32', 'bytes', 'bytes', 'bytes'];

    // Nilai-nilai parameter. Kita hanya perlu fileRoot, yang lain bisa kosong.
    const params = [
        fileRoot, // fileRoot yang sebenarnya
        '0x',     // proof (kosong)
        '0x',     // data (kosong)
        '0x'      // vm-related data (kosong)
    ];

    // Menggunakan AbiCoder dari ethers untuk meng-encode parameter dengan benar
    const abiCoder = AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(paramTypes, params);

    // Menggabungkan methodId dengan parameter yang sudah di-encode
    return ethers.concat([methodId, encodedParams]);
}


async function uploadToStorage(imageData, wallet, walletIndex) {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            logger.loading(`[Wallet ${walletIndex + 1}] Uploading file segment to indexer (Attempt ${attempt})...`);
            const axiosInstance = createAxiosInstance();
            await axiosInstance.post('https://indexer-storage-testnet-turbo.0g.ai/file/segment', {
                root: imageData.root,
                index: 0,
                data: imageData.data,
                proof: null // Proof bisa null sesuai dokumentasi
            });

            logger.success(`[Wallet ${walletIndex + 1}] Segment uploaded. Submitting transaction...`);

            // --- PERBAIKAN: Menggunakan fungsi encode yang sudah diperbaiki ---
            const data = encodeTransactionData(imageData.root);
            
            logger.loading(`[Wallet ${walletIndex + 1}] Getting gas prices and estimating gas...`);
            const gasPrice = await getGasPrice();
            const gasEstimate = await provider.estimateGas({
                to: CONTRACT_ADDRESS,
                data,
                from: wallet.address
            });

            // Memberikan buffer 20% pada estimasi gas
            const gasLimit = (gasEstimate * 120n) / 100n;
            logger.success(`[Wallet ${walletIndex + 1}] Gas estimated: ${gasLimit} units. Sending transaction...`);
            
            // --- PERBAIKAN: Menghapus manajemen nonce manual ---
            const tx = await wallet.sendTransaction({
                to: CONTRACT_ADDRESS,
                data,
                gasLimit: gasLimit,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
            });

            logger.info(`[Wallet ${walletIndex + 1}] Transaction sent! Hash: ${tx.hash}`);
            logger.loading('Waiting for confirmation...');
            const receipt = await tx.wait();
            
            if (receipt.status === 0) {
                 throw new Error(`Transaction failed! Receipt: ${JSON.stringify(receipt)}`);
            }

            logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
            logger.success(`File uploaded with root hash: ${imageData.root}`);
            return receipt;

        } catch (error) {
            logger.error(`[Wallet ${walletIndex + 1}] Attempt ${attempt}/${MAX_RETRIES} failed: ${error.message}`);
            if (attempt === MAX_RETRIES) {
                logger.error(`All retry attempts failed for wallet ${wallet.address}.`);
                throw error;
            }
            logger.loading(`Waiting for 5 seconds before retrying...`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

function saveTransactionResult(txData) {
    try {
        const resultsDir = 'results';
        if (!fs.existsSync(resultsDir)) {
            fs.mkdirSync(resultsDir);
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filePath = path.join(resultsDir, `tx-${timestamp}.json`);
        fs.writeFileSync(filePath, JSON.stringify(txData, null, 2));
        logger.debug(`Transaction details saved to ${filePath}`);
    } catch (error) {
        logger.error(`Failed to save transaction results: ${error.message}`);
    }
}

async function main() {
    try {
        logger.banner();
        loadPrivateKeys();
        loadProxies();

        console.log(colors.cyan + "Available wallets:" + colors.reset);
        privateKeys.forEach((key, index) => {
            const wallet = new ethers.Wallet(key);
            console.log(`${colors.green}[${index + 1}]${colors.reset} ${colors.yellow}${wallet.address}${colors.reset}`);
        });
        console.log();

        rl.question('How many files to upload per wallet? ', async (countInput) => {
            const count = parseInt(countInput);
            if (isNaN(count) || count <= 0) {
                logger.error('Please enter a valid number greater than 0.');
                rl.close();
                return;
            }

            const totalUploads = count * privateKeys.length;
            logger.info(`Starting upload process for ${count} files per wallet (${totalUploads} total uploads).`);

            const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
            let successful = 0;
            let failed = 0;

            for (let walletIndex = 0; walletIndex < privateKeys.length; walletIndex++) {
                const privateKey = privateKeys[walletIndex];
                const wallet = new ethers.Wallet(privateKey, provider);
                logger.info(`${colors.bold}--- Starting uploads for wallet #${walletIndex + 1} [${wallet.address}] ---${colors.reset}`);

                for (let i = 1; i <= count; i++) {
                    const uploadNumber = (walletIndex * count) + i;
                    logger.step(`Processing upload ${uploadNumber} of ${totalUploads} (Wallet #${walletIndex + 1}, Upload #${i})`);

                    try {
                        const imageBuffer = await fetchRandomImage();
                        const imageData = await prepareImageData(imageBuffer);
                        const receipt = await uploadToStorage(imageData, wallet, walletIndex);

                        const result = {
                            walletIndex: walletIndex + 1,
                            walletAddress: wallet.address,
                            uploadIndex: i,
                            txHash: receipt.hash,
                            blockNumber: receipt.blockNumber,
                            fileHash: imageData.root,
                            status: 'success'
                        };
                        saveTransactionResult(result);
                        successful++;
                        logger.success(`Upload #${uploadNumber} completed successfully!`);

                    } catch (error) {
                        failed++;
                        const result = {
                            walletIndex: walletIndex + 1,
                            walletAddress: wallet.address,
                            uploadIndex: i,
                            error: error.message,
                            status: 'failed'
                        };
                        saveTransactionResult(result);
                        logger.error(`Upload #${uploadNumber} failed.`);
                    }
                    
                    if (i < count) {
                        logger.loading('Waiting 5 seconds before next upload for this wallet...');
                        await delay(5000);
                    }
                }

                if (walletIndex < privateKeys.length - 1) {
                    logger.loading(`All uploads for wallet #${walletIndex + 1} are done. Waiting 10 seconds before switching to the next wallet...`);
                    await delay(10000);
                }
            }

            console.log();
            logger.info('--- Upload Session Summary ---');
            logger.info(`Total wallets: ${privateKeys.length}`);
            logger.info(`Uploads per wallet: ${count}`);
            logger.success(`Successful uploads: ${successful}`);
            if (failed > 0) {
                logger.error(`Failed uploads: ${failed}`);
            }
            logger.success('All operations completed!');
            rl.close();
        });
    } catch (error) {
        logger.critical(`A critical error occurred in the main process: ${error.message}`);
        rl.close();
    }
}

main();
