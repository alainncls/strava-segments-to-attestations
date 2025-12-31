/**
 * Error handling utilities for wallet interactions
 * @see 20-wagmi-viem.mdc - Explicitly handle EIP 1193 errors
 */

export interface WalletError {
  code: number;
  message: string;
  isUserRejection: boolean;
}

/**
 * Common EIP-1193 error codes
 */
const EIP_1193_ERRORS: Record<number, string> = {
  4001: 'Transaction rejected by user',
  4100: 'Wallet is not authorized',
  4200: 'Method not supported by wallet',
  4900: 'Wallet is disconnected',
  4901: 'Wallet is disconnected from this chain',
  // Internal errors
  [-32000]: 'Insufficient funds',
  [-32002]: 'Request already pending',
  [-32003]: 'Transaction rejected',
  [-32600]: 'Invalid request',
  [-32601]: 'Method not found',
  [-32602]: 'Invalid parameters',
  [-32603]: 'Internal error',
};

/**
 * Parse wallet/RPC errors into user-friendly messages
 */
export function parseWalletError(error: unknown): WalletError {
  // Default fallback
  const defaultError: WalletError = {
    code: -1,
    message: 'An unexpected error occurred',
    isUserRejection: false,
  };

  if (!error) return defaultError;

  // Handle standard Error objects
  if (error instanceof Error) {
    // Check for user rejection
    if (
      error.message.includes('User rejected') ||
      error.message.includes('user rejected') ||
      error.message.includes('User denied')
    ) {
      return {
        code: 4001,
        message: 'Transaction cancelled',
        isUserRejection: true,
      };
    }

    // Check for insufficient funds
    if (error.message.includes('insufficient funds')) {
      return {
        code: -32000,
        message: 'Insufficient funds for transaction',
        isUserRejection: false,
      };
    }

    return {
      ...defaultError,
      message: error.message,
    };
  }

  // Handle objects with code property (EIP-1193)
  if (typeof error === 'object' && 'code' in error) {
    const code = (error as { code: number }).code;
    const knownMessage = EIP_1193_ERRORS[code];

    return {
      code,
      message: knownMessage || (error as { message?: string }).message || defaultError.message,
      isUserRejection: code === 4001,
    };
  }

  return defaultError;
}

/**
 * Check if error is a user rejection (should not show error toast)
 */
export function isUserRejection(error: unknown): boolean {
  return parseWalletError(error).isUserRejection;
}
