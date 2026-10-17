import type { Address, Hex } from 'viem';
import { linea, lineaSepolia } from 'viem/chains';

// Portal addresses
export const PORTAL_ID_SEPOLIA: Address = '0xcfa8846d99d27f07ccd31e09c4f166a708fabd80';
export const PORTAL_ID_MAINNET: Address = '0xb917d893321eab9662c56f22a2f6a37344d740d9';

// Schema ID - (uint256 segmentId, uint64 completionDate)
export const SCHEMA_ID: Hex = '0xc1708360b3df59e91dfd33f901c659c0350461e6a30392d1e3218d4847e6b20d';

// Chain exports
export { linea, lineaSepolia };

// Attestation fee (in wei) - 0.0001 ETH
export const ATTESTATION_FEE = BigInt('100000000000000');

// Strava API
export const STRAVA_API_BASE = 'https://www.strava.com/api/v3';
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
export const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
