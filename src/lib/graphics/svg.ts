const DANGEROUS_ELEMENTS = new Set(['script', 'foreignObject', 'iframe', 'object', 'embed']);
const URL_ATTRIBUTES = ['href', 'xlink:href', 'src'];

/**
 * SVG files are treated as untrusted. This strips executable and embedded
 * document content before the SVG is used as an image. Rendering through an
 * <img> element already prevents script execution, but defence in depth is
 * cheap and keeps hostile files out of exported documents.
 */
export function sanitizeSvg(source: string): string {
  if (typeof DOMParser === 'undefined') return source;
  const parser = new DOMParser();
  const doc = parser.parseFromString(source, 'image/svg+xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('The SVG file could not be parsed.');
  }
  const all = doc.querySelectorAll('*');
  for (const element of Array.from(all)) {
    const tag = element.tagName.toLowerCase();
    if (DANGEROUS_ELEMENTS.has(tag) || tag.endsWith('script')) {
      element.remove();
      continue;
    }
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name);
        continue;
      }
      if (URL_ATTRIBUTES.includes(name)) {
        const value = attribute.value.trim();
        const safe = value.startsWith('#') || value.startsWith('data:image/');
        if (!safe) element.removeAttribute(attribute.name);
      }
      if (
        name === 'style' &&
        /url\s*\(\s*['"]?\s*(https?:|javascript:|file:)/i.test(attribute.value)
      ) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  const root = doc.documentElement;
  return new XMLSerializer().serializeToString(root);
}

export interface SvgDimensions {
  width: number;
  height: number;
  viewBox: string | null;
}

const UNIT_TO_PX: Record<string, number> = {
  px: 1,
  pt: 96 / 72,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};

function parseLength(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const match = value.trim().match(/^([0-9]*\.?[0-9]+)\s*([a-z%]*)$/i);
  if (!match) return fallback;
  const number = Number(match[1]);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  const unit = (match[2] || 'px').toLowerCase();
  return number * (UNIT_TO_PX[unit] ?? 1);
}

export function parseSvgDimensions(source: string): SvgDimensions {
  if (typeof DOMParser === 'undefined') return { width: 1000, height: 1000, viewBox: null };
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || doc.querySelector('parsererror')) {
    throw new Error('The SVG file could not be parsed.');
  }
  const viewBox = root.getAttribute('viewBox');
  let width = parseLength(root.getAttribute('width'), 0);
  let height = parseLength(root.getAttribute('height'), 0);
  let vbWidth = 0;
  let vbHeight = 0;
  if (viewBox) {
    const parts = viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((value) => Number.isFinite(value))) {
      vbWidth = parts[2];
      vbHeight = parts[3];
    }
  }
  if (!width && vbWidth) width = vbWidth;
  if (!height && vbHeight) height = vbHeight;
  if (width && !height && vbWidth && vbHeight) height = (width * vbHeight) / vbWidth;
  if (height && !width && vbWidth && vbHeight) width = (height * vbWidth) / vbHeight;
  if (!width || !height) {
    width = 1000;
    height = 1000;
  }
  return { width, height, viewBox };
}

export function svgDataUrl(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
