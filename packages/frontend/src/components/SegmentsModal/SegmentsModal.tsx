import React, { useState } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { encodeAbiParameters, parseAbiParameters, type Hex, type Address, isAddress } from 'viem';
import type { Activity, Segment, SignedSegment } from '../../types';
import {
  API_URL,
  PORTAL_ID_MAINNET,
  PORTAL_ID_SEPOLIA,
  SCHEMA_ID,
  linea,
  ATTESTATION_FEE,
} from '@/utils/constants.ts';
import { parseWalletError, isUserRejection } from '@/utils/errors.ts';
import { STRAVA_PORTAL_ABI } from '@/abi/StravaPortal.ts';
import { Modal } from '../Modal';
import { Button } from '../Button';
import SegmentItem from './SegmentItem';
import styles from './SegmentsModal.module.css';

interface SegmentsModalProps {
  activity?: Activity;
  displayModal: boolean;
  onHide: () => void;
  accessToken: string;
}

/**
 * Modal for viewing and attesting Strava segments
 * @see 20-wagmi-viem.mdc - Writes must handle pending, replacement, cancellation, and receipt confirmation
 */
export default function SegmentsModal({
  activity,
  displayModal,
  onHide,
  accessToken,
}: SegmentsModalProps): React.JSX.Element {
  const { address, chainId } = useAccount();

  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    reset: resetWrite,
  } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [loadingSegmentId, setLoadingSegmentId] = useState<number | null>(null);
  const [attestingSegmentId, setAttestingSegmentId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successTxHash, setSuccessTxHash] = useState<string | null>(null);

  const isMainnet = chainId === linea.id;
  const portalAddress: Address = isMainnet ? PORTAL_ID_MAINNET : PORTAL_ID_SEPOLIA;

  const handleAttest = async (segment: Segment): Promise<void> => {
    if (!address) {
      setError('Please connect your wallet first');
      return;
    }

    // Validate address format
    if (!isAddress(address)) {
      setError('Invalid wallet address');
      return;
    }

    setError(null);
    setSuccessTxHash(null);
    resetWrite();
    setLoadingSegmentId(segment.id);

    try {
      // Step 1: Get signature from backend
      const signResponse = await fetch(`${API_URL}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          activityId: activity?.id.toString(),
          segmentId: segment.id,
          subject: address,
          chainId,
        }),
      });

      if (!signResponse.ok) {
        const errorData = (await signResponse.json()) as { error?: string; tokenExpired?: boolean };
        setError(
          errorData.tokenExpired
            ? 'Your Strava session has expired. Please reconnect.'
            : errorData.error || 'Failed to sign segment',
        );
        setLoadingSegmentId(null);
        return;
      }

      const signedSegment: SignedSegment = await signResponse.json();

      setLoadingSegmentId(null);
      setAttestingSegmentId(segment.id);

      // Step 2: Encode attestation data for the schema
      const attestationData = encodeAbiParameters(
        parseAbiParameters('uint256 segmentId, uint64 completionDate'),
        [BigInt(signedSegment.segmentId), BigInt(signedSegment.completionDate)],
      );

      // Encode subject as bytes (address)
      const subjectBytes: Hex = address.toLowerCase() as Hex;

      // Step 3: Call attest on the portal contract
      writeContract(
        {
          address: portalAddress,
          abi: STRAVA_PORTAL_ABI,
          functionName: 'attest',
          args: [
            {
              schemaId: SCHEMA_ID,
              expirationDate: BigInt(0), // No expiration
              subject: subjectBytes,
              attestationData,
            },
            [signedSegment.signature],
          ],
          value: ATTESTATION_FEE,
        },
        {
          onSuccess: (hash) => {
            setSuccessTxHash(hash);
            setAttestingSegmentId(null);
          },
          onError: (err) => {
            if (!isUserRejection(err)) {
              const parsed = parseWalletError(err);
              setError(parsed.message);
            }
            setAttestingSegmentId(null);
          },
        },
      );
    } catch (err) {
      console.error('Attestation error:', err);

      if (!isUserRejection(err)) {
        const parsed = parseWalletError(err);
        setError(parsed.message);
      }

      setLoadingSegmentId(null);
      setAttestingSegmentId(null);
    }
  };

  const formatTxHash = (hash: string): string => `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  const getExplorerUrl = (hash: string): string => {
    const baseUrl = isMainnet ? 'https://lineascan.build' : 'https://sepolia.lineascan.build';
    return `${baseUrl}/tx/${hash}`;
  };

  const modalTitle = activity?.name ? `Segments in ${activity.name}` : 'Segments';

  const modalFooter = (
    <>
      <span className={styles.footerInfo}>Fee: 0.0001 ETH per attestation</span>
      <Button variant="secondary" onClick={onHide}>
        Close
      </Button>
    </>
  );

  return (
    <Modal show={displayModal} onHide={onHide} title={modalTitle} size="lg" footer={modalFooter}>
      {!activity?.segments?.length ? (
        <div className={styles.empty}>
          <p>No segments found in this activity.</p>
        </div>
      ) : (
        <div className={styles.segmentList}>
          {activity.segments.map((segment) => {
            const isThisSegmentActive =
              loadingSegmentId === segment.id || attestingSegmentId === segment.id;
            const isAnySegmentBusy =
              loadingSegmentId !== null || attestingSegmentId !== null || isWritePending;

            return (
              <SegmentItem
                key={segment.id}
                segment={segment}
                onAttest={() => handleAttest(segment)}
                isLoading={loadingSegmentId === segment.id}
                isAttesting={attestingSegmentId === segment.id}
                isDisabled={!isThisSegmentActive && isAnySegmentBusy}
                isWalletConnected={!!address}
              />
            );
          })}
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <span>❌</span> {error}
        </div>
      )}

      {successTxHash && (
        <div className={styles.success}>
          <span>✅</span> Attestation{' '}
          {isConfirming ? 'pending...' : isConfirmed ? 'confirmed!' : 'submitted!'}{' '}
          <a
            href={getExplorerUrl(successTxHash)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.txLink}
          >
            {formatTxHash(successTxHash)}
          </a>
        </div>
      )}
    </Modal>
  );
}
