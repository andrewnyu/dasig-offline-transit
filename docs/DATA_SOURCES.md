# Bacolod route-data sources

DASIG shows route references, not live navigation or official stops. Every
line is a best estimate. Riders must confirm the signboard, direction, current
service, safe boarding point and fare locally.

## Coverage

The pack contains 24 Bacolod routes. Lines 1–3, 5–11 and 16 include geometry
from OpenStreetMap public-transport relations mapped street by street. Other
lines are inferred from the Bacolod Local Public Transport Route Plan's route
names, lengths and landmark sequence, routed along OpenStreetMap roads.

The `status` property on each GeoJSON feature distinguishes
`osm_route_relation` from `inferred_from_lptrp_anchors`. Each feature also
retains its `source_url`, OpenStreetMap relation identifiers where applicable,
and attribution.

## Primary references

- [Bacolod City Ordinance No. 966 (2021)](https://bacolodcity.gov.ph/wp-content/uploads/2022/07/CO-966-2021.pdf)
  contains the adopted route plan's routes, modes and authorised units.
- [LTFRB approval of the Bacolod route plan](https://www.pna.gov.ph/articles/1084457)
  describes Memorandum Circular 2022-010 and the 24 approved routes.
- [Bacolod LPTRP study, Table 1 and Figure 2](https://ncts.upd.edu.ph/tssp/wp-content/uploads/2024/01/TSSP2023-09-Tiglao-1.pdf)
  provides route names, planned lengths and a schematic map.
- [Bacolod City route notice](https://bacolodcity.gov.ph/updated-routes-under-the-local-public-transport-route-plan-lptrp/)
  documents the 2023 simulation routes.
- [Bacolod City 2025 LPTRP consultation](https://bacolodcity.gov.ph/bacolod-city-holds-local-public-transport-route-plan-lptrp-public-consultation-2025/)
  shows that planning remains subject to revision.
- OpenStreetMap route relations provide mapped geometry for 11 routes. An
  [example relation](https://www.openstreetmap.org/relation/14998328) is tagged
  with the relevant operator and route-plan references.

## Known gaps

- Lines 4, 12–15 and 17–24 do not yet have complete mapped public-transport
  relations, so their detailed paths are inferred.
- The OpenStreetMap relation used for line 7 is shorter than the published
  planned length and may be incomplete.
- Some return paths are inferred by reversing the landmark order while using
  roads that respect known one-way restrictions.
- Routes, traffic operations, boarding practices and fares can change after a
  pack is published.

## Licence

OpenStreetMap-derived geometry is © OpenStreetMap contributors and available
under the Open Database License. See [`../DATA_LICENSE.md`](../DATA_LICENSE.md)
and the attribution fields embedded in `data/jeepney_network.geojson`.
