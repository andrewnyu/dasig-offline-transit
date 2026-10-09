# DASIG offline voice architecture

## Authority and boundaries

The optional pack server is authoritative for published route geometry and revisions.
The mobile app is authoritative only for its local pack activation and for trip
calculations made from that verified snapshot. Voice output cannot create or
modify a route.

```text
ONLINE UPDATE
mobile -> manifest API -> published live network
mobile <- version + SHA-256 + URL
mobile -> network API
mobile <- canonical GeoJSON bytes
mobile: hash -> parse -> build graph -> atomically activate

OFFLINE REQUEST
microphone -> on-device ASR -> constrained intent parser
           -> local landmark index -> local route graph
           -> route result -> map + on-device TTS
```

## Pack state machine

```text
BUNDLED/READY -> CHECKING -> DOWNLOADING -> VERIFYING -> READY(new version)
                    |             |             |
                    +-------------+-------------+-> FAILED
                                                     |
                                                     +-> previous READY pack
```

Versioned pack data is written first. The active-version pointer is written
last and acts as the commit. On corruption, interruption, timeout, or schema
mismatch the app retains the previous verified version.

## Server contract

`GET /api/offline-packs/bacolod/manifest`

```json
{
  "schema_version": 1,
  "city": "bacolod",
  "version": "12-character hash prefix",
  "sha256": "hash of exact network response bytes",
  "size_bytes": 123456,
  "network_url": "https://…/api/offline-packs/bacolod/network",
  "source": "published DASIG route network"
}
```

`GET /api/offline-packs/bacolod/network` returns canonical GeoJSON with `ETag`
and `X-Content-SHA256`. `If-None-Match` is supported.

## Local persistence

```text
dasig:offline-pack:bacolod:data:<version> -> immutable GeoJSON string
dasig:offline-pack:bacolod:active         -> verified active version
MapLibre offline database                 -> separately managed basemap tiles
```

The bundled GeoJSON is always the final recovery path.

## Truthful UX states

- **Routes ready:** a bundled or downloaded graph can calculate trips locally.
- **Offline basemap ready:** MapLibre reports the city tile pack complete.
- **Offline voice unavailable:** the device has no installed local recognizer;
  typed offline planning remains available.
- **No connection found:** the local graph found no path within its configured
  walking radii. The app does not call a cloud model or invent a route.
- **Estimated walk:** pedestrian streets were not calculated offline.

## Reliability and privacy

- Route-pack calls have no role in the interactive planning path.
- Exact response bytes are SHA-256 verified before parsing or activation.
- Unknown schema versions fail closed to the current pack.
- Voice is requested through Android's explicit on-device recognizer.
- Raw audio and transcripts are not persisted or sent to analytics.
- Location is requested only on a deliberate tap and remains on the device.

## Observability

Production telemetry, if enabled later, should contain only pack version,
update state, route calculation duration, ride count, and coarse error code.
It must not contain raw speech, exact GPS coordinates, or named origin and
destination without explicit consent.

## Test matrix

| Scenario | Expected result |
|---|---|
| Fresh install, airplane mode | Bundled routes and typed planning work |
| Voice model missing | Clear unavailable state; typed planning works |
| Known spoken places | Local transcript resolves and route is calculated |
| Ambiguous/unknown place | User selects a local match; no invented place |
| Server unavailable | Last verified or bundled pack remains active |
| Corrupt download | Hash rejection; active version unchanged |
| Interrupted write | Active pointer still names the old pack |
| New valid publication | New graph activates only after verification |
| Map pack absent | Route overlay works; basemap-download message shown |
| Three-ride journey | Planner stops at the configured three-ride maximum |
