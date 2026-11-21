import { ContractFunctionExecutionError, UserRejectedRequestError } from 'viem';
import { describe, expect, it } from 'vitest';
import { isUserRejection, walletErrorMessage } from './errors';

const rejection = new UserRejectedRequestError(new Error('User rejected the request.'));

describe('wallet error utilities', () => {
  it('finds a user rejection at any depth of the error chain', () => {
    const wrapped = new ContractFunctionExecutionError(rejection, {
      abi: [],
      functionName: 'attest',
    });

    expect(isUserRejection(rejection)).toBe(true);
    expect(isUserRejection(wrapped)).toBe(true);
    expect(isUserRejection(new Error('User rejected the request.'))).toBe(false);
  });

  it('uses the short message of a viem error', () => {
    expect(walletErrorMessage(rejection)).toBe('User rejected the request.');
  });

  it('falls back to the error message, then to a generic message', () => {
    expect(walletErrorMessage(new Error('Network down'))).toBe('Network down');
    expect(walletErrorMessage(null)).toBe('An unexpected error occurred');
  });
});
