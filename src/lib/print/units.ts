export type LengthUnit = 'mm' | 'cm' | 'in';

export const MM_PER_INCH = 25.4;

export function unitToMm(value: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'cm':
      return value * 10;
    case 'in':
      return value * MM_PER_INCH;
  }
}

export function mmToUnit(valueMm: number, unit: LengthUnit): number {
  switch (unit) {
    case 'mm':
      return valueMm;
    case 'cm':
      return valueMm / 10;
    case 'in':
      return valueMm / MM_PER_INCH;
  }
}

export function formatMm(valueMm: number, unit: LengthUnit = 'mm', fractionDigits = 1): string {
  const converted = mmToUnit(valueMm, unit);
  return `${converted.toFixed(fractionDigits)} ${unit}`;
}

export function pixelsForPhysicalSize(sizeMm: number, dpi: number): number {
  if (!Number.isFinite(sizeMm) || !Number.isFinite(dpi) || sizeMm <= 0 || dpi <= 0) {
    throw new Error('Physical size and DPI must be positive finite numbers.');
  }
  return Math.max(1, Math.ceil((sizeMm / MM_PER_INCH) * dpi));
}

export function physicalSizeForPixels(pixels: number, dpi: number): number {
  if (!Number.isFinite(pixels) || !Number.isFinite(dpi) || pixels <= 0 || dpi <= 0) {
    throw new Error('Pixel count and DPI must be positive finite numbers.');
  }
  return (pixels / dpi) * MM_PER_INCH;
}

export function megabytesForPixels(width: number, height: number, bytesPerPixel = 4): number {
  return (width * height * bytesPerPixel) / (1024 * 1024);
}
