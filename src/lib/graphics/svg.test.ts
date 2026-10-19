import { describe, expect, it } from 'vitest';
import { parseSvgDimensions, sanitizeSvg } from './svg';

describe('SVG parsing', () => {
  it('reads width and height attributes', () => {
    const dimensions = parseSvgDimensions(
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320"></svg>',
    );
    expect(dimensions.width).toBe(640);
    expect(dimensions.height).toBe(320);
  });

  it('falls back to the viewBox', () => {
    const dimensions = parseSvgDimensions(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"></svg>',
    );
    expect(dimensions.width).toBe(200);
    expect(dimensions.height).toBe(100);
  });

  it('converts physical units to pixels at 96 DPI', () => {
    const dimensions = parseSvgDimensions(
      '<svg xmlns="http://www.w3.org/2000/svg" width="25.4mm" height="1in"></svg>',
    );
    expect(dimensions.width).toBeCloseTo(96, 1);
    expect(dimensions.height).toBeCloseTo(96, 1);
  });

  it('rejects malformed SVG', () => {
    expect(() => parseSvgDimensions('<svg><broken></svg>')).toThrow(/could not be parsed/i);
  });
});

describe('SVG sanitizing', () => {
  it('removes scripts, event handlers, and external references', () => {
    const hostile = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="100" height="100" onload="alert(1)">
      <script>alert('x')</script>
      <image href="https://example.com/tracker.png" width="10" height="10"/>
      <a xlink:href="javascript:alert(1)"><rect width="10" height="10"/></a>
      <rect width="10" height="10" onclick="alert(1)"/>
    </svg>`;
    const sanitized = sanitizeSvg(hostile);
    expect(sanitized.toLowerCase()).not.toContain('<script');
    expect(sanitized.toLowerCase()).not.toContain('onload');
    expect(sanitized.toLowerCase()).not.toContain('onclick');
    expect(sanitized).not.toContain('https://example.com');
    expect(sanitized).not.toContain('javascript:');
  });

  it('preserves internal fragment references and data images', () => {
    const source = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
      <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
      <rect width="10" height="10" fill="url(#g)"/>
      <image href="data:image/png;base64,AAAA" width="10" height="10"/>
    </svg>`;
    const sanitized = sanitizeSvg(source);
    expect(sanitized).toContain('url(#g)');
    expect(sanitized).toContain('data:image/png');
  });
});
