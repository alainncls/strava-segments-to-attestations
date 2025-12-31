/**
 * ABI for the StravaPortal contract
 * Generated from the contract interface
 */
export const STRAVA_PORTAL_ABI = [
  {
    inputs: [
      {
        components: [
          { name: 'schemaId', type: 'bytes32' },
          { name: 'expirationDate', type: 'uint64' },
          { name: 'subject', type: 'bytes' },
          { name: 'attestationData', type: 'bytes' },
        ],
        name: 'attestationPayload',
        type: 'tuple',
      },
      { name: 'validationPayloads', type: 'bytes[]' },
    ],
    name: 'attest',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'fee',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'signerAddress',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'schemaId',
    outputs: [{ name: '', type: 'bytes32' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;
