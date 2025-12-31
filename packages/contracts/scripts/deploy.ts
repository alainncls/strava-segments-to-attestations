import hre, { network } from 'hardhat';
import { verifyContract } from '@nomicfoundation/hardhat-verify/verify';
import { VeraxSdk } from '@verax-attestation-registry/verax-sdk';
import { isAddress, isHex, type Address, type Hex } from 'viem';

const SCHEMA = '(uint256 segmentId, uint64 completionDate)';

function getEnvAddress(key: string): Address {
  const value = process.env[key];
  if (!value || !isAddress(value)) {
    throw new Error(`${key} is not set or is not a valid address`);
  }
  return value;
}

function getEnvHex(key: string): Hex {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not set`);
  }
  const hexValue = value.startsWith('0x') ? value : `0x${value}`;
  if (!isHex(hexValue)) {
    throw new Error(`${key} is not a valid hex string`);
  }
  return hexValue as Hex;
}

async function main(): Promise<void> {
  const connection = await network.connect();
  const viem = connection.viem;

  const walletClients = await viem.getWalletClients();
  const walletClient = walletClients[0];
  if (!walletClient) {
    throw new Error('No wallet client available');
  }

  const publicClient = await viem.getPublicClient();
  const chainId = await walletClient.getChainId();
  const isMainnet = chainId === 59144;

  console.log(`Network: ${isMainnet ? 'Linea Mainnet' : 'Linea Sepolia'} (${chainId})`);

  const privateKey = getEnvHex('PRIVATE_KEY');
  const signerAddress = getEnvAddress('SIGNER_ADDRESS');
  const routerAddress = getEnvAddress('ROUTER_ADDRESS');
  const deployerAddress = walletClient.account.address;

  const veraxSdk = new VeraxSdk(
    isMainnet ? VeraxSdk.DEFAULT_LINEA_MAINNET : VeraxSdk.DEFAULT_LINEA_SEPOLIA,
    deployerAddress,
    privateKey,
  );

  const schemaId = (await veraxSdk.schema.getIdFromSchemaString(SCHEMA)) as Hex;
  const existingSchema = await veraxSdk.schema.getSchema(schemaId);
  if (!existingSchema) {
    throw new Error(
      `Schema not found. Run 'pnpm schema:${isMainnet ? 'mainnet' : 'sepolia'}' first.`,
    );
  }

  console.log(`Schema ID: ${schemaId}`);

  const constructorArguments: [Address[], Address, Address, Hex] = [
    [],
    routerAddress,
    signerAddress,
    schemaId,
  ];

  console.log('Deploying StravaPortal...');

  const deployHash = await walletClient.deployContract({
    abi: (await hre.artifacts.readArtifact('StravaPortal')).abi,
    bytecode: (await hre.artifacts.readArtifact('StravaPortal')).bytecode as Hex,
    args: constructorArguments,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: deployHash });
  if (!receipt.contractAddress) {
    throw new Error('Contract address not found in receipt');
  }

  const stravaPortalAddress = receipt.contractAddress;
  console.log(`StravaPortal deployed: ${stravaPortalAddress}`);

  console.log('Verifying contract on Lineascan...');
  try {
    await verifyContract(
      {
        address: stravaPortalAddress,
        constructorArgs: [...constructorArguments],
      },
      hre,
    );
    console.log('Contract verified on Lineascan');
  } catch (error) {
    if (error instanceof Error && error.message.includes('Already Verified')) {
      console.log('Contract already verified');
    } else {
      console.error('Verification failed:', error);
    }
  }

  console.log('Registering portal on Verax...');
  await veraxSdk.portal.register(
    stravaPortalAddress,
    'Strava Segment Portal',
    'Attestations for completed Strava segments',
    true,
    'alain.linea.eth',
    { waitForConfirmation: true },
  );
  console.log('Portal registered on Verax');

  console.log('\n--- DEPLOYMENT COMPLETE ---');
  console.log(`Portal: ${stravaPortalAddress}`);
  console.log(`Schema: ${schemaId}`);
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exitCode = 1;
});
