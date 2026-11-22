# Effortprint

Two tools for your Strava activities, at [strava.alainnicolas.fr](https://strava.alainnicolas.fr). Effortprint is not a Strava product.

- **Activity heatmap** (`/heatmap`): one colored cell for each day of each year, from the distance or the duration of your activities. Filters, thresholds, 22 palettes, PNG and SVG export. The activities stay in the browser (`localStorage`, 7 days at most).
- **Segment Attestations** (`/attestations`): verifiable onchain attestations for Strava segments you completed, on [Linea](https://linea.build/) with the [Verax](https://ver.ax/) attestation protocol.

## Overview

### Routes

| Path            | Page                                 |
| --------------- | ------------------------------------ |
| `/`             | Hub: the two tools and the login     |
| `/heatmap`      | Activity heatmap                     |
| `/attestations` | Segment attestation flow             |
| `/about`        | About, privacy and data              |
| `/oauth`        | Strava OAuth callback (not indexed)  |

### How an attestation works

1. **Connect Strava** - OAuth authentication to access your activities
2. **Select a segment** - Browse your recent activities and pick a completed segment
3. **Create attestation** - Backend verifies completion and signs the data with EIP-712
4. **Submit onchain** - Attestation is recorded on Linea via the Verax protocol

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

- **Node.js** 24.22.3 (pinned in `.nvmrc` and `devEngines`)
- **pnpm** 12.21.0 (pinned in `packageManager` and `devEngines`; other package managers are not supported)

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

# Build shared package and run local functions adapter
pnpm --filter @strava-attestations/shared build
pnpm --filter @strava-attestations/functions dev
```

The root `pnpm dev` runs Vite on `http://localhost:5174` and a loopback-only
Node adapter on port `8888`. The adapter invokes the same `Request`/`Response`
handlers used by Netlify Functions; it does not implement OAuth or signing
logic and is not part of production deployment. Create `packages/functions/.env`
from `.env.example` before starting the functions package directly.

Local notes:

- Set `FRONTEND_URL=http://localhost:5174` in `packages/functions/.env`. Strava always accepts `localhost` as an OAuth callback domain.
- Without `VITE_WALLETCONNECT_PROJECT_ID` and `VITE_INFURA_API_KEY`, the heatmap works and the wallet button is disabled. The wallet flow is covered by `e2e/wallet.spec.ts`.
- `pnpm test:e2e` builds with `--mode e2e` (public placeholder values in `packages/frontend/.env.e2e`) and runs Playwright on the production build, at desktop and mobile width.

### Frontend structure

| Folder | Content |
| --- | --- |
| `src/screens` | `Hub`, `Heatmap`, `Attestations`, `About`, `StravaCallback`, `NotFound` (one lazy route each) |
| `src/components` | `Layout`, `Header`, `Footer`, `Heatmap` (grid, controls, day tooltip), `ThemeSwitch`, wallet and modal components |
| `src/hooks` | `useStravaAuth` (shared session), `useHeatmapSync` (Strava sync), `useActivities` (attestation flow) |
| `src/utils` | `strava.ts` (API client), `heatmap.ts` (pure logic), `activityStore.ts` (local cache), `heatmapExport.ts`, `theme.ts` |

### Security headers

`netlify.toml` sets the Content-Security-Policy, `Strict-Transport-Security`, `Permissions-Policy` and the other headers. `vite.config.ts` sends the same policy from the preview server, and from the dev server with the local additions (inline React refresh script, HMR, functions on port 8888). `packages/functions/test/security-headers.test.ts` fails if a header is removed. A new third-party host must be added to the policy first.

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
| `VITE_ENABLE_INSIGHTS`          | Set to `true` to load getinsights.io analytics |

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

- **Frontend**: React 19, Vite 8, TypeScript, Wagmi, Reown AppKit
- **Contracts**: Solidity 0.8.21, Hardhat, OpenZeppelin 4.9.6, Verax
- **Functions**: Node.js 24, TypeScript, Netlify Functions
- **Blockchain**: Linea (Mainnet & Sepolia)
- **Attestations**: Verax Protocol

## Deployed Contracts

### Linea Mainnet

| Contract | Address |
| -------- | ------- |
| Portal | [`0xb917d893321eab9662c56f22a2f6a37344d740d9`](https://lineascan.build/address/0xb917d893321eab9662c56f22a2f6a37344d740d9) |
| Schema ID | `0xc1708360b3df59e91dfd33f901c659c0350461e6a30392d1e3218d4847e6b20d` |

### Linea Sepolia (Testnet)

| Contract | Address |
| -------- | ------- |
| Portal | [`0xcfa8846d99d27f07ccd31e09c4f166a708fabd80`](https://sepolia.lineascan.build/address/0xcfa8846d99d27f07ccd31e09c4f166a708fabd80) |
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
