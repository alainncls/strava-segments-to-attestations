import { describe, expect, it } from 'vitest';
import {
  formatActivityType,
  formatDayKey,
  formatDistance,
  formatDuration,
  localDayKey,
} from './format';

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

  it('formats durations in hours, minutes and seconds', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(3723)).toBe('1h 2m 3s');
    expect(formatDuration(3600)).toBe('1h 0m 0s');
  });

  it('formats a day key without a time zone shift', () => {
    expect(formatDayKey('2026-01-01')).toBe('Thu, Jan 1, 2026');
  });

  it('gives the local date of a moment', () => {
    expect(localDayKey(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
  });
});
