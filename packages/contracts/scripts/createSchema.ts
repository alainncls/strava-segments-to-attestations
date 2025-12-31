import hre from 'hardhat';
import { VeraxSdk } from '@verax-attestation-registry/verax-sdk';
import { isHex, type Address } from 'viem';

const SCHEMA = '(uint256 segmentId, uint64 completionDate)';
const SCHEMA_NAME = 'Strava Segment Completion';
const SCHEMA_DESCRIPTION =
  'Attestation for completing a Strava segment. Contains the segment ID and completion timestamp.';
const SCHEMA_CONTEXT = 'https://github.com/alainncls/strava-segments-to-attestations';

function getEnvHex(key: string): `0x${string}` {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not set`);
  }
  const hexValue = value.startsWith('0x') ? value : `0x${value}`;
  if (!isHex(hexValue)) {
    throw new Error(`${key} is not a valid hex string`);
  }
  return hexValue as `0x${string}`;
}

async function main(): Promise<void> {
  const { viem } = await hre.network.connect();

  const walletClients = await viem.getWalletClients();
  const walletClient = walletClients[0];
  if (!walletClient) {
    throw new Error('No wallet client available');
  }

  const chainId = await walletClient.getChainId();
  const isMainnet = chainId === 59144;

  console.log(`Network: ${isMainnet ? 'Linea Mainnet' : 'Linea Sepolia'} (${chainId})`);

  const privateKey = getEnvHex('PRIVATE_KEY');
  const signerAddress = walletClient.account.address;

  const veraxSdk = new VeraxSdk(
    isMainnet ? VeraxSdk.DEFAULT_LINEA_MAINNET : VeraxSdk.DEFAULT_LINEA_SEPOLIA,
    signerAddress,
    privateKey,
  );

  const schemaId = (await veraxSdk.schema.getIdFromSchemaString(SCHEMA)) as Address;
  console.log(`Schema ID: ${schemaId}`);

  const isRegistered = await veraxSdk.schema.isRegistered(schemaId);
  if (isRegistered) {
    console.log('Schema already exists');
    return;
  }

  console.log('Creating schema...');
  const receipt = await veraxSdk.schema.create(
    SCHEMA_NAME,
    SCHEMA_DESCRIPTION,
    SCHEMA_CONTEXT,
    SCHEMA,
    { waitForConfirmation: true },
  );

  console.log(`Schema created: ${receipt.transactionHash}`);
  console.log(`\nDeploy portal: pnpm deploy:${isMainnet ? 'mainnet' : 'sepolia'}`);
}

main().catch((error) => {
  console.error('Schema creation failed:', error);
  process.exitCode = 1;
});
