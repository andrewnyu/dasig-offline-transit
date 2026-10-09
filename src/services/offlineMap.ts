import {OfflineManager} from '@maplibre/maplibre-react-native';

export const BACOLOD_MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const BACOLOD_OFFLINE_PACK = 'dasig-bacolod-demo-v1';

export interface MapDownloadProgress {
  percentage: number;
  completedResources: number;
  requiredResources: number;
}

type ProgressListener = Parameters<typeof OfflineManager.subscribe>[1];
type ErrorListener = Parameters<typeof OfflineManager.subscribe>[2];

function waitForDownload(
  onProgress: (progress: MapDownloadProgress) => void,
  start: (progress: ProgressListener, failure: ErrorListener) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => OfflineManager.unsubscribe(BACOLOD_OFFLINE_PACK);
    const complete = () => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve();
    };
    const fail = (message: string) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error(message));
    };
    const progress: ProgressListener = (_pack, status) => {
      onProgress({
        percentage: status.percentage,
        completedResources: status.completedResourceCount,
        requiredResources: status.requiredResourceCount,
      });
      if (status.percentage >= 100) complete();
    };
    const failure: ErrorListener = (_pack, error) => fail(error.message);
    void start(progress, failure).catch(error =>
      fail(error instanceof Error ? error.message : 'The map download failed.'),
    );
  });
}

export async function hasBacolodMapPack(): Promise<boolean> {
  const pack = await OfflineManager.getPack(BACOLOD_OFFLINE_PACK);
  if (!pack) return false;
  return (await pack.status()).percentage >= 100;
}

export async function downloadBacolodMap(
  onProgress: (progress: MapDownloadProgress) => void,
): Promise<void> {
  const existing = await OfflineManager.getPack(BACOLOD_OFFLINE_PACK);
  if (existing) {
    const status = await existing.status();
    onProgress({
      percentage: status.percentage,
      completedResources: status.completedResourceCount,
      requiredResources: status.requiredResourceCount,
    });
    if (status.percentage < 100) {
      await waitForDownload(onProgress, async (progress, failure) => {
        await OfflineManager.subscribe(BACOLOD_OFFLINE_PACK, progress, failure);
        await existing.resume();
      });
    }
    return;
  }

  await waitForDownload(onProgress, (progress, failure) =>
    OfflineManager.createPack(
      {
        name: BACOLOD_OFFLINE_PACK,
        styleURL: BACOLOD_MAP_STYLE,
        // North-east then south-west, matching MapLibre RN v10.
        bounds: [
          [123.1, 10.75],
          [122.88, 10.56],
        ],
        minZoom: 10,
        maxZoom: 16,
        metadata: {city: 'bacolod', purpose: 'offline-voice-demo'},
      },
      progress,
      failure,
    ),
  );
}
