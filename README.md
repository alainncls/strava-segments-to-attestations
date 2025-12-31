# Strava Segment Attestations

Create verifiable onchain attestations for Strava segments you've completed.

Built on [Linea](https://linea.build/) using the [Verax](https://ver.ax/) attestation protocol.

## Overview

This application allows athletes to create cryptographically verifiable proofs of their Strava segment completions. Unlike traditional NFTs, attestations are lightweight, standardized proofs that can be easily verified by other applications.

### How it works

1. **Connect Strava** – OAuth authentication to access your activities
2. **Select a segment** – Browse your recent activities and pick a completed segment
3. **Create attestation** – Backend verifies completion and signs the data with EIP-712
4. **Submit onchain** – Attestation is recorded on Linea via the Verax protocol

## Project Structure

```
├── packages/
│   ├── contracts/      # Solidity smart contracts (StravaPortal)
│   ├── frontend/       # React/Vite web application
│   └── functions/      # Netlify Functions (OAuth, signing)
├── netlify.toml        # Netlify deployment configuration
├── pnpm-workspace.yaml # pnpm workspace configuration
└── package.json        # Root package with shared scripts
```

## Prerequisites

- **Node.js** 22.21.1 or higher
- **pnpm** 10.6.2 or higher (other package managers are not supported)

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/alainncls/strava-segments-to-attestations.git
cd strava-segments-to-attestations
pnpm install
```

### 2. Configure environment variables

Copy the example files and fill in your credentials:

```bash
# Frontend
cp packages/frontend/.env.example packages/frontend/.env.local

# Functions
cp packages/functions/.env.example packages/functions/.env

# Contracts (for deployment)
cp packages/contracts/.env.example packages/contracts/.env
```

### 3. Run the development server

```bash
pnpm dev
```

## Packages

### `@strava-attestations/contracts`

Solidity smart contracts for the Verax Portal and Schema.

```bash
cd packages/contracts

# Compile contracts
pnpm compile

# Run tests
pnpm test

# Create & register Schema on Linea Sepolia
pnpm schema:sepolia

# Create & register Schema on Linea Mainnet
pnpm schema:mainnet

# Deploy & register Portal on Linea Sepolia
pnpm deploy:sepolia

# Deploy & register Portal on Linea Mainnet
pnpm deploy:mainnet
```

### `@strava-attestations/frontend`

React/Vite web application.

```bash
cd packages/frontend

# Development server
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test
```

### `@strava-attestations/functions`

Netlify Functions for OAuth and attestation signing.

```bash
cd packages/functions

# Build
pnpm build

# Local development (with Netlify CLI)
netlify dev
```

## Environment Variables

### Frontend (`packages/frontend/.env.local`)

| Variable                        | Description                          |
| ------------------------------- | ------------------------------------ |
| `VITE_STRAVA_CLIENT_ID`         | Strava API application client ID     |
| `VITE_STRAVA_REDIRECT_URL`      | OAuth callback URL                   |
| `VITE_API_URL`                  | Netlify Functions base URL           |
| `VITE_WALLETCONNECT_PROJECT_ID` | WalletConnect Cloud project ID       |
| `VITE_INFURA_API_KEY`           | Infura API key for RPC access        |
| `VITE_INSIGHTS_ID`              | [getinsights.io](https://getinsights.io/) project ID (optional) |

### Functions (`packages/functions/.env`)

| Variable               | Description                               |
| ---------------------- | ----------------------------------------- |
| `STRAVA_CLIENT_ID`     | Strava API application client ID          |
| `STRAVA_CLIENT_SECRET` | Strava API application client secret      |
| `FRONTEND_URL`         | Frontend URL for CORS                     |
| `SIGNER_PRIVATE_KEY`   | Private key for signing attestations      |

### Contracts (`packages/contracts/.env`)

| Variable           | Description                              |
| ------------------ | ---------------------------------------- |
| `PRIVATE_KEY`      | Private key for deployment               |
| `INFURA_API_KEY`   | Infura API key for RPC access            |
| `ETHERSCAN_API_KEY`| Etherscan API key for verification       |
| `SIGNER_ADDRESS`   | Signer address for attestations          |
| `ROUTER_ADDRESS`   | Verax Router address (per network)       |

## Scripts

From the root directory:

```bash
# Install all dependencies
pnpm install

# Run frontend development server
pnpm dev

# Build all packages
pnpm build

# Run all tests
pnpm test

# Lint all packages
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format all files
pnpm format

# Check formatting
pnpm format:check

# Clean all packages
pnpm clean
```

## Deployment

### Contract Deployment

1. Configure environment variables in `packages/contracts/.env`

2. Create and register the Schema:
   ```bash
   cd packages/contracts
   pnpm schema:sepolia
   ```
   This will output the Schema ID to use in the next step.

3. Update `.env` with the Schema ID, then deploy the Portal:
   ```bash
   pnpm deploy:sepolia
   ```

4. The deploy script will:
   - Deploy the StravaPortal contract
   - Verify it on Lineascan
   - Register it on Verax Portal Registry

5. Update the portal and schema addresses in:
   - `packages/frontend/src/utils/constants.ts`
   - `packages/functions/lib/constants.ts`

### Frontend & Functions Deployment

The project is configured for Netlify deployment:

1. Connect your GitHub repo to Netlify
2. Configure environment variables in Netlify dashboard
3. Deploy! Netlify will automatically build and deploy on push.

## Technology Stack

- **Frontend**: React 19, Vite 6, TypeScript, Wagmi, Web3Modal
- **Contracts**: Solidity 0.8.21, Hardhat, OpenZeppelin 4.9.6, Verax
- **Functions**: Node.js 22, TypeScript, Netlify Functions
- **Blockchain**: Linea (Mainnet & Sepolia)
- **Attestations**: Verax Protocol

## Deployed Contracts

### Linea Mainnet

| Contract | Address |
| -------- | ------- |
| Portal | [`0xe1301b12c2dbe0be67187432fb2519801439f552`](https://lineascan.build/address/0xe1301b12c2dbe0be67187432fb2519801439f552) |
| Schema ID | `0xc1708360b3df59e91dfd33f901c659c0350461e6a30392d1e3218d4847e6b20d` |

### Linea Sepolia (Testnet)

| Contract | Address |
| -------- | ------- |
| Portal | [`0xc04228f66b1aa75a2a8f6887730f55b54281e9d9`](https://sepolia.lineascan.build/address/0xc04228f66b1aa75a2a8f6887730f55b54281e9d9) |
| Schema ID | `0xc1708360b3df59e91dfd33f901c659c0350461e6a30392d1e3218d4847e6b20d` |

## Attestation Schema

Schema: `(uint256 segmentId, uint64 completionDate)`

| Field            | Type      | Description                    |
| ---------------- | --------- | ------------------------------ |
| `segmentId`      | `uint256` | Strava segment ID              |
| `completionDate` | `uint64`  | Unix timestamp of completion   |

## Strava API Guidelines

This application is "Powered by Strava" and complies with the [Strava API Brand Guidelines](https://developers.strava.com/guidelines/):

- Uses official "Connect with Strava" button
- Displays "Powered by Strava" attribution
- Does not imply official sponsorship or endorsement by Strava

## License

MIT

## Author

Built by [alain.linea.eth](https://alainnicolas.com)
