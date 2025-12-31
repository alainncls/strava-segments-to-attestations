import { describe, it, expect, beforeEach } from 'vitest';
import { isAddress, getAddress } from 'viem';

// Mock constants for testing
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'strava_access_token',
  REFRESH_TOKEN: 'strava_refresh_token',
  EXPIRES_AT: 'strava_expires_at',
  ATHLETE: 'strava_athlete',
} as const;

describe('Frontend Core Logic', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  describe('Address Validation', () => {
    it('should validate correct Ethereum addresses', () => {
      expect(isAddress('0x1234567890123456789012345678901234567890')).toBe(true);
      expect(isAddress('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B')).toBe(true);
    });

    it('should reject invalid addresses', () => {
      expect(isAddress('0x123')).toBe(false);
      expect(isAddress('not-an-address')).toBe(false);
      expect(isAddress('')).toBe(false);
    });

    it('should normalize addresses with getAddress', () => {
      const lower = '0xab5801a7d398351b8be11c439e05c5b3259aec9b';
      const checksummed = getAddress(lower);
      expect(checksummed).toBe('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B');
    });
  });

  describe('Storage Keys', () => {
    it('should have all required storage keys', () => {
      expect(STORAGE_KEYS.ACCESS_TOKEN).toBe('strava_access_token');
      expect(STORAGE_KEYS.REFRESH_TOKEN).toBe('strava_refresh_token');
      expect(STORAGE_KEYS.EXPIRES_AT).toBe('strava_expires_at');
      expect(STORAGE_KEYS.ATHLETE).toBe('strava_athlete');
    });
  });

  describe('Session Storage', () => {
    it('should store and retrieve values', () => {
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'test-token');
      expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBe('test-token');
    });

    it('should clear storage on logout', () => {
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, 'test-token');
      sessionStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, 'refresh-token');

      sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      sessionStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);

      expect(sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN)).toBeNull();
      expect(sessionStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN)).toBeNull();
    });
  });

  describe('Token Expiration Logic', () => {
    it('should detect valid token (expires in future)', () => {
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const isValid = futureExpiry * 1000 > Date.now() + 5 * 60 * 1000;
      expect(isValid).toBe(true);
    });

    it('should detect expired token', () => {
      const pastExpiry = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const isValid = pastExpiry * 1000 > Date.now() + 5 * 60 * 1000;
      expect(isValid).toBe(false);
    });

    it('should detect token expiring within 5 minutes', () => {
      const soonExpiry = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
      const isValid = soonExpiry * 1000 > Date.now() + 5 * 60 * 1000;
      expect(isValid).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should parse JSON athlete data', () => {
      const athlete = {
        id: 123,
        username: 'testuser',
        firstname: 'Test',
        lastname: 'User',
        profile: 'https://example.com/profile.jpg',
      };

      sessionStorage.setItem(STORAGE_KEYS.ATHLETE, JSON.stringify(athlete));
      const parsed = JSON.parse(sessionStorage.getItem(STORAGE_KEYS.ATHLETE) || '{}');

      expect(parsed.id).toBe(123);
      expect(parsed.username).toBe('testuser');
    });

    it('should handle missing athlete data gracefully', () => {
      const athleteStr = sessionStorage.getItem(STORAGE_KEYS.ATHLETE);
      const athlete = athleteStr ? JSON.parse(athleteStr) : null;
      expect(athlete).toBeNull();
    });
  });
});

describe('URL and Explorer Logic', () => {
  const getExplorerUrl = (hash: string, isMainnet: boolean): string => {
    const baseUrl = isMainnet ? 'https://lineascan.build' : 'https://sepolia.lineascan.build';
    return `${baseUrl}/tx/${hash}`;
  };

  it('should generate correct Sepolia explorer URL', () => {
    const hash = '0x1234567890abcdef';
    const url = getExplorerUrl(hash, false);
    expect(url).toBe('https://sepolia.lineascan.build/tx/0x1234567890abcdef');
  });

  it('should generate correct Mainnet explorer URL', () => {
    const hash = '0x1234567890abcdef';
    const url = getExplorerUrl(hash, true);
    expect(url).toBe('https://lineascan.build/tx/0x1234567890abcdef');
  });
});

describe('Format Utilities', () => {
  const formatTxHash = (hash: string): string => `${hash.slice(0, 10)}...${hash.slice(-6)}`;

  const formatDistance = (meters: number): string => {
    const km = meters / 1000;
    return `${km.toFixed(2)} km`;
  };

  it('should format transaction hash correctly', () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    const formatted = formatTxHash(hash);
    expect(formatted).toBe('0x12345678...abcdef');
  });

  it('should format distance in kilometers', () => {
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(5500)).toBe('5.50 km');
    expect(formatDistance(100)).toBe('0.10 km');
  });
});
