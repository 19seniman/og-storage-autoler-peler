# 0G Storage Auto Bot

Automated bot for interacting with the 0G Storage Network to help maximize airdrop potential.

##  🍉 Donate for  watermelon

**EVM Address**  
``0xf01fb9a6855f175d3f3e28e00fa617009c38ef59``

**via Dana**  
``085830000502``

## Features

- **Multi-Wallet Support**: Run tasks across multiple private keys sequentially
- **Proxy Integration**: Use rotating proxies to prevent rate limiting
- **User-Agent Rotation**: Automatic rotating of user agents for each request
- **Detailed Statistics**: Track successful and failed operations
- **Transaction History**: Save all transaction details for future reference

## Installation

```
git clone https://github.com/19seniman/og-storage-autoler-peler.git
```
```
cd og-storage-autoler-peler
```
```
npm install
```
```
nano .env
```
format on nano .env:

PRIVATE_KEY=fill yout pvkey
save : ctrl x y enter

(Optional) Create a `proxies.txt` file with one proxy per line:

```
http://username:password@ip:port
http://ip:port
socks5://username:password@ip:port
```

## Usage

Run the script

```bash
node main.js
```

When prompted, enter the number of files you want to upload per wallet.

## How It Works

1. The bot loads your private keys and proxies
2. For each wallet:
   - It fetches random images
   - Calculates hash and prepares data
   - Uploads the file segments to the 0G indexer
   - Submits a blockchain transaction to register the upload
   - Waits for confirmation before proceeding to the next upload
3. Results are saved to the `results` directory

## Troubleshooting

- **Gas Errors**: Make sure your wallets have sufficient 0G testnet tokens
- **Network Issues**: Check your internet connection or try using proxies
- **RPC Errors**: The testnet RPC might be under load, try again later

## Disclaimer

This tool is for educational and testnet participation purposes only. Using this bot does not guarantee eligibility for any future airdrops. Always use testnet tools responsibly.

## License

MIT

