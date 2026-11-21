import { BaseError, UserRejectedRequestError } from 'viem';

export function isUserRejection(error: unknown): boolean {
  return (
    error instanceof BaseError &&
    error.walk((cause) => cause instanceof UserRejectedRequestError) !== null
  );
}

export function walletErrorMessage(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage;
  return error instanceof Error ? error.message : 'An unexpected error occurred';
}
