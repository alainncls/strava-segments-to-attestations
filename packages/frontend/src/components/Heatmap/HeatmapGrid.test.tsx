import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { yearLayout } from '@/utils/heatmap';
import HeatmapGrid from './HeatmapGrid';

const props = {
  layout: yearLayout(2025, '2026-01-01', true),
  days: new Map(),
  metric: 'distance' as const,
  thresholds: [40, 20, 10, 5, 0],
  colors: ['#1', '#2', '#3', '#4', '#5'],
  emptyColor: '#0',
  cellSize: 12,
  labels: true,
  title: '2025',
  totals: '',
  onOpenDay: vi.fn(),
};

const texts = (container: HTMLElement): string[] =>
  Array.from(container.querySelectorAll('text')).map((t) => t.textContent);

describe('HeatmapGrid on a narrow screen', () => {
  it('keeps the day names and all the months when the cells are large enough', () => {
    const { container } = render(<HeatmapGrid {...props} />);
    expect(texts(container)).toContain('Mon');
    expect(
      texts(container).filter(
        (t) => /^[A-Z][a-z]{2}$/.test(t) && t !== 'Mon' && t !== 'Wed' && t !== 'Fri',
      ),
    ).toHaveLength(12);
  });

  it('hides the day names and spaces the month labels on small cells', () => {
    const { container } = render(<HeatmapGrid {...props} maxWidth={300} />);
    const svg = container.querySelector('svg');
    expect(Number(svg?.getAttribute('width'))).toBeLessThanOrEqual(300);
    expect(texts(container)).not.toContain('Mon');
    const xs = Array.from(container.querySelectorAll('text'))
      .filter((t) => /^[A-Z][a-z]{2}$/.test(t.textContent))
      .map((t) => Number(t.getAttribute('x')));
    xs.slice(1).forEach((x, i) => {
      expect(x - Number(xs[i])).toBeGreaterThanOrEqual(24);
    });
  });
});
