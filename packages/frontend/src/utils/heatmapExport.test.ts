import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildExportSvg, downloadPng, downloadSvg, type ExportOptions } from './heatmapExport';

const SVG_NS = 'http://www.w3.org/2000/svg';

const yearSvg = (year: number, width: number, height: number): string => `
  <svg data-year="${year}" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-label="Year ${year}">
    <text fill="currentColor">${year}</text>
    <text>Mon</text>
    <rect data-day="${year}-01-01" fill="#ebedf0"><title>Morning Run</title></rect>
    <rect data-day="${year}-01-02" fill="#40c463" aria-label="Morning Run"></rect>
    <rect data-day="${year}-12-31" fill="#ebedf0" data-future=""></rect>
  </svg>`;

const defaults: ExportOptions = {
  dark: false,
  hideFuture: false,
  newestFirst: false,
  fromYear: 2000,
  toYear: 3000,
};

let years: SVGSVGElement[];

const build = (options: Partial<ExportOptions> = {}): Element => {
  const doc = new DOMParser().parseFromString(
    buildExportSvg(years, { ...defaults, ...options }),
    'image/svg+xml',
  );
  return doc.documentElement;
};

const exportedYears = (root: Element): (string | null)[] =>
  Array.from(root.querySelectorAll('svg[data-year]')).map((s) => s.getAttribute('data-year'));

beforeEach(() => {
  document.body.innerHTML =
    yearSvg(2024, 300, 100) + yearSvg(2025, 400, 120) + yearSvg(2026, 350, 110);
  years = Array.from(document.querySelectorAll<SVGSVGElement>('svg[data-year]'));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('buildExportSvg', () => {
  it('returns a parseable SVG document with the SVG namespace and a system font', () => {
    const root = build();
    expect(root.querySelector('parsererror')).toBeNull();
    expect(root.namespaceURI).toBe(SVG_NS);
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('font-family')).toContain('sans-serif');
  });

  it('stacks the years vertically, oldest first by default', () => {
    const root = build();
    expect(exportedYears(root)).toEqual(['2024', '2025', '2026']);
    const offsets = Array.from(root.querySelectorAll('svg[data-year]')).map((s) =>
      Number(s.getAttribute('y')),
    );
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeGreaterThanOrEqual(100);
    expect(offsets[2]).toBeGreaterThanOrEqual((offsets[1] ?? 0) + 120);
    expect(root.getAttribute('width')).toBe('400');
    expect(Number(root.getAttribute('height'))).toBeGreaterThanOrEqual(330);
  });

  it('orders the years newest first', () => {
    expect(exportedYears(build({ newestFirst: true }))).toEqual(['2026', '2025', '2024']);
  });

  it('keeps only the years in the fromYear to toYear range', () => {
    expect(exportedYears(build({ fromYear: 2025, toYear: 2026 }))).toEqual(['2025', '2026']);
    expect(exportedYears(build({ fromYear: 2025, toYear: 2025 }))).toEqual(['2025']);
  });

  it('uses a white background and dark text in light mode', () => {
    const root = build();
    const background = root.firstElementChild;
    expect(background?.tagName).toBe('rect');
    expect(background?.getAttribute('fill')).toBe('#ffffff');
    const fills = Array.from(root.querySelectorAll('text')).map((t) => t.getAttribute('fill'));
    expect(new Set(fills).size).toBe(1);
    expect(fills[0]).toMatch(/^#/);
    expect(fills[0]).not.toBe('#ffffff');
  });

  it('uses a dark background and light text in dark mode', () => {
    const root = build({ dark: true });
    expect(root.firstElementChild?.getAttribute('fill')).toBe('#121212');
    const lightFill = build().querySelector('text')?.getAttribute('fill');
    const darkFill = root.querySelector('text')?.getAttribute('fill');
    expect(darkFill).toMatch(/^#/);
    expect(darkFill).not.toBe(lightFill);
    expect(darkFill).not.toBe('#121212');
  });

  it('removes the future cells and keeps the others when hideFuture is set', () => {
    const root = build({ hideFuture: true });
    expect(root.querySelectorAll('rect[data-future]')).toHaveLength(0);
    expect(root.querySelectorAll('rect[data-day]')).toHaveLength(6);
    expect(build().querySelectorAll('rect[data-future]')).toHaveLength(3);
  });

  it('removes the titles and aria-labels', () => {
    const root = build();
    expect(root.querySelectorAll('title')).toHaveLength(0);
    expect(root.querySelectorAll('[aria-label]')).toHaveLength(0);
    expect(new XMLSerializer().serializeToString(root)).not.toContain('Morning Run');
  });

  it('does not mutate the page SVGs', () => {
    const before = document.body.innerHTML;
    build({ dark: true, hideFuture: true, newestFirst: true, fromYear: 2025, toYear: 2025 });
    expect(document.body.innerHTML).toBe(before);
  });
});

describe('downloadSvg', () => {
  it('downloads an SVG blob through a temporary link and revokes the URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:svg');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('effortprint-heatmap.svg');
      expect(this.getAttribute('href')).toBe('blob:svg');
    });

    downloadSvg('<svg/>', 'effortprint-heatmap.svg');

    expect(createObjectURL.mock.calls[0]?.[0].type).toBe('image/svg+xml');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:svg');
  });
});

describe('downloadPng', () => {
  const stubCanvas = (blob: Blob | null): ReturnType<typeof vi.fn> => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) =>
      callback(blob),
    );
    return drawImage;
  };

  const stubImage = (fails = false): typeof vi =>
    vi.stubGlobal(
      'Image',
      class {
        naturalWidth = 400;
        naturalHeight = 330;
        onload?: () => void;
        onerror?: () => void;
        set src(_value: string) {
          queueMicrotask(() => (fails ? this.onerror?.() : this.onload?.()));
        }
      },
    );

  it('draws the SVG at 2x and downloads a PNG', async () => {
    stubImage();
    const drawImage = stubCanvas(new Blob(['png'], { type: 'image/png' }));
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:png');
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await downloadPng('<svg/>', 'effortprint-heatmap.png');

    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 660);
    expect(createObjectURL.mock.calls[0]?.[0].type).toBe('image/png');
    expect(click).toHaveBeenCalledOnce();
  });

  it('rejects on an image load error or a null blob', async () => {
    stubImage(true);
    await expect(downloadPng('<svg/>', 'a.png')).rejects.toThrow();
    stubImage();
    stubCanvas(null);
    await expect(downloadPng('<svg/>', 'a.png')).rejects.toThrow();
  });
});
