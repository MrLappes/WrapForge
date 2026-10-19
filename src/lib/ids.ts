const FALLBACK_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function createId(prefix: string): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  let out = '';
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    for (const byte of bytes) out += FALLBACK_ALPHABET[byte % FALLBACK_ALPHABET.length];
  } else {
    for (let i = 0; i < 16; i += 1) {
      out += FALLBACK_ALPHABET[Math.floor(Math.random() * FALLBACK_ALPHABET.length)];
    }
  }
  return `${prefix}_${out}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
