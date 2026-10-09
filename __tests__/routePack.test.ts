jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {getItem: jest.fn(), setItem: jest.fn()},
}));

import {loadActivePack, syncRoutePack, type PackManifest} from '../src/services/routePack';
import {sha256, utf8ByteLength} from '../src/services/sha256';

class MemoryStorage {
  values = new Map<string, string>();
  writes: string[] = [];

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.writes.push(key);
    this.values.set(key, value);
  }
}

const network = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {id: 'demo'},
      geometry: {type: 'LineString', coordinates: [[122.95, 10.67], [122.96, 10.68]]},
    },
  ],
});

function manifestFor(serialized: string): PackManifest {
  const hash = sha256(serialized);
  return {
    schema_version: 1,
    city: 'bacolod',
    version: hash.slice(0, 12),
    sha256: hash,
    size_bytes: utf8ByteLength(serialized),
    network_url: 'https://dasig.test/network',
    source: 'test',
  };
}

function fetchPack(manifest: PackManifest, downloaded: string): typeof fetch {
  return jest.fn(async (input: RequestInfo | URL) => {
    if (String(input).endsWith('/manifest')) {
      return {ok: true, json: async () => manifest};
    }
    return {ok: true, text: async () => downloaded};
  }) as unknown as typeof fetch;
}

describe('verified route-pack activation', () => {
  it('writes immutable data before moving the active pointer', async () => {
    const storage = new MemoryStorage();
    const manifest = manifestFor(network);
    const states: string[] = [];

    const active = await syncRoutePack(
      'https://dasig.test',
      state => states.push(state),
      storage,
      fetchPack(manifest, network),
    );

    expect(active.version).toBe(manifest.version);
    expect(active.source).toBe('downloaded');
    expect(states).toEqual(['checking', 'downloading', 'verifying', 'ready']);
    expect(storage.writes).toEqual([
      `dasig:offline-pack:bacolod:data:${manifest.version}`,
      'dasig:offline-pack:bacolod:active',
    ]);
  });

  it('rejects corrupt bytes and keeps the last verified pack active', async () => {
    const storage = new MemoryStorage();
    const firstManifest = manifestFor(network);
    await syncRoutePack(
      'https://dasig.test',
      () => undefined,
      storage,
      fetchPack(firstManifest, network),
    );

    const replacement = network.replace('demo', 'new-demo');
    const replacementManifest = manifestFor(replacement);
    const states: string[] = [];
    const result = await syncRoutePack(
      'https://dasig.test',
      state => states.push(state),
      storage,
      fetchPack(replacementManifest, `${replacement}corrupt`),
    );

    expect(states.at(-1)).toBe('failed');
    expect(result.version).toBe(firstManifest.version);
    expect((await loadActivePack(storage)).version).toBe(firstManifest.version);
    expect(storage.values.has(`dasig:offline-pack:bacolod:data:${replacementManifest.version}`)).toBe(false);
  });
});
