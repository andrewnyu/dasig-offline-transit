# Route and map data licence

The application source code is released under the repository's MIT licence.
That licence does not replace the licences attached to route and basemap data.

The files below contain data derived partly from OpenStreetMap:

- `data/jeepney_network.geojson`
- `src/data/bacolod-network.json`

OpenStreetMap data is © OpenStreetMap contributors and is made available under
the [Open Data Commons Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
Redistributors must preserve the required attribution and comply with the
ODbL's share-alike requirements where they apply. See the
[OpenStreetMap copyright page](https://www.openstreetmap.org/copyright).

The in-app basemap uses OpenFreeMap and its Liberty style. OpenFreeMap's project
code is MIT licensed; its OpenMapTiles code and styles retain their respective
BSD and CC BY licences, and the underlying map data is from OpenStreetMap. See
the [OpenFreeMap licence summary](https://github.com/hyperknot/openfreemap/blob/main/LICENSE.md).

Detailed Bacolod references and known gaps are recorded in
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md). Individual GeoJSON features also
carry `source_url`, `osm_relations` and `attribution` metadata when available.
