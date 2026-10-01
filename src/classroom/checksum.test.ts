import { describe, expect, it } from 'vitest';
import { canonicalJson, checksumStatus, computeChecksum, fnv1a32, verifyChecksum, withChecksum } from './checksum';
import { makeProgressFile } from './testing';

describe('fnv1a32', () => {
  it('matches the published FNV-1a 32-bit test vectors', () => {
    expect(fnv1a32('')).toBe('811c9dc5');
    expect(fnv1a32('a')).toBe('e40c292c');
    expect(fnv1a32('foobar')).toBe('bf9cf968');
  });

  it('hashes UTF-8 bytes, so accented text is stable', () => {
    expect(fnv1a32('Chloé')).toMatch(/^[0-9a-f]{8}$/);
    expect(fnv1a32('Chloé')).not.toBe(fnv1a32('Chloe'));
  });
});

describe('canonicalJson', () => {
  it('sorts object keys recursively and keeps array order', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1], c: null } })).toBe('{"a":{"c":null,"d":[3,1]},"b":1}');
  });

  it('drops undefined members like JSON.stringify', () => {
    expect(canonicalJson({ a: undefined, b: 'x' })).toBe('{"b":"x"}');
    expect(canonicalJson([undefined, 1])).toBe('[null,1]');
  });

  it('is independent of key insertion order', () => {
    expect(canonicalJson({ x: 1, y: { p: 1, q: 2 } })).toBe(canonicalJson({ y: { q: 2, p: 1 }, x: 1 }));
  });
});

describe('progress checksum', () => {
  it('ignores the checksum field itself', () => {
    const file = makeProgressFile({ id: 'p1', name: 'Ada', sign: false });
    expect(computeChecksum({ ...file, checksum: 'anything' })).toBe(computeChecksum(file));
  });

  it('verifies a signed file and rejects an edited one', () => {
    const signed = withChecksum(makeProgressFile({ id: 'p1', name: 'Ada', levels: { '1.1': { completed: true, stars: 2 } } }));
    expect(verifyChecksum(signed)).toBe(true);
    expect(checksumStatus(signed)).toBe('ok');
    const edited = { ...signed, levels: { ...signed.levels, '1.1': { ...signed.levels['1.1'], stars: 3 } } };
    expect(verifyChecksum(edited)).toBe(false);
    expect(checksumStatus(edited)).toBe('mismatch');
  });

  it('reports a missing checksum', () => {
    const file = makeProgressFile({ id: 'p1', sign: false });
    expect(checksumStatus(file)).toBe('missing');
    expect(verifyChecksum(file)).toBe(false);
  });

  it('survives a JSON round trip with different key order', () => {
    const signed = withChecksum(makeProgressFile({ id: 'p1', name: 'Bao', levels: { '2.1': { completed: true } } }));
    const reverse = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(reverse);
      if (value === null || typeof value !== 'object') return value;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(value).reverse()) out[key] = reverse((value as Record<string, unknown>)[key]);
      return out;
    };
    const roundTripped = JSON.parse(JSON.stringify(reverse(signed)));
    expect(Object.keys(roundTripped)[0]).toBe('checksum');
    expect(verifyChecksum(roundTripped)).toBe(true);
  });
});
