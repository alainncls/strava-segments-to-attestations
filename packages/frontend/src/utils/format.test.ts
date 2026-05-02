import { describe, expect, it } from 'vitest';
import { formatDistance, getActivityIcon } from './format';

describe('format utilities', () => {
  it('formats distances in kilometers', () => {
    expect(formatDistance(100)).toBe('0.10 km');
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(5500)).toBe('5.50 km');
  });

  it('uses activity-specific icons with a fallback', () => {
    expect(getActivityIcon('Run')).toBe('🏃');
    expect(getActivityIcon('Ride')).toBe('🚴');
    expect(getActivityIcon('VirtualRide')).toBe('🏅');
  });
});
