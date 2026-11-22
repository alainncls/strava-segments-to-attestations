import { defineConfig, configVariable } from 'hardhat/config';
import HardhatViem from '@nomicfoundation/hardhat-viem';
import HardhatVerify from '@nomicfoundation/hardhat-verify';

function loadOptionalEnvFile(): void {
  try {
    process.loadEnvFile();
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return;
    }

    throw error;
  }
}

loadOptionalEnvFile();

export default defineConfig({
  plugins: [HardhatViem, HardhatVerify],
  solidity: {
    compilers: [
      {
        version: '0.8.21',
        settings: {
          evmVersion: 'shanghai',
          optimizer: {
            enabled: true,
            runs: 2000,
          },
        },
      },
    ],
  },
  networks: {
    'linea-sepolia': {
      type: 'http',
      url: configVariable('INFURA_API_KEY', {
        format: 'https://linea-sepolia.infura.io/v3/{variable}',
      }),
      accounts: [configVariable('PRIVATE_KEY')],
      chainId: 59141,
    },
    linea: {
      type: 'http',
      url: configVariable('INFURA_API_KEY', {
        format: 'https://linea-mainnet.infura.io/v3/{variable}',
      }),
      accounts: [configVariable('PRIVATE_KEY')],
      chainId: 59144,
    },
  },
  paths: {
    sources: './src',
  },
  verify: {
    etherscan: {
      apiKey: configVariable('ETHERSCAN_API_KEY'),
    },
  },
});
