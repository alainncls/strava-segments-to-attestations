import { describe, expect, it } from 'vitest';
import { formatDistance, formatActivityType } from './format';

describe('format utilities', () => {
  it('formats distances in kilometers', () => {
    expect(formatDistance(100)).toBe('0.10 km');
    expect(formatDistance(1000)).toBe('1.00 km');
    expect(formatDistance(5500)).toBe('5.50 km');
  });

  it('formats Strava activity types as readable labels', () => {
    expect(formatActivityType('Run')).toBe('Run');
    expect(formatActivityType('VirtualRide')).toBe('Virtual ride');
    expect(formatActivityType('AlpineSki')).toBe('Alpine ski');
  });
});
