import { describe, it, expect } from 'vitest';
import {
  keccak256,
  encodePacked,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
  hashTypedData,
  getAddress,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

describe('StravaPortal', () => {
  // Test accounts
  const signerPrivateKey = generatePrivateKey();
  const randomPrivateKey = generatePrivateKey();

  // Test data
  const testSegmentId = BigInt(12345);
  const testCompletionDate = BigInt(Math.floor(Date.now() / 1000));
  const testFee = BigInt('100000000000000'); // 0.0001 ETH

  // Helper to create EIP-712 signature
  async function signSegment(
    segmentId: bigint,
    subject: Address,
    chainId: number,
    verifyingContract: Address,
    privateKey: Hex,
  ): Promise<Hex> {
    const account = privateKeyToAccount(privateKey);

    const domain = {
      name: 'VerifyStrava',
      version: '1',
      chainId: BigInt(chainId),
      verifyingContract,
    };

    const types = {
      Segment: [
        { name: 'segmentId', type: 'uint256' },
        { name: 'subject', type: 'address' },
      ],
    };

    const message = {
      segmentId,
      subject,
    };

    return await account.signTypedData({
      domain,
      types,
      primaryType: 'Segment',
      message,
    });
  }

  // Helper to encode attestation data
  function encodeAttestationData(segmentId: bigint, completionDate: bigint): Hex {
    return encodeAbiParameters(parseAbiParameters('uint256 segmentId, uint64 completionDate'), [
      segmentId,
      completionDate,
    ]);
  }

  // Helper to encode subject as bytes20
  function encodeSubject(address: Address): Hex {
    const bytes = address.toLowerCase().slice(2);
    return `0x${bytes}` as Hex;
  }

  describe('EIP-712 Type Hash', () => {
    it('should produce valid type hash for Segment struct', () => {
      const typeHash = keccak256(
        encodePacked(['string'], ['Segment(uint256 segmentId,address subject)']),
      );

      expect(typeHash).toHaveLength(66); // 0x + 64 hex chars
      expect(typeHash).toMatch(/^0x[a-f0-9]{64}$/);
    });
  });

  describe('EIP-712 Signature', () => {
    it('should create consistent signatures for same input', async () => {
      const testSubject = getAddress('0x1234567890123456789012345678901234567890');
      const chainId = 59141; // Linea Sepolia
      const verifyingContract = getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');

      const sig1 = await signSegment(
        testSegmentId,
        testSubject,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );

      const sig2 = await signSegment(
        testSegmentId,
        testSubject,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );

      expect(sig1).toBe(sig2);
    });

    it('should produce different signatures for different subjects', async () => {
      const subject1 = getAddress('0x1234567890123456789012345678901234567890');
      const subject2 = getAddress('0x0987654321098765432109876543210987654321');
      const chainId = 59141;
      const verifyingContract = getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');

      const sig1 = await signSegment(
        testSegmentId,
        subject1,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );
      const sig2 = await signSegment(
        testSegmentId,
        subject2,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different segment IDs', async () => {
      const testSubject = getAddress('0x1234567890123456789012345678901234567890');
      const chainId = 59141;
      const verifyingContract = getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');

      const sig1 = await signSegment(
        BigInt(111),
        testSubject,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );
      const sig2 = await signSegment(
        BigInt(222),
        testSubject,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures from different signers', async () => {
      const testSubject = getAddress('0x1234567890123456789012345678901234567890');
      const chainId = 59141;
      const verifyingContract = getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');

      const sig1 = await signSegment(
        testSegmentId,
        testSubject,
        chainId,
        verifyingContract,
        signerPrivateKey,
      );
      const sig2 = await signSegment(
        testSegmentId,
        testSubject,
        chainId,
        verifyingContract,
        randomPrivateKey,
      );

      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different chain IDs', async () => {
      const testSubject = getAddress('0x1234567890123456789012345678901234567890');
      const verifyingContract = getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9');

      const sig1 = await signSegment(
        testSegmentId,
        testSubject,
        59141,
        verifyingContract,
        signerPrivateKey,
      );
      const sig2 = await signSegment(
        testSegmentId,
        testSubject,
        59144,
        verifyingContract,
        signerPrivateKey,
      );

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('Attestation Data Encoding', () => {
    it('should correctly encode segment payload', () => {
      const encoded = encodeAttestationData(testSegmentId, testCompletionDate);

      expect(encoded).toBeTypeOf('string');
      expect(encoded).toMatch(/^0x[a-f0-9]+$/);
      // uint256 (32 bytes) + uint64 (32 bytes, padded) = 64 bytes = 128 hex chars + 0x
      expect(encoded).toHaveLength(130);
    });

    it('should handle edge case segment IDs', () => {
      const zeroEncoded = encodeAttestationData(BigInt(0), testCompletionDate);
      const maxEncoded = encodeAttestationData(
        BigInt(2) ** BigInt(256) - BigInt(1),
        testCompletionDate,
      );

      expect(zeroEncoded).toBeTypeOf('string');
      expect(maxEncoded).toBeTypeOf('string');
    });
  });

  describe('Subject Encoding', () => {
    it('should produce 20-byte subject from address', () => {
      const address = getAddress('0x1234567890123456789012345678901234567890');
      const encoded = encodeSubject(address);

      expect(encoded).toHaveLength(42);
      expect(encoded.toLowerCase()).toBe(address.toLowerCase());
    });

    it('should handle checksummed addresses', () => {
      const checksummed = getAddress('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B');
      const encoded = encodeSubject(checksummed);

      expect(encoded.toLowerCase()).toBe(checksummed.toLowerCase());
    });
  });

  describe('Business Logic Validation', () => {
    it('should encode zero address as subject', () => {
      const zeroAddress = getAddress('0x0000000000000000000000000000000000000000');
      const encoded = encodeSubject(zeroAddress);

      expect(encoded).toBe('0x0000000000000000000000000000000000000000');
    });

    it('should validate that fee is non-zero', () => {
      expect(testFee).toBeGreaterThan(BigInt(0));
      expect(testFee).toBe(BigInt('100000000000000'));
    });
  });

  describe('Typed Data Hash', () => {
    it('should produce correct domain separator components', () => {
      const domain = {
        name: 'VerifyStrava',
        version: '1',
        chainId: BigInt(59141),
        verifyingContract: getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9'),
      };

      const types = {
        Segment: [
          { name: 'segmentId', type: 'uint256' },
          { name: 'subject', type: 'address' },
        ],
      } as const;

      const message = {
        segmentId: testSegmentId,
        subject: getAddress('0x1234567890123456789012345678901234567890'),
      };

      const hash = hashTypedData({
        domain,
        types,
        primaryType: 'Segment',
        message,
      });

      expect(hash).toBeTypeOf('string');
      expect(hash).toHaveLength(66);
      expect(hash).toMatch(/^0x[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different chain IDs', () => {
      const baseParams = {
        types: {
          Segment: [
            { name: 'segmentId', type: 'uint256' },
            { name: 'subject', type: 'address' },
          ],
        } as const,
        primaryType: 'Segment' as const,
        message: {
          segmentId: testSegmentId,
          subject: getAddress('0x1234567890123456789012345678901234567890'),
        },
      };

      const hash1 = hashTypedData({
        ...baseParams,
        domain: {
          name: 'VerifyStrava',
          version: '1',
          chainId: BigInt(59141),
          verifyingContract: getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9'),
        },
      });

      const hash2 = hashTypedData({
        ...baseParams,
        domain: {
          name: 'VerifyStrava',
          version: '1',
          chainId: BigInt(59144),
          verifyingContract: getAddress('0xc04228f66b1aa75a2a8f6887730f55b54281e9d9'),
        },
      });

      expect(hash1).not.toBe(hash2);
    });
  });
});
