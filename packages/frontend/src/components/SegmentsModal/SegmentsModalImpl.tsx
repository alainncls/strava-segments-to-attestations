import React, { useCallback, useMemo, useState } from 'react';
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
import { Web3Provider } from '../Wallet/Web3Provider';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import SegmentItem from './SegmentItem';
import styles from './SegmentsModal.module.css';

interface SegmentsModalProps {
  activity?: Activity;
  displayModal: boolean;
  onHide: () => void;
  accessToken: string;
}

const formatTxHash = (hash: string): string => `${hash.slice(0, 10)}...${hash.slice(-6)}`;

const getExplorerUrl = (hash: string, isMainnet: boolean): string => {
  const baseUrl = isMainnet ? 'https://lineascan.build' : 'https://sepolia.lineascan.build';
  return `${baseUrl}/tx/${hash}`;
};

function SegmentsModalContent({
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

  const handleAttest = useCallback(
    async (segment: Segment): Promise<void> => {
      if (!activity) {
        setError('No activity selected');
        return;
      }

      if (!address) {
        setError('Please connect your wallet first');
        return;
      }

      if (!isAddress(address)) {
        setError('Invalid wallet address');
        return;
      }

      setError(null);
      setSuccessTxHash(null);
      resetWrite();
      setLoadingSegmentId(segment.id);

      try {
        const signResponse = await fetch(`${API_URL}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            activityId: activity.id.toString(),
            segmentId: segment.id,
            subject: address,
            chainId,
          }),
        });

        if (!signResponse.ok) {
          const errorData = (await signResponse.json()) as {
            error?: string;
            tokenExpired?: boolean;
          };
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

        const attestationData = encodeAbiParameters(
          parseAbiParameters('uint256 segmentId, uint64 completionDate'),
          [BigInt(signedSegment.segmentId), BigInt(signedSegment.completionDate)],
        );
        const subjectBytes: Hex = address.toLowerCase() as Hex;

        writeContract(
          {
            address: portalAddress,
            abi: STRAVA_PORTAL_ABI,
            functionName: 'attest',
            args: [
              {
                schemaId: SCHEMA_ID,
                expirationDate: BigInt(0),
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
    },
    [accessToken, activity, address, chainId, portalAddress, resetWrite, writeContract],
  );

  const modalTitle = activity?.name ? `Segments in ${activity.name}` : 'Segments';

  const modalFooter = useMemo(
    () => (
      <>
        <span className={styles.footerInfo}>Fee: 0.0001 ETH per attestation</span>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </>
    ),
    [onHide],
  );

  const isAnySegmentBusy =
    loadingSegmentId !== null || attestingSegmentId !== null || isWritePending;

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

            return (
              <SegmentItem
                key={segment.id}
                segment={segment}
                onAttest={handleAttest}
                isLoading={loadingSegmentId === segment.id}
                isAttesting={attestingSegmentId === segment.id}
                isDisabled={!isThisSegmentActive && isAnySegmentBusy}
                isWalletConnected={!!address}
              />
            );
          })}
        </div>
      )}

      {error ? (
        <div className={styles.error}>
          <span>ERROR</span> {error}
        </div>
      ) : null}

      {successTxHash ? (
        <div className={styles.success}>
          <span>OK</span> Attestation{' '}
          {isConfirming ? 'pending...' : isConfirmed ? 'confirmed!' : 'submitted!'}{' '}
          <a
            href={getExplorerUrl(successTxHash, isMainnet)}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.txLink}
          >
            {formatTxHash(successTxHash)}
          </a>
        </div>
      ) : null}
    </Modal>
  );
}

export default function SegmentsModalImpl(props: SegmentsModalProps): React.JSX.Element {
  return (
    <Web3Provider>
      <SegmentsModalContent {...props} />
    </Web3Provider>
  );
}
