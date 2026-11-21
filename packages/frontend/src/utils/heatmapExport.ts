export interface ExportOptions {
  dark: boolean;
  hideFuture: boolean;
  newestFirst: boolean;
  fromYear: number;
  toYear: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const GAP = 16;
const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export function buildExportSvg(years: SVGSVGElement[], options: ExportOptions): string {
  const yearOf = (svg: SVGSVGElement): number => Number(svg.getAttribute('data-year'));
  const selected = years
    .filter((svg) => yearOf(svg) >= options.fromYear && yearOf(svg) <= options.toYear)
    .sort((a, b) => (options.newestFirst ? yearOf(b) - yearOf(a) : yearOf(a) - yearOf(b)));

  const root = document.createElementNS(SVG_NS, 'svg');
  const background = document.createElementNS(SVG_NS, 'rect');
  root.append(background);

  let width = 0;
  let y = 0;
  for (const svg of selected) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('title, desc').forEach((el) => el.remove());
    [clone, ...clone.querySelectorAll('[aria-label]')].forEach((el) =>
      el.removeAttribute('aria-label'),
    );
    if (options.hideFuture)
      clone.querySelectorAll('rect[data-future]').forEach((el) => el.remove());
    // Page CSS and currentColor do not resolve in a standalone image.
    clone
      .querySelectorAll('text, tspan')
      .forEach((el) => el.setAttribute('fill', options.dark ? '#e6e6e6' : '#1f2328'));
    clone.setAttribute('x', '0');
    clone.setAttribute('y', String(y));
    root.append(clone);
    width = Math.max(width, Number(svg.getAttribute('width')));
    y += Number(svg.getAttribute('height')) + GAP;
  }
  const height = Math.max(0, y - GAP);

  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  root.setAttribute('font-family', FONT_STACK);
  background.setAttribute('width', '100%');
  background.setAttribute('height', '100%');
  background.setAttribute('fill', options.dark ? '#121212' : '#ffffff');

  return new XMLSerializer().serializeToString(root);
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadSvg(svg: string, fileName: string): void {
  downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), fileName);
}

export async function downloadPng(svg: string, fileName: string): Promise<void> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not load the heatmap image'));
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth * 2;
  canvas.height = image.naturalHeight * 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not encode the heatmap PNG');
  downloadBlob(blob, fileName);
}
