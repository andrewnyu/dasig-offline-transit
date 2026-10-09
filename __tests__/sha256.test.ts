import {sha256} from '../src/services/sha256';

describe('route-pack hashing', () => {
  it('matches standard SHA-256 vectors', () => {
    expect(sha256('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(sha256('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256('DASIG — Bacolod')).toBe(
      '2683bce1b8d2506ca8c9991506cdbc9dd5d66b889df396951252c8f1238265f7',
    );
  });
});
