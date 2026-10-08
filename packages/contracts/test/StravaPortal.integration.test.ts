import { describe, it, expect, beforeAll } from 'vitest';
import hre from 'hardhat';
import {
  type Address,
  type Account,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  getAddress,
  parseEther,
  encodeAbiParameters,
  parseAbiParameters,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';

/**
 * Integration tests for StravaPortal contract
 * These tests deploy the actual contract with mock dependencies
 */
describe('StravaPortal Integration', () => {
  // Test accounts
  const signerPrivateKey = generatePrivateKey();
  const signerAccount = privateKeyToAccount(signerPrivateKey);
  const signerAddress = signerAccount.address;

  // Test data
  const testSchemaId = '0xc1708360b3df59e91dfd33f901c659c0350461e6a30392d1e3218d4847e6b20d' as Hex;
  const testSegmentId = BigInt(12345);
  const testCompletionDate = BigInt(Math.floor(Date.now() / 1000));
  const testDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const testFee = parseEther('0.0001');

  // Contract instances (initialized in beforeAll)
  let mockRouter: Address;
  let mockPortalRegistry: Address;
  let portal: Address;
  let portalHarness: Address;
  let publicClient: PublicClient<Transport, Chain>;
  let networkProvider: Awaited<ReturnType<typeof hre.network.connect>>['provider'];
  let walletClient: WalletClient<Transport, Chain, Account>;
  let userWalletClient: WalletClient<Transport, Chain, Account>;
  let owner: Address;
  let user: Address;
  let chainId: number;

  // Helper to sign a segment
  async function signSegment(
    segmentId: bigint,
    completionDate: bigint,
    subject: Address,
    deadline: bigint = testDeadline,
    domainOverrides: { chainId?: number; verifyingContract?: Address } = {},
  ): Promise<Hex> {
    const domain = {
      name: 'VerifyStrava',
      version: '1',
      chainId: BigInt(domainOverrides.chainId ?? chainId),
      verifyingContract: domainOverrides.verifyingContract ?? portalHarness,
    };

    const types = {
      Segment: [
        { name: 'segmentId', type: 'uint256' },
        { name: 'completionDate', type: 'uint64' },
        { name: 'subject', type: 'address' },
        { name: 'deadline', type: 'uint64' },
      ],
    };

    const message = {
      segmentId,
      completionDate,
      subject,
      deadline,
    };

    return await signerAccount.signTypedData({
      domain,
      types,
      primaryType: 'Segment',
      message,
    });
  }

  // Helper to encode subject as bytes20
  function encodeSubject(address: Address): Hex {
    const bytes = address.toLowerCase().slice(2);
    return `0x${bytes}` as Hex;
  }

  // Helper to encode attestation data
  function encodeAttestationData(segmentId: bigint, completionDate: bigint): Hex {
    return encodeAbiParameters(parseAbiParameters('uint256 segmentId, uint64 completionDate'), [
      segmentId,
      completionDate,
    ]);
  }

  // Helper to encode validation payload
  function encodeValidationPayload(signature: Hex, deadline: bigint = testDeadline): Hex {
    return encodeAbiParameters(parseAbiParameters('bytes signature, uint64 deadline'), [
      signature,
      deadline,
    ]);
  }

  beforeAll(async () => {
    const connection = await hre.network.connect();
    const viem = connection.viem;
    networkProvider = connection.provider;

    publicClient = await viem.getPublicClient();
    const walletClients = await viem.getWalletClients();
    const primaryWallet = walletClients[0];
    if (!primaryWallet) {
      throw new Error('No wallet client available from Hardhat viem');
    }
    walletClient = primaryWallet;
    owner = walletClient.account.address;
    chainId = await publicClient.getChainId();

    userWalletClient = walletClients[1] ?? primaryWallet;
    user = userWalletClient.account.address;

    // Deploy MockRouter
    const mockRouterArtifact = await hre.artifacts.readArtifact('MockRouter');
    const mockRouterHash = await walletClient.deployContract({
      abi: mockRouterArtifact.abi,
      bytecode: mockRouterArtifact.bytecode as Hex,
      args: [],
    });
    const mockRouterReceipt = await publicClient.waitForTransactionReceipt({
      hash: mockRouterHash,
    });
    mockRouter = mockRouterReceipt.contractAddress!;

    // Get the portal registry address from the router
    mockPortalRegistry = (await publicClient.readContract({
      address: mockRouter,
      abi: mockRouterArtifact.abi,
      functionName: 'getPortalRegistry',
    })) as Address;

    // Deploy StravaPortalHarness
    const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
    const harnessHash = await walletClient.deployContract({
      abi: harnessArtifact.abi,
      bytecode: harnessArtifact.bytecode as Hex,
      args: [[], mockRouter, signerAddress, testSchemaId],
    });
    const harnessReceipt = await publicClient.waitForTransactionReceipt({ hash: harnessHash });
    portalHarness = harnessReceipt.contractAddress!;

    // Deploy StravaPortal (regular version for admin tests)
    const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
    const portalHash = await walletClient.deployContract({
      abi: portalArtifact.abi,
      bytecode: portalArtifact.bytecode as Hex,
      args: [[], mockRouter, signerAddress, testSchemaId],
    });
    const portalReceipt = await publicClient.waitForTransactionReceipt({ hash: portalHash });
    portal = portalReceipt.contractAddress!;

    // Register portals in the mock registry
    const mockPortalRegistryArtifact = await hre.artifacts.readArtifact('MockPortalRegistry');
    await walletClient.writeContract({
      address: mockPortalRegistry,
      abi: mockPortalRegistryArtifact.abi,
      functionName: 'setPortal',
      args: [portalHarness, owner],
    });
    await walletClient.writeContract({
      address: mockPortalRegistry,
      abi: mockPortalRegistryArtifact.abi,
      functionName: 'setPortal',
      args: [portal, owner],
    });
  });

  describe('Deployment', () => {
    it('should deploy with correct initial values', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');

      const fee = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'fee',
      });

      const storedSignerAddress = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'signerAddress',
      });

      const storedSchemaId = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'schemaId',
      });

      const mockPortalRegistryArtifact = await hre.artifacts.readArtifact('MockPortalRegistry');
      const portalOwner = await publicClient.readContract({
        address: mockPortalRegistry,
        abi: mockPortalRegistryArtifact.abi,
        functionName: 'getPortalOwner',
        args: [portal],
      });

      expect(fee).toBe(testFee);
      expect(getAddress(storedSignerAddress as string)).toBe(getAddress(signerAddress));
      expect(storedSchemaId).toBe(testSchemaId);
      expect(getAddress(portalOwner as string)).toBe(getAddress(owner));
    });
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const signature = await signSegment(testSegmentId, testCompletionDate, user);

      const isValid = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_verifySignature',
        args: [signature, testSegmentId, testCompletionDate, user, testDeadline],
      });

      expect(isValid).toBe(true);
    });

    it('should reject signature with wrong segment ID', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const signature = await signSegment(testSegmentId, testCompletionDate, user);
      const wrongSegmentId = BigInt(99999);

      const isValid = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_verifySignature',
        args: [signature, wrongSegmentId, testCompletionDate, user, testDeadline],
      });

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong completion date', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const signature = await signSegment(testSegmentId, testCompletionDate, user);

      const isValid = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_verifySignature',
        args: [signature, testSegmentId, testCompletionDate + 1n, user, testDeadline],
      });

      expect(isValid).toBe(false);
    });

    it('should reject signature with wrong subject', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const signature = await signSegment(testSegmentId, testCompletionDate, user);
      const wrongSubject = getAddress('0x0000000000000000000000000000000000000001');

      const isValid = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_verifySignature',
        args: [signature, testSegmentId, testCompletionDate, wrongSubject, testDeadline],
      });

      expect(isValid).toBe(false);
    });

    it('should reject signature from wrong signer', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const wrongSignerKey = generatePrivateKey();
      const wrongSigner = privateKeyToAccount(wrongSignerKey);

      const domain = {
        name: 'VerifyStrava',
        version: '1',
        chainId: BigInt(chainId),
        verifyingContract: portalHarness,
      };

      const types = {
        Segment: [
          { name: 'segmentId', type: 'uint256' },
          { name: 'completionDate', type: 'uint64' },
          { name: 'subject', type: 'address' },
          { name: 'deadline', type: 'uint64' },
        ],
      };

      const wrongSignature = await wrongSigner.signTypedData({
        domain,
        types,
        primaryType: 'Segment',
        message: {
          segmentId: testSegmentId,
          completionDate: testCompletionDate,
          subject: user,
          deadline: testDeadline,
        },
      });

      const isValid = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_verifySignature',
        args: [wrongSignature, testSegmentId, testCompletionDate, user, testDeadline],
      });

      expect(isValid).toBe(false);
    });
  });

  describe('Attestation Verification', () => {
    it('should reject an attestation when the completion date is changed after signing', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const segmentId = 44444n;
      const signature = await signSegment(segmentId, testCompletionDate, user);

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [
            {
              schemaId: testSchemaId,
              expirationDate: 0n,
              subject: encodeSubject(user),
              attestationData: encodeAttestationData(segmentId, testCompletionDate + 1n),
            },
            [encodeValidationPayload(signature)],
          ],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('should reject replayed attestations with the same signed payload', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const segmentId = 55555n;
      const signature = await signSegment(segmentId, testCompletionDate, user);
      const attestationPayload = {
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(segmentId, testCompletionDate),
      };
      const validationPayload = encodeValidationPayload(signature);

      const hash = await userWalletClient.writeContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'attest',
        args: [attestationPayload, [validationPayload]],
        value: testFee,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [attestationPayload, [validationPayload]],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('should reject attestations after the signed deadline', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const segmentId = 66666n;
      const expiredDeadline = 1n;
      const signature = await signSegment(segmentId, testCompletionDate, user, expiredDeadline);

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [
            {
              schemaId: testSchemaId,
              expirationDate: 0n,
              subject: encodeSubject(user),
              attestationData: encodeAttestationData(segmentId, testCompletionDate),
            },
            [encodeValidationPayload(signature, expiredDeadline)],
          ],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('should reject the same segment, completion date, and subject with a fresh deadline', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const segmentId = 77777n;
      const firstDeadline = testDeadline + 300n;
      const replayDeadline = firstDeadline + 300n;
      const payload = {
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(segmentId, testCompletionDate),
      };
      const firstSignature = await signSegment(segmentId, testCompletionDate, user, firstDeadline);
      const firstHash = await userWalletClient.writeContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'attest',
        args: [payload, [encodeValidationPayload(firstSignature, firstDeadline)]],
        value: testFee,
      });
      await publicClient.waitForTransactionReceipt({ hash: firstHash });

      const replaySignature = await signSegment(
        segmentId,
        testCompletionDate,
        user,
        replayDeadline,
      );
      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload, [encodeValidationPayload(replaySignature, replayDeadline)]],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('should reject signatures bound to another chain or portal address', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const payload = (segmentId: bigint) => ({
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(segmentId, testCompletionDate),
      });

      const wrongChainSegment = 78787n;
      const wrongChainSignature = await signSegment(
        wrongChainSegment,
        testCompletionDate,
        user,
        testDeadline,
        { chainId: chainId + 1 },
      );
      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload(wrongChainSegment), [encodeValidationPayload(wrongChainSignature)]],
          value: testFee,
        }),
      ).rejects.toThrow();

      const wrongPortalSegment = 79797n;
      const wrongPortalSignature = await signSegment(
        wrongPortalSegment,
        testCompletionDate,
        user,
        testDeadline,
        { verifyingContract: portal },
      );
      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload(wrongPortalSegment), [encodeValidationPayload(wrongPortalSignature)]],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('should reject underpayment and malformed production-entry payloads', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const segmentId = 80808n;
      const signature = await signSegment(segmentId, testCompletionDate, user);
      const validationPayload = encodeValidationPayload(signature);
      const payload = {
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(segmentId, testCompletionDate),
      };

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload, [validationPayload]],
          value: testFee - 1n,
        }),
      ).rejects.toThrow();

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [{ ...payload, attestationData: '0x1234' }, [validationPayload]],
          value: testFee,
        }),
      ).rejects.toThrow();

      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload, ['0x1234']],
          value: testFee,
        }),
      ).rejects.toThrow();
    });

    it('accepts a signature at the exact deadline boundary', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const latestBlock = await publicClient.getBlock();
      const deadline = latestBlock.timestamp + 1n;
      const segmentId = 81818n;
      const signature = await signSegment(segmentId, testCompletionDate, user, deadline);

      await networkProvider.request({
        method: 'evm_setNextBlockTimestamp',
        params: [Number(deadline)],
      });
      const hash = await userWalletClient.writeContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'attest',
        args: [
          {
            schemaId: testSchemaId,
            expirationDate: 0n,
            subject: encodeSubject(user),
            attestationData: encodeAttestationData(segmentId, testCompletionDate),
          },
          [encodeValidationPayload(signature, deadline)],
        ],
        value: testFee,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const attestedBlock = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
      expect(attestedBlock.timestamp).toBe(deadline);
    });

    it('rolls back replay state if the downstream attestation registry fails', async () => {
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const routerArtifact = await hre.artifacts.readArtifact('MockRouter');
      const registryAddress = (await publicClient.readContract({
        address: mockRouter,
        abi: routerArtifact.abi,
        functionName: 'getAttestationRegistry',
      })) as Address;
      const registryArtifact = await hre.artifacts.readArtifact('MockAttestationRegistry');
      const segmentId = 82828n;
      const attestationHash = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_hashAttestation',
        args: [segmentId, testCompletionDate, user],
      });
      const signature = await signSegment(segmentId, testCompletionDate, user);

      const setFailureHash = await walletClient.writeContract({
        address: registryAddress,
        abi: registryArtifact.abi,
        functionName: 'setFailAttest',
        args: [true],
      });
      await publicClient.waitForTransactionReceipt({ hash: setFailureHash });

      const payload = {
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(segmentId, testCompletionDate),
      };
      await expect(
        userWalletClient.writeContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'attest',
          args: [payload, [encodeValidationPayload(signature)]],
          value: testFee,
        }),
      ).rejects.toThrow('Mock attest failure');
      expect(
        await publicClient.readContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'usedAttestations',
          args: [attestationHash],
        }),
      ).toBe(false);

      const resetFailureHash = await walletClient.writeContract({
        address: registryAddress,
        abi: registryArtifact.abi,
        functionName: 'setFailAttest',
        args: [false],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetFailureHash });
      const retryHash = await userWalletClient.writeContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'attest',
        args: [payload, [encodeValidationPayload(signature)]],
        value: testFee,
      });
      await publicClient.waitForTransactionReceipt({ hash: retryHash });
      expect(
        await publicClient.readContract({
          address: portalHarness,
          abi: harnessArtifact.abi,
          functionName: 'usedAttestations',
          args: [attestationHash],
        }),
      ).toBe(true);
    });
  });

  describe('Admin Functions', () => {
    it('rejects unauthorized setters, revoke, replace, and withdrawal through public entry points', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const payload = {
        schemaId: testSchemaId,
        expirationDate: 0n,
        subject: encodeSubject(user),
        attestationData: encodeAttestationData(testSegmentId, testCompletionDate),
      };

      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'setFee',
          args: [testFee + 1n],
        }),
      ).rejects.toThrow();
      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'setSignerAddress',
          args: [user],
        }),
      ).rejects.toThrow();
      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'setSchemaId',
          args: [`0x${'11'.repeat(32)}` as Hex],
        }),
      ).rejects.toThrow();
      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'revoke',
          args: [`0x${'22'.repeat(32)}` as Hex],
        }),
      ).rejects.toThrow();
      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'replace',
          args: [`0x${'33'.repeat(32)}` as Hex, payload, []],
          value: testFee,
        }),
      ).rejects.toThrow();
      await expect(
        userWalletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'withdraw',
          args: [],
        }),
      ).rejects.toThrow();
    });

    it('should authorize admin calls against the current portal registry owner', async () => {
      expect(getAddress(user)).not.toBe(getAddress(owner));

      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const mockPortalRegistryArtifact = await hre.artifacts.readArtifact('MockPortalRegistry');
      const newFee = parseEther('0.0003');

      const transferHash = await walletClient.writeContract({
        address: mockPortalRegistry,
        abi: mockPortalRegistryArtifact.abi,
        functionName: 'setPortal',
        args: [portal, user],
      });
      await publicClient.waitForTransactionReceipt({ hash: transferHash });

      await expect(
        walletClient.writeContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'setFee',
          args: [newFee],
        }),
      ).rejects.toThrow();

      const userSetFeeHash = await userWalletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setFee',
        args: [newFee],
      });
      await publicClient.waitForTransactionReceipt({ hash: userSetFeeHash });

      const fee = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'fee',
      });
      expect(fee).toBe(newFee);

      const resetOwnerHash = await walletClient.writeContract({
        address: mockPortalRegistry,
        abi: mockPortalRegistryArtifact.abi,
        functionName: 'setPortal',
        args: [portal, owner],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetOwnerHash });

      const resetFeeHash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setFee',
        args: [testFee],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetFeeHash });
    });

    it('should allow owner to set fee', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const newFee = parseEther('0.0002');

      const hash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setFee',
        args: [newFee],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const fee = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'fee',
      });

      expect(fee).toBe(newFee);

      // Reset fee for other tests
      const resetHash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setFee',
        args: [testFee],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetHash });
    });

    it('should allow owner to set signer address', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const newSigner = getAddress('0x1234567890123456789012345678901234567890');

      const hash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setSignerAddress',
        args: [newSigner],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const storedSigner = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'signerAddress',
      });

      expect(getAddress(storedSigner as string)).toBe(newSigner);

      // Reset signer for other tests
      const resetHash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setSignerAddress',
        args: [signerAddress],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetHash });
    });

    it('should allow owner to set schema ID', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const newSchemaId =
        '0x1234567890123456789012345678901234567890123456789012345678901234' as Hex;

      const hash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setSchemaId',
        args: [newSchemaId],
      });
      await publicClient.waitForTransactionReceipt({ hash });

      const storedSchemaId = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'schemaId',
      });

      expect(storedSchemaId).toBe(newSchemaId);

      // Reset schema ID for other tests
      const resetHash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'setSchemaId',
        args: [testSchemaId],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetHash });
    });

    it('should allow owner to withdraw funds', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');

      // Note: In production, funds would come from attest() calls
      // Here we just verify the withdraw function can be called by owner
      const contractBalanceBefore = await publicClient.getBalance({ address: portal });
      const ownerBalanceBefore = await publicClient.getBalance({ address: owner });

      // Withdraw (even if balance is 0, it should succeed)
      const withdrawHash = await walletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'withdraw',
        args: [],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

      const contractBalanceAfter = await publicClient.getBalance({ address: portal });
      const ownerBalanceAfter = await publicClient.getBalance({ address: owner });

      // Contract should be empty (or remain empty)
      expect(contractBalanceAfter).toBe(BigInt(0));

      // Owner balance should only change by gas cost (no funds to transfer)
      const gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
      expect(ownerBalanceAfter).toBe(ownerBalanceBefore + contractBalanceBefore - gasCost);
    });

    it('leaves funds and attestation state unchanged when the portal owner rejects withdrawal', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');
      const harnessArtifact = await hre.artifacts.readArtifact('StravaPortalHarness');
      const registryArtifact = await hre.artifacts.readArtifact('MockPortalRegistry');
      const rejectingOwnerArtifact = await hre.artifacts.readArtifact('MockRejectingPortalOwner');
      const rejectingOwnerHash = await walletClient.deployContract({
        abi: rejectingOwnerArtifact.abi,
        bytecode: rejectingOwnerArtifact.bytecode as Hex,
        args: [],
      });
      const rejectingOwnerReceipt = await publicClient.waitForTransactionReceipt({
        hash: rejectingOwnerHash,
      });
      const rejectingOwner = rejectingOwnerReceipt.contractAddress!;
      const setOwnerHash = await walletClient.writeContract({
        address: mockPortalRegistry,
        abi: registryArtifact.abi,
        functionName: 'setPortal',
        args: [portal, rejectingOwner],
      });
      await publicClient.waitForTransactionReceipt({ hash: setOwnerHash });

      const segmentId = 83838n;
      const deadline = testDeadline + 600n;
      const signature = await signSegment(segmentId, testCompletionDate, user, deadline, {
        verifyingContract: portal,
      });
      const attestationHash = await publicClient.readContract({
        address: portalHarness,
        abi: harnessArtifact.abi,
        functionName: 'exposed_hashAttestation',
        args: [segmentId, testCompletionDate, user],
      });
      const attestHash = await userWalletClient.writeContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'attest',
        args: [
          {
            schemaId: testSchemaId,
            expirationDate: 0n,
            subject: encodeSubject(user),
            attestationData: encodeAttestationData(segmentId, testCompletionDate),
          },
          [encodeValidationPayload(signature, deadline)],
        ],
        value: testFee,
      });
      await publicClient.waitForTransactionReceipt({ hash: attestHash });
      const balanceBefore = await publicClient.getBalance({ address: portal });
      const attestedBefore = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'usedAttestations',
        args: [attestationHash],
      });
      expect(attestedBefore).toBe(true);

      const executeHash = await userWalletClient.writeContract({
        address: rejectingOwner,
        abi: rejectingOwnerArtifact.abi,
        functionName: 'executeWithdraw',
        args: [portal],
      });
      await publicClient.waitForTransactionReceipt({ hash: executeHash });

      expect(
        await publicClient.readContract({
          address: rejectingOwner,
          abi: rejectingOwnerArtifact.abi,
          functionName: 'lastCallSucceeded',
        }),
      ).toBe(false);
      expect(await publicClient.getBalance({ address: portal })).toBe(balanceBefore);
      expect(
        await publicClient.readContract({
          address: portal,
          abi: portalArtifact.abi,
          functionName: 'usedAttestations',
          args: [attestationHash],
        }),
      ).toBe(attestedBefore);

      const resetOwnerHash = await walletClient.writeContract({
        address: mockPortalRegistry,
        abi: registryArtifact.abi,
        functionName: 'setPortal',
        args: [portal, owner],
      });
      await publicClient.waitForTransactionReceipt({ hash: resetOwnerHash });
    });
  });

  describe('Fee Validation', () => {
    it('should have correct default fee', async () => {
      const portalArtifact = await hre.artifacts.readArtifact('StravaPortal');

      const fee = await publicClient.readContract({
        address: portal,
        abi: portalArtifact.abi,
        functionName: 'fee',
      });

      expect(fee).toBe(parseEther('0.0001'));
    });
  });

  describe('Attestation Data Encoding', () => {
    it('should encode attestation data correctly', () => {
      const encoded = encodeAttestationData(testSegmentId, testCompletionDate);

      // uint256 (32 bytes) + uint64 padded (32 bytes) = 64 bytes = 128 hex chars + 0x
      expect(encoded).toHaveLength(130);
      expect(encoded).toMatch(/^0x[a-f0-9]+$/);
    });
  });
});
