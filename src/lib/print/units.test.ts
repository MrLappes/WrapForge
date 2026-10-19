import { describe, expect, it } from 'vitest';
import {
  formatMm,
  megabytesForPixels,
  mmToUnit,
  physicalSizeForPixels,
  pixelsForPhysicalSize,
  unitToMm,
} from './units';

describe('unit conversion', () => {
  it('converts inches and centimetres to millimetres', () => {
    expect(unitToMm(1, 'in')).toBeCloseTo(25.4, 6);
    expect(unitToMm(1, 'cm')).toBeCloseTo(10, 6);
    expect(unitToMm(12, 'mm')).toBe(12);
  });

  it('converts millimetres back to display units', () => {
    expect(mmToUnit(25.4, 'in')).toBeCloseTo(1, 6);
    expect(mmToUnit(100, 'cm')).toBeCloseTo(10, 6);
    expect(formatMm(1000, 'in', 2)).toBe('39.37 in');
  });
});

describe('raster sizing', () => {
  it('computes pixels from physical size and DPI', () => {
    expect(pixelsForPhysicalSize(25.4, 300)).toBe(300);
    expect(pixelsForPhysicalSize(1000, 150)).toBe(5906);
  });

  it('computes physical size from pixels and DPI', () => {
    expect(physicalSizeForPixels(300, 300)).toBeCloseTo(25.4, 6);
  });

  it('estimates memory for an RGBA raster', () => {
    expect(megabytesForPixels(1000, 1000)).toBeCloseTo(3.8147, 4);
  });

  it('rejects non-positive values', () => {
    expect(() => pixelsForPhysicalSize(0, 300)).toThrow();
    expect(() => pixelsForPhysicalSize(100, 0)).toThrow();
    expect(() => physicalSizeForPixels(-1, 300)).toThrow();
  });
});
