# DASIG

**Device-native Access-weighted Search for Informal-transit Guidance**

DASIG is a voice-first, offline jeepney journey planner for Bacolod. It can
understand a new spoken origin and destination, resolve local landmarks, and
calculate a journey of up to three jeepney rides entirely on an Android phone.

The name is also local: *dásig* means “quick” or “to do something with speed or
promptness” in Hiligaynon, the language widely spoken in Bacolod and Negros
Occidental.[^hiligaynon]

> **Demo claim:** DASIG does not merely cache old directions. It understands
> a new spoken trip request and calculates a new multi-jeepney journey entirely
> on the phone.

## One-minute demo

The one-minute Android emulator demo shows a
new trip being entered and calculated while the emulator is in airplane mode,
including local landmark matching, the downloaded Bacolod map, route and fare
results, and on-device spoken instructions.

![DASIG offline journey result](demo/DASIG-demo-poster.png)

## Why this exists

Cloud-only journey planners fail precisely when riders may need them most:
mobile data is unavailable, a connection is congested, or sending microphone
and location data to a remote service is undesirable. DASIG keeps the
interactive path local:

```text
microphone
  -> Android on-device speech recognition
  -> constrained local intent parser
  -> fuzzy landmark index
  -> DASIG route search
  -> route, fare and landmark instructions
  -> Android offline text-to-speech
```

The server is not consulted when a rider asks for directions. It is used only
while online to publish optional, versioned route-data updates.

## What works offline

- A 24-route Bacolod jeepney network is bundled in the APK.
- Speech recognition uses Android's explicit
  `createOnDeviceSpeechRecognizer` API; the app refuses a network-recognizer
  fallback.[^android-speech]
- Spoken phrases such as “from Ayala to SM City Bacolod” are parsed locally.
- Landmark aliases, fuzzy matching and ambiguity checks run locally.
- DASIG builds and searches the transit graph in TypeScript on the device.
- GPS can supply the origin without sending the coordinate to a server.
- MapLibre can download a bounded Bacolod map region in advance.[^maplibre]
- Spoken directions use an installed, non-network Android TTS voice.
- The bundled route graph remains usable on a fresh install with no server.

## System architecture

```text
                      ONLINE, OUTSIDE THE TRIP PATH

  Pack server   -> manifest(version, schema, SHA-256, byte size, URL)
                -> canonical published Bacolod GeoJSON
                                  |
                                  v
  phone: download -> verify exact bytes -> parse -> write versioned data
                                              -> move active pointer last

                      OFFLINE INTERACTIVE PATH

  speech/GPS/text -> local place resolution -> DASIG -> local map/TTS
                                                  |
                                                  v
                                      last verified route pack
```

The server is authoritative for published route revisions. The phone is
authoritative for which verified pack is active and for every journey computed
from it. Pack data is written before the active-version pointer, so an
interrupted, incompatible or corrupt download cannot replace the last working
network. See [`docs/OFFLINE_VOICE_ARCHITECTURE.md`](docs/OFFLINE_VOICE_ARCHITECTURE.md)
for the state machine and failure matrix.

### Run the optional route-pack publisher

The standalone repository includes the authoritative pack contract used by the
mobile updater. It is not involved in interactive trip planning.

```bash
python -m pip install -r server/requirements.txt
uvicorn server.main:app --reload
```

The default app build has no route-pack server configured. Deploy the included
publisher and set `ROUTE_PACK_SERVER` in `App.tsx` to its HTTPS origin to enable
optional updates.

## DASIG routing algorithm

### Lineage and naming

DASIG is a project-specific modification inspired by RAPTOR, the round-based
public-transit routing algorithm introduced by Daniel Delling, Thomas Pajor and
Renato F. Werneck.[^raptor-doi] RAPTOR is not Dijkstra-based: it advances one
round per transit leg and scans a route at most once per round. The original
paper solves a scheduled-transit problem and computes Pareto-optimal journeys
for arrival time and number of transfers.[^raptor-paper]

DASIG preserves the useful round-and-route-scan structure, but it is **not a
faithful RAPTOR implementation and is not presented as a new peer-reviewed
algorithm**. Bacolod jeepneys commonly operate without a machine-readable
timetable, so DASIG replaces timetable arrival labels with a spatial,
frequency-free generalized cost. Its implementation is in
[`src/domain/planner.ts`](src/domain/planner.ts).

### 1. Turn route geometry into a searchable network

Each route is an ordered GeoJSON `LineString` following the direction the
jeepney drives. A route that ends within 500 metres of its start is treated as
a circuit.

At app startup DASIG:

1. Measures cumulative distance along every route with the haversine formula.
2. Selects a virtual stop approximately every 100 metres of route geometry.
3. Stores each stop as `(route index, stop index)`; passes in opposite
   directions remain distinct even where they are geographically close.
4. Inserts stops into a roughly 0.003-degree spatial grid for local neighbour
   searches.
5. Precomputes walking transfers to nearby routes within 320 metres.
6. Indexes route anchors as locally searchable landmarks.

When a route passes the same area more than once, nearby stops separated by
more than three virtual-stop positions are treated as distinct passes. This
prevents the outward and return portions of a loop from collapsing into one
boarding choice.

### 2. Build access and egress candidates

For both the origin and destination, DASIG finds the nearest stop on every
distinct route pass within 750 metres. It keeps geographic passes separate,
which matters on loops and one-way street pairs.

The current implementation uses straight-line proximity during search. A 1.25
detour multiplier is applied to walking distances shown to the rider. It does
not claim to provide street-by-street pedestrian navigation.

### 3. Search in rounds

Round `r` represents a journey using exactly `r` jeepney rides. The demo is
bounded to three rounds.

For every active route in a round, `scanLine` performs a forward linear scan.
It carries the cheapest eligible boarding label and relaxes every later stop.
A ride must cover at least 250 metres. A circuit is scanned for two laps so a
rider can board near the end of the stored geometry and alight after the route
wraps through its terminal.

After each round:

- destination egress candidates are evaluated;
- predecessor labels are retained for journey reconstruction; and
- stops within 320 metres of another route seed the next round.

Simplified pseudocode:

```text
boards <- route passes near origin, weighted by access walk

for rides in 1..3:
    arrivals <- empty

    for each route with a board candidate:
        arrivals <- forward_scan(route, boards, minimum_ride = 250 m)
        if route is circular:
            allow one geometry wrap

    candidates[rides] <- best arrival that can walk to destination

    boards <- empty
    for each arrival:
        for each nearby route within 320 m:
            relax transfer with walk and transfer penalties

return fewest-ride candidate within 30% of the cheapest candidate
```

### 4. Optimize for informal, frequency-based transit

The search label is generalized distance cost rather than scheduled arrival
time:

```text
cost = ride_km
     + 2.2 * (origin_walk_km + destination_walk_km)
     + 3.0 * transfer_walk_km
     + 2.0 * transfer_count
```

| Component | Reason |
|---|---|
| Ride distance | A stable proxy when reliable schedules and headways are unavailable. |
| Access/egress × 2.2 | Avoids routes that save a small ride distance at the cost of a long walk. |
| Transfer walking × 3.0 | Transfer walks are less convenient and more uncertain than endpoint walks. |
| Transfer penalty +2.0 | Represents waiting, wayfinding and the risk of changing jeepneys. |

The constants are product heuristics, not learned parameters and not claims
about universal rider preference. They are intentionally centralized near the
top of `planner.ts` so they can be calibrated with field observations later.

### 5. Prefer a simpler journey when it is competitive

The cheapest candidate establishes a cost floor. Among candidates no more than
30% above that floor, DASIG chooses the one with the fewest rides, breaking a
tie by cost. This makes a direct jeep preferable to a marginally cheaper
multi-transfer result.

### 6. Reconstruct rider-facing directions

Back-pointers reconstruct every ride and transfer. Route anchors then provide:

- the signboard to look for;
- the direction or terminal heading;
- a nearby boarding landmark;
- a nearby alighting landmark; and
- the route geometry drawn on the offline map.

Time and fare are estimates layered on the selected path:

- jeepney movement: 12 km/h;
- walking: 4.8 km/h;
- initial boarding allowance: 6 minutes;
- each transfer: 8 minutes;
- regular jeepney fare: ₱14 for the first 4 km, then ₱2 per started kilometre.

These values are not live traffic, dispatch or fare feeds.

### How DASIG differs from published RAPTOR

| Published RAPTOR | DASIG modification |
|---|---|
| Scheduled trips and arrival-time labels | Ordered jeepney geometry with no timetable; generalized distance cost |
| Stops and routes from a transit timetable | Virtual stops sampled from GeoJSON corridors |
| Pareto set over arrival time and transfers | One recommended journey using a weighted cost and a simpler-trip rule |
| Transfer rounds are governed by the query | Hard maximum of three rides for predictable phone latency and usable results |
| Ordinary route sequences | Explicit two-lap handling for circular jeepney routes |
| Footpaths between known stops | Spatially generated access, transfer and egress links |
| Exact schedule semantics | Heuristic frequency-free planning with explicit rider warnings |

### Complexity

Let `S` be the number of virtual route stops, `T` the locally generated
transfer links and `K` the ride limit (`K = 3`). Once the spatial index and
transfers are built, the worst-case query work is approximately
`O(K * (S + T))`; route scanning is linear within each round. The spatial grid
keeps access and transfer neighbourhood checks local rather than comparing
every stop with every other stop.

## Local speech and place understanding

The runtime does not use an LLM.

1. Android's installed on-device recognizer converts audio to a transcript.
2. A constrained parser extracts either `from X to Y` or a destination-only
   request.
3. Place text is normalized and compared with downloaded anchors and aliases.
4. Matching combines exact/substring matches, token overlap and Levenshtein
   similarity.
5. A result must meet a confidence threshold and beat the runner-up by a
   minimum margin; otherwise the rider is asked to choose rather than receiving
   an invented location.

Raw audio and transcripts are not persisted or sent to analytics.

## Technology

| Layer | Technology |
|---|---|
| Mobile application | React Native 0.77, React 18, TypeScript |
| Local route planner | DASIG TypeScript implementation |
| On-device speech | Android `SpeechRecognizer` native Kotlin bridge |
| Spoken output | Android `TextToSpeech`, offline voice required |
| Maps | MapLibre React Native and a downloadable OpenFreeMap Liberty region |
| Local state | AsyncStorage plus MapLibre's offline database |
| Optional location | React Native Community Geolocation |
| Pack publication | Included FastAPI publisher, canonical GeoJSON, SHA-256 and ETag |
| Route data | Bundled Bacolod dataset assembled from cited public sources, including OpenStreetMap-derived geometry |

## Install the demo APK

Download the APK from the
[latest GitHub release](https://github.com/andrewnyu/dasig-offline-transit/releases/latest)
and install it on an Android 12+ phone.

## Run the development build

Requirements:

- Node.js 18+
- JDK 17+
- Android SDK 36
- Android 12+ for the explicit on-device recognizer API
- an installed Android offline English speech model and offline English TTS
  voice

```bash
npm install
npm run precheck
npm run android
```

## Build the self-contained demo APK

The release variant embeds the JavaScript and route data, so it does not need
Metro during the airplane-mode demonstration. It is signed with Android's
debug key for local hackathon installation only.

```bash
cd android
./gradlew assembleRelease
```

Output:

```text
android/app/build/outputs/apk/release/app-release.apk
```

## Airplane-mode demo

1. Install and open DASIG on an Android phone.
2. While online, install the device's offline speech/TTS languages.
3. Tap **Download map** and wait until the app says **Offline basemap ready**.
4. Enable airplane mode.
5. Tap **Speak a trip** and say “from Ayala to SM City Bacolod.”
6. Show the newly calculated route, ride count, fare, boarding landmark,
   alighting landmark and spoken instructions.
7. Change the request to demonstrate that the result was calculated rather
   than retrieved from a cache.

Typed landmark planning remains available if a particular phone has no
installed on-device speech service.

## Refresh the bundled route snapshot

```bash
python scripts/build_mobile_pack.py
```

Run this after approved Bacolod network changes and commit the generated JSON
with the app. Runtime pack updates remain independent of app releases.

## Verification

```bash
npm run typecheck
npm test -- --runInBand

python -m pip install -r server/requirements-dev.txt
pytest -q server
```

Automated coverage includes one-, two- and three-jeep journeys, out-of-coverage
failure, voice-intent parsing, aliases, SHA-256 vectors, pointer-last pack
activation and corrupt-download fallback. The release APK has also been
installed on an Android 16 emulator and used to calculate Ayala to SM while
airplane mode was enabled.

## Hackathon submission copy

### Short project description

> **DASIG is an offline, voice-first jeepney copilot for Bacolod. It
> uses on-device speech recognition, local landmark matching and a
> RAPTOR-inspired algorithm to calculate new journeys of up to three jeepney
> rides without sending the rider's voice, location or trip request to the
> cloud.**

### Technical disclosures

> DASIG is an Android-first React Native 0.77 application written in TypeScript
> and Kotlin. Runtime AI is the Android device's installed on-device speech
> recognition model; the exact model is supplied by the device/OS and was not
> trained or bundled by the project. The runtime uses no LLM and calls no cloud
> AI API. Landmark resolution is deterministic fuzzy matching, and routing is a
> deterministic TypeScript algorithm called DASIG: a frequency-free,
> access-weighted modification inspired by the published RAPTOR algorithm. The
> app uses MapLibre React Native, OpenFreeMap map styles/tiles, AsyncStorage,
> React Native Community Geolocation and Android TextToSpeech. The existing
> The app includes a small FastAPI route-pack publisher and a Bacolod route
> dataset assembled from the public sources cited in this repository. Some
> route and basemap geometry derives from OpenStreetMap and is
> subject to ODbL attribution/share-alike requirements. OpenAI Codex was used as
> a development assistant for implementation, refactoring, testing and
> documentation; the shipped app does not connect to OpenAI. Route geometry,
> fare, duration and walking distances are estimates and must be confirmed by
> riders before boarding.

## Technical limitations and safety disclosures

- Route coverage is Bacolod-only and is limited to the bundled or last verified
  route pack.
- Some corridors are inferred from route plans rather than field-verified GPS
  traces.
- Service availability, signboards, direction, traffic and fares can change.
- Walking legs use straight-line distance with a detour factor, not an offline
  pedestrian street graph.
- A map region and Android speech/TTS voices must be downloaded before losing
  connectivity; route calculation itself works without the basemap.
- On-device speech availability and accuracy vary by Android version, device,
  installed language pack and ambient noise.
- The APK is hackathon-signed. A production release needs a private signing key,
  dependency/security review, accessibility QA and physical-device coverage.
- The pinned React Native toolchain has known non-critical transitive audit
  findings; see [`SECURITY.md`](SECURITY.md) for the upgrade and reporting
  policy.
- DASIG is a practical heuristic adaptation, not a claim of optimality under a
  timetable, real traffic, vehicle capacity or live dispatch conditions.

## Sources, licences and attribution

1. Delling, D., Pajor, T. and Werneck, R. F., “Round-Based Public Transit
   Routing,” *ALENEX 2012*, pp. 130–140,
   [doi:10.1137/1.9781611972924.13](https://epubs.siam.org/doi/10.1137/1.9781611972924.13).
2. The authors' [RAPTOR paper hosted by Microsoft Research](https://www.microsoft.com/en-us/research/wp-content/uploads/2012/01/raptor_alenex.pdf)
   describes the round-based dynamic program, route scans, McRAPTOR and
   rRAPTOR.
3. Android Developers,
   [`SpeechRecognizer`](https://developer.android.com/reference/android/speech/SpeechRecognizer.html),
   including `isOnDeviceRecognitionAvailable` and
   `createOnDeviceSpeechRecognizer`.
4. MapLibre React Native,
   [`OfflineManager`](https://maplibre.org/maplibre-react-native/docs/modules/offline-manager/),
   for bounded offline map packs and progress/error events.
5. OpenStreetMap Foundation,
   [Copyright and License](https://www.openstreetmap.org/copyright). OpenStreetMap
   data is available under the Open Database License; retain the required
   `© OpenStreetMap contributors` attribution.
6. OpenFreeMap,
   [licence summary](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md).
   The service uses OpenStreetMap data and open-source OpenMapTiles/styles with
   their respective licences.
7. Motus, C., *Hiligaynon Dictionary* (1971), entry for *dásig*, p. 82,
   [digitized PDF](https://zorc.net/rdzorc/Hiligaynon%3DIlonggo/HiligaynonDictionary%28Motus-PALI%29-1971.pdf).

The application code follows the repository's MIT licence. Route data that
contains OpenStreetMap-derived geometry remains subject to the ODbL; see the
[`DATA_LICENSE.md`](DATA_LICENSE.md) and individual route
`source_url`/`attribution` fields.

[^hiligaynon]: Motus, *Hiligaynon Dictionary* (1971), p. 82, defines *dásig* as
    “quickly, faster,” “fast, quick,” and “to do something with speed and
    promptness.”
[^android-speech]: Android's official `SpeechRecognizer` documentation states
    that the explicit on-device factory was added in API level 31 and provides
    a corresponding availability check.
[^maplibre]: MapLibre's `OfflineManager` creates bounded packs and reports
    asynchronous progress and errors. Tile-host terms and attribution still
    apply.
[^raptor-doi]: Delling, Pajor and Werneck, ALENEX 2012,
    [doi:10.1137/1.9781611972924.13](https://doi.org/10.1137/1.9781611972924.13).
[^raptor-paper]: The original paper's objective is scheduled arrival time and
    transfers. DASIG's distance cost is a project-specific heuristic.
