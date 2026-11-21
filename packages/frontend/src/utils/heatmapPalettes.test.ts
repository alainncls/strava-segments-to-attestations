import { describe, expect, it } from 'vitest';
import { DEFAULT_PALETTE, PALETTES } from './heatmapPalettes';

// WCAG relative luminance and contrast ratio.
const luminance = (hex: string): number => {
  const channel = (i: number): number => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string): number => {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

describe('heatmap palettes', () => {
  it('has 22 palettes and an orange default', () => {
    expect(Object.keys(PALETTES)).toHaveLength(22);
    expect(PALETTES[DEFAULT_PALETTE]).toContain('#fc5200');
  });

  it.each(Object.entries(PALETTES))('%s is readable on light and dark surfaces', (_, shades) => {
    expect(shades).toHaveLength(5);
    expect(new Set(shades).size).toBe(5);
    for (const shade of shades) {
      expect(shade).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(shade, '#ffffff')).toBeGreaterThan(1.1);
      expect(contrast(shade, '#121212')).toBeGreaterThan(1.5);
    }
    // Lightest first.
    expect(luminance(shades[0])).toBeGreaterThan(luminance(shades[4]));
  });
});
