require('dotenv').config();
const { ethers, AbiCoder } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

const CHAIN_ID = 16601;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x5f1D96895e442FC0168FA2F9fb1EBeF93Cb5035e';
const PROXY_FILE = 'proxies.txt';

let privateKeys = [];

function loadPrivateKeys() {
    const keys = Object.keys(process.env).filter(k => k.startsWith('PRIVATE_KEY'));
    if (keys.length === 0) {
        logger.critical('No private keys found in .env file. Name them PRIVATE_KEY, PRIVATE_KEY_1, etc.');
        process.exit(1);
    }

    privateKeys = keys.map(k => process.env[k]).filter(Boolean);

    if (privateKeys.length === 0) {
        logger.critical('Private keys are defined but empty in .env file.');
        process.exit(1);
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
        logger.subStep('Fetching current gas prices...');
        const feeData = await provider.getFeeData();
        const maxFeePerGas = (feeData.maxFeePerGas * 110n) / 100n;
        const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 110n) / 100n;
        logger.subStep(`Gas prices fetched: MaxFee: ${ethers.formatUnits(maxFeePerGas, "gwei")} Gwei, PriorityFee: ${ethers.formatUnits(maxPriorityFeePerGas, "gwei")} Gwei`);
        return { maxFeePerGas, maxPriorityFeePerGas };
    } catch (error) {
        logger.error(`Error getting gas price: ${error.message}. Using fallback values.`);
        return {
            maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
            maxPriorityFeePerGas: ethers.parseUnits("0.1", "gwei")
        };
    }
}

async function fetchRandomImage() {
    try {
        logger.subStep('Fetching random image from picsum.photos...');
        const axiosInstance = createAxiosInstance();
        const response = await axiosInstance.get('https://picsum.photos/800/600', {
            responseType: 'arraybuffer'
        });
        logger.subStep('Random image fetched successfully.');
        return response.data;
    } catch (error) {
        logger.error(`Error fetching image: ${error.message}`);
        throw error;
    }
}

async function prepareImageData(imageBuffer) {
    logger.subStep('Generating SHA256 hash for the image...');
    const hash = '0x' + crypto.createHash('sha256').update(imageBuffer).digest('hex');
    logger.subStep(`Generated file hash: ${hash}`);
    logger.subStep('Converting image to Base64...');
    const imageBase64 = Buffer.from(imageBuffer).toString('base64');
    logger.subStep('Image data prepared.');
    return { root: hash, data: imageBase64 };
}

function encodeTransactionData(fileRoot) {
    const methodId = '0xef3e12dc';
    const paramTypes = ['bytes32', 'bytes', 'bytes', 'bytes'];
    const params = [
        fileRoot,
        '0x',
        '0x',
        '0x'
    ];
    const abiCoder = AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(paramTypes, params);
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
                proof: null
            });

            logger.success(`[Wallet ${walletIndex + 1}] Segment uploaded. Submitting transaction...`);

            const data = encodeTransactionData(imageData.root);

            logger.loading(`[Wallet ${walletIndex + 1}] Getting gas prices and estimating gas...`);
            const gasPrice = await getGasPrice();
            const gasEstimate = await provider.estimateGas({
                to: CONTRACT_ADDRESS,
                data,
                from: wallet.address
            });

            const gasLimit = (gasEstimate * 120n) / 100n;
            logger.success(`[Wallet ${walletIndex + 1}] Gas estimated: ${gasLimit} units. Sending transaction...`);

            const tx = await wallet.sendTransaction({
                to: CONTRACT_ADDRESS,
                data,
                gasLimit: gasLimit,
                maxFeePerGas: gasPrice.maxFeePerGas,
                maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
            });

            logger.info(`[Wallet ${walletIndex + 1}] Transaction sent! Hash: ${colors.underscore}${tx.hash}${colors.reset}`);
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
                logger.critical(`All retry attempts failed for wallet ${wallet.address}.`);
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
        logger.process('Initializing Setup');
        loadPrivateKeys();
        loadProxies();

        logger.info("Available wallets:");
        privateKeys.forEach((key, index) => {
            const wallet = new ethers.Wallet(key);
            logger.info(`  [${index + 1}] ${colors.yellow}${wallet.address}${colors.reset}`);
        });

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
                logger.process(`Starting uploads for Wallet #${walletIndex + 1} [${wallet.address}]`);

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

            logger.section('Upload Session Summary');
            logger.summary(`Total wallets processed: ${privateKeys.length}`);
            logger.summary(`Uploads per wallet requested: ${count}`);
            logger.success(`Total successful uploads: ${successful}`);
            if (failed > 0) {
                logger.critical(`Total failed uploads: ${failed}`);
            } else {
                logger.success('All uploads completed without any failures!');
            }
            logger.bye('Script finished. Thank you for using!');
            rl.close();
        });
    } catch (error) {
        // Fallback yang lebih kuat jika logger.critical masih bermasalah
        if (typeof logger === 'object' && typeof logger.critical === 'function') {
            logger.critical(`A critical error occurred in the main process: ${error.message}`);
        } else {
            // Jika logger itu sendiri tidak terdefinisi atau critical bukan fungsi,
            // langsung gunakan console.error dengan warna manual.
            console.error(`\x1b[41m\x1b[37m\x1b[1m[CRITICAL ERROR] Script encountered an unhandled error: ${error.message}\x1b[0m`);
        }
        rl.close();
    }
}

main();
