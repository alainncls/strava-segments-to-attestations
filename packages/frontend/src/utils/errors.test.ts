import { describe, expect, it } from 'vitest';
import { isUserRejection, parseWalletError } from './errors';

describe('wallet error utilities', () => {
  it('normalizes user-rejected errors', () => {
    const parsed = parseWalletError(new Error('User rejected the request'));

    expect(parsed).toEqual({
      code: 4001,
      isUserRejection: true,
      message: 'Transaction cancelled',
    });
    expect(isUserRejection({ code: 4001 })).toBe(true);
  });

  it('normalizes known EIP-1193 errors', () => {
    expect(parseWalletError({ code: 4901 })).toEqual({
      code: 4901,
      isUserRejection: false,
      message: 'Wallet is disconnected from this chain',
    });
  });

  it('falls back to a safe generic error', () => {
    expect(parseWalletError(null)).toEqual({
      code: -1,
      isUserRejection: false,
      message: 'An unexpected error occurred',
    });
  });
});
