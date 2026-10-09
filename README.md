# DASIG

**Offline, voice-first jeepney directions for Bacolod.**

*Dásig* means "quick" in Hiligaynon. Ask DASIG for a trip and it plans the
jeepney ride on the phone. It works with no signal, no data and no server.

▶️ **[Watch the 1-minute demo](https://youtube.com/shorts/7woZYkujRPg)** ·
📦 **[Download the APK](https://github.com/andrewnyu/dasig-offline-transit/releases/latest)**

![DASIG offline journey result](demo/DASIG-demo-poster.png)

## Goals

- **Work when the network doesn't.** Riders often lose data exactly when they
  need directions. Every step of trip planning runs on the device.
- **Make jeepneys understandable.** Bacolod's routes have no timetables or
  official stops. DASIG tells you which jeep to ride, where to board, which
  way it goes, the fare and how far you'll walk.
- **Keep it private.** Your voice and location never leave the phone.
- **Plan new trips, not cached ones.** Each request is calculated fresh, even
  in airplane mode.

## How it works

```text
voice / text / GPS -> on-device speech recognition -> local landmark matching
                   -> DASIG route search -> map + fare + spoken directions
```

- **Speech in:** Android's on-device speech recognizer. It never falls back
  to the cloud.
- **Place matching:** fuzzy matching against Bacolod landmarks and nicknames
  (for example, "USLS" becomes La Salle).
- **Routing:** DASIG, a round-based search inspired by the RAPTOR algorithm
  and adapted for jeepneys with no timetable. It turns route paths into
  virtual stops, plans up to three rides and weighs walking and transfers.
- **Map:** MapLibre with a Bacolod map region downloaded ahead of time.
- **Speech out:** Android's offline text-to-speech.
- **Data:** 24 Bacolod jeepney routes bundled in the app. An optional server
  publishes verified route updates; the app never needs it to plan a trip.

The app uses no LLM and no cloud AI.

## Tech stack

| | |
|---|---|
| App | React Native 0.77, TypeScript, Kotlin (native speech bridge) |
| Maps | MapLibre React Native, OpenFreeMap tiles |
| Route updates (optional) | Python, FastAPI |
| Data | Bacolod route plan + OpenStreetMap |

## Run it

Requires Node 18+, JDK 17+, the Android SDK and Android 12+.

```bash
npm install
npm run android
```

Build a standalone APK with `cd android && ./gradlew assembleRelease`.

## Limitations

Coverage is Bacolod only, and some routes are inferred from the city route
plan. Fares, times and walking distances are estimates, so confirm the
signboard and fare before boarding.

## More

- [Technical details and the DASIG algorithm](docs/TECHNICAL_DETAILS.md)
- [Offline voice architecture](docs/OFFLINE_VOICE_ARCHITECTURE.md)
- [Route data sources](docs/DATA_SOURCES.md)

Code is MIT licensed. Route and map data include OpenStreetMap data
(© OpenStreetMap contributors, ODbL). See [DATA_LICENSE.md](DATA_LICENSE.md).
