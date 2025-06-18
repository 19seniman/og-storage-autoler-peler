require('dotenv').config();
const { ethers } = require('ethers');
const axios = require('axios');
const readline = require('readline');
const crypto = require('crypto');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');
const path = require('path');

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

const logger = {
  info: (msg) => console.log(`${colors.green}[✓] ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}[⚠] ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}[✗] ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}[✅] ${msg}${colors.reset}`),
  loading: (msg) => console.log(`${colors.cyan}[⟳] ${msg}${colors.reset}`),
  step: (msg) => console.log(`${colors.white}[➤] ${msg}${colors.reset}`),
  countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
  banner: () => {
    const { cyan, magenta, reset } = colors;
    console.log(magenta + '=============================================' + reset);
    console.log(cyan + '  🍉🍉PLEASE SUPPORT PALESTINE ON SOCIAL MEDIA 🍉🍉 ' + reset);
    console.log(cyan + '       19Senniman from Insider' + reset);
    console.log(magenta + '=============================================' + reset);
    console.log();
  }
};

const CHAIN_ID = 16601;
const RPC_URL = 'https://evmrpc-testnet.0g.ai';
const CONTRACT_ADDRESS = '0x5f1D96895e442FC0168FA2F9fb1EBeF93Cb5035e';
const METHOD_ID = '0xef3e12dc'; 
const PROXY_FILE = 'proxies.txt';

let privateKeys = [];
let currentKeyIndex = 0;

function loadPrivateKeys() {
  try {
    let index = 1;
    let key = process.env[`PRIVATE_KEY_${index}`];

    if (!key && index === 1 && process.env.PRIVATE_KEY) {
      key = process.env.PRIVATE_KEY;
    }
    
    while (key) {
      privateKeys.push(key);
      index++;
      key = process.env[`PRIVATE_KEY_${index}`];
    }
    
    if (privateKeys.length === 0) {
      logger.critical('No private keys found in .env file');
      process.exit(1);
    }
    
    logger.success(`Loaded ${privateKeys.length} private key(s) from .env file`);
  } catch (error) {
    logger.critical(`Failed to load private keys: ${error.message}`);
    process.exit(1);
  }
}

function getNextPrivateKey() {
  const key = privateKeys[currentKeyIndex];
  return key;
}

function rotatePrivateKey() {
  currentKeyIndex = (currentKeyIndex + 1) % privateKeys.length;
  return privateKeys[currentKeyIndex];
}

function getRandomUserAgent() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36',
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.119 Mobile Safari/537.36'
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
        logger.warn(`No proxies found in ${PROXY_FILE}, will proceed without proxies`);
      }
    } else {
      logger.warn(`Proxy file ${PROXY_FILE} not found, will proceed without proxies`);
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

// Add gas management functions
async function getGasPrice() {
  try {
    const feeData = await provider.getFeeData();
    // Add 10% buffer to maxFeePerGas
    const maxFeePerGas = (feeData.maxFeePerGas * ethers.toBigInt(110)) / ethers.toBigInt(100);
    const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
    
    return {
      maxFeePerGas,
      maxPriorityFeePerGas
    };
  } catch (error) {
    logger.error(`Error getting gas price: ${error.message}`);
    // Fallback values if getFeeData fails
    return {
      maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("0.1", "gwei")
    };
  }
}

async function getNonce(walletAddress) {
  try {
    return await provider.getTransactionCount(walletAddress);
  } catch (error) {
    logger.error(`Error getting nonce: ${error.message}`);
    throw error;
  }
}

function initializeWallet() {
  const privateKey = getNextPrivateKey();
  return new ethers.Wallet(privateKey, provider);
}

async function fetchRandomImage() {
  try {
    logger.loading('Fetching random image...');
    const axiosInstance = createAxiosInstance();
    
    const response = await axiosInstance.get('https://picsum.photos/800/600', {
      responseType: 'arraybuffer',
      maxRedirects: 5
    });
    logger.success('Random image fetched successfully');
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
  
  return {
    root: hash,
    data: imageBase64
  };
}

function encodeTransactionData(fileRoot, params) {
  // Method ID for the storage function
  const methodId = '0xef3e12dc';
  
  // Encode the parameters according to the contract's expected format
  const encodedData = ethers.concat([
    // Method ID
    Buffer.from(methodId.slice(2), 'hex'),
    // Offset to dynamic data (0x20)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000020', 'hex'),
    // File root hash (0x10edb)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000010edb', 'hex'),
    // Offset to first dynamic parameter (0x60)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000060', 'hex'),
    // Offset to second dynamic parameter (0x80)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000080', 'hex'),
    // Empty bytes (0x00)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
    // Length of first dynamic parameter (0x02)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000002', 'hex'),
    // First dynamic parameter (2 bytes)
    Buffer.from('fa9381beedc9e3d4dad42cdd4f7d99654d5523d041e9e4de80522864afcb3fea', 'hex'),
    // Length of second dynamic parameter (0x08)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000008', 'hex'),
    // Second dynamic parameter (8 bytes)
    Buffer.from('144d825724ff32012948080aa38e4427d35dfbf3ff3d946557ea9ffa8e74193c', 'hex'),
    // Length of third dynamic parameter (0x05)
    Buffer.from('0000000000000000000000000000000000000000000000000000000000000005', 'hex')
  ]);

  return encodedData;
}

function generateContractParams() {
  // Use fixed values that match the example transaction
  return {
    randomValue1: '0xfa9381beedc9e3d4dad42cdd4f7d99654d5523d041e9e4de80522864afcb3fea',
    randomValue2: '0x144d825724ff32012948080aa38e4427d35dfbf3ff3d946557ea9ffa8e74193c'
  };
}

async function uploadToStorage(imageData, wallet, walletIndex) {
  const MAX_RETRIES = 3;
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      logger.loading(`Uploading file segment to indexer using wallet #${walletIndex + 1} [${wallet.address}]...`);
      const axiosInstance = createAxiosInstance();

      await axiosInstance.post('https://indexer-storage-testnet-turbo.0g.ai/file/segment', {
        root: imageData.root,
        index: 0,
        data: imageData.data,
        proof: {
          siblings: [imageData.root],
          path: []
        }
      });
      
      logger.success('Segment uploaded, submitting transaction to blockchain...');

      const params = generateContractParams();
      const data = encodeTransactionData(imageData.root, params);

      logger.loading('Getting current gas prices...');
      const gasPrice = await getGasPrice();

      logger.loading('Estimating gas for transaction...');
      const gasEstimate = await provider.estimateGas({
        to: CONTRACT_ADDRESS,
        data,
        from: wallet.address
      });
      
      const gasLimit = (gasEstimate * ethers.toBigInt(12)) / ethers.toBigInt(10);
      logger.success(`Gas estimation successful (${gasEstimate} units), sending transaction...`);

      // Get the current nonce from the network
      const nonce = await provider.getTransactionCount(wallet.address);
      
      // Send transaction with automatic nonce handling
      const tx = await wallet.sendTransaction({
        to: CONTRACT_ADDRESS,
        data,
        nonce: nonce,
        gasLimit: gasLimit,
        maxFeePerGas: gasPrice.maxFeePerGas,
        maxPriorityFeePerGas: gasPrice.maxPriorityFeePerGas
      });
      
      logger.info(`Transaction sent! Hash: ${tx.hash}`);

      logger.loading('Waiting for transaction confirmation...');
      const receipt = await tx.wait();
      logger.success(`Transaction confirmed in block ${receipt.blockNumber}`);
      logger.success(`File uploaded with root hash: ${imageData.root}`);
      
      return receipt;
    } catch (error) {
      retryCount++;
      logger.error(`Attempt ${retryCount}/${MAX_RETRIES} failed: ${error.message}`);
      
      if (error.code === 'NONCE_EXPIRED' || error.code === 'REPLACEMENT_UNDERPRICED') {
        // If nonce error, wait a bit and try again
        await new Promise(resolve => setTimeout(resolve, 2000));
        continue;
      }
      
      if (retryCount === MAX_RETRIES) {
        logger.error(`Error during upload with wallet #${walletIndex + 1} after ${MAX_RETRIES} attempts: ${error.message}`);
        if (error.response) {
          logger.debug(`Response data: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 3000));
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
    
    rl.question('How many files to upload per wallet? ', async (count) => {
      count = parseInt(count);
      
      if (isNaN(count) || count <= 0) {
        logger.error('Please enter a valid number greater than 0.');
        rl.close();
        return;
      }
      
      const totalUploads = count * privateKeys.length;
      logger.info(`Starting upload process for ${count} files per wallet (${totalUploads} total uploads)`);

      const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
      
      const results = [];
      let successful = 0;
      let failed = 0;

      for (let walletIndex = 0; walletIndex < privateKeys.length; walletIndex++) {
        currentKeyIndex = walletIndex;
        const wallet = initializeWallet();
        
        logger.info(`${colors.bold}Starting uploads with wallet #${walletIndex + 1} [${wallet.address}]${colors.reset}`);

        for (let i = 1; i <= count; i++) {
          const uploadNumber = (walletIndex * count) + i;
          const totalCount = privateKeys.length * count;
          
          logger.step(`Processing upload ${uploadNumber} of ${totalCount} (Wallet #${walletIndex + 1}, Upload #${i})`);
          
          try {
            const imageBuffer = await fetchRandomImage();

            const imageData = await prepareImageData(imageBuffer);

            const receipt = await uploadToStorage(imageData, wallet, walletIndex);

            const result = {
              walletIndex: walletIndex + 1,
              walletAddress: wallet.address,
              uploadIndex: i,
              globalIndex: uploadNumber,
              timestamp: new Date().toISOString(),
              hash: receipt.hash,
              blockNumber: receipt.blockNumber,
              fileHash: imageData.root,
              status: 'success'
            };
            results.push(result);
            saveTransactionResult(result);
            
            successful++;
            logger.success(`Upload #${uploadNumber} completed successfully!`);

            if (uploadNumber < totalCount) {
              logger.loading('Waiting before next upload...');
              await delay(3000);
            }
          } catch (error) {
            failed++;
            const result = {
              walletIndex: walletIndex + 1,
              walletAddress: wallet.address,
              uploadIndex: i,
              globalIndex: uploadNumber,
              timestamp: new Date().toISOString(),
              error: error.message,
              status: 'failed'
            };
            results.push(result);
            saveTransactionResult(result);
            
            logger.error(`Upload #${uploadNumber} failed: ${error.message}`);
            await delay(5000); 
          }
        }

        if (walletIndex < privateKeys.length - 1) {
          logger.loading(`Waiting before switching to next wallet...`);
          await delay(10000); 
        }
      }
      
      console.log();
      logger.info('Upload session summary:');
      logger.info(`Total wallets used: ${privateKeys.length}`);
      logger.info(`Uploads per wallet: ${count}`);
      logger.info(`Total uploads attempted: ${totalUploads}`);
      logger.success(`Successful uploads: ${successful}`);
      if (failed > 0) {
        logger.error(`Failed uploads: ${failed}`);
      }
      logger.success('All operations completed!');
      rl.close();
    });
  } catch (error) {
    logger.critical(`Error in main process: ${error.message}`);
    rl.close();
  }
}

main();
