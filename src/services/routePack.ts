import AsyncStorage from '@react-native-async-storage/async-storage';

import bundledNetwork from '../data/bacolod-network.json';
import type {NetworkGeoJSON} from '../domain/types';
import {sha256, utf8ByteLength} from './sha256';

const ACTIVE_KEY = 'dasig:offline-pack:bacolod:active';
const DATA_PREFIX = 'dasig:offline-pack:bacolod:data:';

export type PackSyncState =
  | 'bundled'
  | 'checking'
  | 'downloading'
  | 'verifying'
  | 'ready'
  | 'failed';

export interface PackManifest {
  schema_version: number;
  city: 'bacolod';
  version: string;
  sha256: string;
  size_bytes: number;
  network_url: string;
  source: string;
}

export interface ActivePack {
  network: NetworkGeoJSON;
  version: string;
  source: 'bundled' | 'downloaded';
}

interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

type FetchAdapter = typeof fetch;

function validNetwork(value: unknown): value is NetworkGeoJSON {
  const candidate = value as Partial<NetworkGeoJSON> | null;
  return Boolean(
    candidate &&
      candidate.type === 'FeatureCollection' &&
      Array.isArray(candidate.features) &&
      candidate.features.length > 0,
  );
}

export async function loadActivePack(
  storage: StorageAdapter = AsyncStorage,
): Promise<ActivePack> {
  const version = await storage.getItem(ACTIVE_KEY);
  if (version) {
    const serialized = await storage.getItem(`${DATA_PREFIX}${version}`);
    if (serialized) {
      try {
        const network: unknown = JSON.parse(serialized);
        if (validNetwork(network)) {
          return {network, version, source: 'downloaded'};
        }
      } catch {
        // Keep the bundled pack available after interrupted or corrupt writes.
      }
    }
  }
  return {
    network: bundledNetwork as unknown as NetworkGeoJSON,
    version: 'bundled',
    source: 'bundled',
  };
}

export async function syncRoutePack(
  baseUrl: string,
  onState: (state: PackSyncState) => void,
  storage: StorageAdapter = AsyncStorage,
  fetcher: FetchAdapter = fetch,
): Promise<ActivePack> {
  onState('checking');
  try {
    const manifestResponse = await fetcher(
      `${baseUrl.replace(/\/$/, '')}/api/offline-packs/bacolod/manifest`,
    );
    if (!manifestResponse.ok) {
      throw new Error('The route-pack server is unavailable.');
    }
    const manifest = (await manifestResponse.json()) as PackManifest;
    if (
      manifest.schema_version !== 1 ||
      manifest.city !== 'bacolod' ||
      !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
      manifest.version !== manifest.sha256.slice(0, 12) ||
      !Number.isSafeInteger(manifest.size_bytes) ||
      manifest.size_bytes <= 0
    ) {
      throw new Error('The route-pack manifest is incompatible.');
    }

    const activeVersion = await storage.getItem(ACTIVE_KEY);
    if (activeVersion === manifest.version) {
      const active = await loadActivePack(storage);
      if (active.version === manifest.version) {
        onState('ready');
        return active;
      }
    }

    onState('downloading');
    const networkResponse = await fetcher(manifest.network_url);
    if (!networkResponse.ok) {
      throw new Error('The Bacolod route pack could not be downloaded.');
    }
    const serialized = await networkResponse.text();
    onState('verifying');
    if (
      utf8ByteLength(serialized) !== manifest.size_bytes ||
      sha256(serialized) !== manifest.sha256
    ) {
      throw new Error('The downloaded route pack failed verification.');
    }
    const network: unknown = JSON.parse(serialized);
    if (!validNetwork(network)) {
      throw new Error('The downloaded route pack is invalid.');
    }

    // Write immutable versioned data first. The small active pointer is the
    // commit: a crash before it changes leaves the last verified pack active.
    await storage.setItem(`${DATA_PREFIX}${manifest.version}`, serialized);
    await storage.setItem(ACTIVE_KEY, manifest.version);
    onState('ready');
    return {network, version: manifest.version, source: 'downloaded'};
  } catch (error) {
    onState('failed');
    const fallback = await loadActivePack(storage);
    if (fallback) {
      return fallback;
    }
    throw error;
  }
}
