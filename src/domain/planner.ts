import type {
  Anchor,
  Coordinate,
  NetworkFeature,
  NetworkGeoJSON,
  PlannedTrip,
  Point,
  RouteLeg,
  RouteStop,
} from './types';

const WALK_WEIGHT = 2.2;
const TRANSFER_WALK_WEIGHT = 3.0;
const TRANSFER_PENALTY = 2.0;
const MAX_ACCESS_WALK_KM = 0.75;
const MAX_TRANSFER_WALK_KM = 0.32;
const MIN_RIDE_KM = 0.25;
const MAX_RIDES = 3;
const STOP_SPACING_KM = 0.1;
const PASS_GAP_STOPS = 3;
const GRID_DEGREES = 0.003;
const PREFER_FEWER_RIDES_RATIO = 1.3;
const STRAIGHT_LINE_DETOUR = 1.25;
const LANDMARK_RADIUS_KM = 0.35;
const RIDE_KMH = 12;
const WALK_KMH = 4.8;
const BOARDING_MINUTES = 6;
const TRANSFER_MINUTES = 8;
const FARE_BASE_PHP = 14;
const FARE_BASE_KM = 4;
const FARE_PER_KM_PHP = 2;

type Stop = [number, number]; // line index, stop index

interface Line {
  id: string;
  number: string;
  name: string;
  color: string;
  status: string;
  sourceUrl?: string;
  mode: string;
  coordinates: Coordinate[];
  cumulativeKm: number[];
  anchors: Anchor[];
  returnAnchors: Anchor[];
  circuit: boolean;
  turnaroundKm: number | null;
}

interface NearbyStop {
  walkKm: number;
  line: number;
  stop: number;
}

interface Transfer extends NearbyStop {}

interface Graph {
  lines: Line[];
  stops: number[][];
  stopKm: number[][];
  grid: Map<string, Stop[]>;
  transfers: Map<string, Transfer[]>;
}

interface BoardEntry {
  cost: number;
  previous: Stop | null;
  walkKm: number;
}

interface Label {
  cost: number;
  board: number;
  previous: Stop | null;
  walkKm: number;
}

interface Ride {
  line: number;
  board: number;
  alight: number;
}

interface Journey {
  rides: Ride[];
  rideKms: number[];
  fares: Array<number | null>;
  walks: number[];
  rideKm: number;
  walkKm: number;
  accessWalkKm: number;
  rideMinutes: number;
  durationMinutes: number;
  farePhp: number | null;
  cost: number;
}

export interface OfflinePlanner {
  plan(origin: Point, destination: Point): PlannedTrip | null;
  landmarks: Anchor[];
  network: NetworkGeoJSON;
}

const rounded = (value: number, digits = 2): number =>
  Number(value.toFixed(digits));

export function distanceKm(a: Point, b: Point): number {
  const radius = 6371;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = radians(b.lat - a.lat);
  const dLng = radians(b.lng - a.lng);
  const value =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.lat)) *
      Math.cos(radians(b.lat)) *
      Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(value));
}

const coordinatePoint = ([lng, lat]: Coordinate): Point => ({lat, lng});

function cumulativeDistances(coordinates: Coordinate[]): number[] {
  const cumulative = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulative.push(
      cumulative[index - 1] +
        distanceKm(
          coordinatePoint(coordinates[index - 1]),
          coordinatePoint(coordinates[index]),
        ),
    );
  }
  return cumulative;
}

function nearestCoordinateKm(coordinates: Coordinate[], anchor: Anchor): number {
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  coordinates.forEach((coordinate, index) => {
    const candidate = distanceKm(coordinatePoint(coordinate), anchor);
    if (candidate < bestDistance) {
      bestDistance = candidate;
      bestIndex = index;
    }
  });
  return cumulativeDistances(coordinates)[bestIndex];
}

function makeLine(feature: NetworkFeature): Line {
  const properties = feature.properties;
  const coordinates = feature.geometry.coordinates;
  const cumulativeKm = cumulativeDistances(coordinates);
  const anchors = (properties.anchors ?? []).filter(
    anchor => !anchor.name.toLowerCase().includes('endpoint'),
  );
  const start = coordinatePoint(coordinates[0]);
  const end = coordinatePoint(coordinates[coordinates.length - 1]);
  const circuit = distanceKm(start, end) < 0.5;
  return {
    id: properties.id,
    number: String(properties.number),
    name: properties.name,
    color: properties.color,
    status: properties.status,
    sourceUrl: properties.source_url,
    mode: properties.mode ?? 'jeepney',
    coordinates,
    cumulativeKm,
    anchors,
    returnAnchors: (properties.return_anchors ?? []).filter(
      anchor => !anchor.name.toLowerCase().includes('endpoint'),
    ),
    circuit,
    turnaroundKm:
      anchors.length >= 2
        ? nearestCoordinateKm(coordinates, anchors[anchors.length - 1])
        : null,
  };
}

function stopIndexes(line: Line): number[] {
  const indexes = [0];
  let nextKm = STOP_SPACING_KM;
  line.cumulativeKm.forEach((km, index) => {
    if (km >= nextKm) {
      indexes.push(index);
      nextKm = km + STOP_SPACING_KM;
    }
  });
  if (indexes[indexes.length - 1] !== line.coordinates.length - 1) {
    indexes.push(line.coordinates.length - 1);
  }
  return indexes;
}

const gridCell = (lat: number, lng: number): [number, number] => [
  Math.floor(lat / GRID_DEGREES),
  Math.floor(lng / GRID_DEGREES),
];
const cellKey = (row: number, column: number): string => `${row}:${column}`;
const stopKey = ([line, stop]: Stop): string => `${line}:${stop}`;

function graphPoint(graph: Graph, [line, stop]: Stop): Point {
  return coordinatePoint(graph.lines[line].coordinates[graph.stops[line][stop]]);
}

function nearby(
  graph: Graph,
  point: Point,
  radiusKm: number,
): NearbyStop[] {
  const [row, column] = gridCell(point.lat, point.lng);
  const reach = Math.ceil(radiusKm / (GRID_DEGREES * 108));
  const latitudeKm = 110.57;
  const longitudeKm = 111.32 * Math.cos((point.lat * Math.PI) / 180);
  const found: NearbyStop[] = [];
  for (let rowOffset = -reach; rowOffset <= reach; rowOffset += 1) {
    for (let columnOffset = -reach; columnOffset <= reach; columnOffset += 1) {
      const members =
        graph.grid.get(cellKey(row + rowOffset, column + columnOffset)) ?? [];
      members.forEach(([line, stop]) => {
        const candidate = graphPoint(graph, [line, stop]);
        const walkKm = Math.hypot(
          (candidate.lat - point.lat) * latitudeKm,
          (candidate.lng - point.lng) * longitudeKm,
        );
        if (walkKm <= radiusKm) {
          found.push({walkKm, line, stop});
        }
      });
    }
  }
  return found;
}

function nearestPerLine(
  graph: Graph,
  point: Point,
  radiusKm: number,
  excludedLine = -1,
): NearbyStop[] {
  const byLine = new Map<number, Array<{stop: number; walkKm: number}>>();
  nearby(graph, point, radiusKm).forEach(candidate => {
    if (candidate.line === excludedLine) {
      return;
    }
    const entries = byLine.get(candidate.line) ?? [];
    entries.push({stop: candidate.stop, walkKm: candidate.walkKm});
    byLine.set(candidate.line, entries);
  });

  const result: NearbyStop[] = [];
  for (const [line, entries] of byLine.entries()) {
    entries.sort((a, b) => a.stop - b.stop);
    let best: {stop: number; walkKm: number} | null = null;
    let previous: number | null = null;
    for (const entry of entries) {
      if (
        previous !== null &&
        entry.stop - previous > PASS_GAP_STOPS &&
        best
      ) {
        result.push({line, stop: best.stop, walkKm: best.walkKm});
        best = null;
      }
      if (!best || entry.walkKm < best.walkKm) {
        best = entry;
      }
      previous = entry.stop;
    }
    if (best) {
      result.push({line, stop: best.stop, walkKm: best.walkKm});
    }
  }
  return result;
}

function buildGraph(lines: Line[]): Graph {
  const stops = lines.map(stopIndexes);
  const grid = new Map<string, Stop[]>();
  lines.forEach((line, lineIndex) => {
    stops[lineIndex].forEach((coordinateIndex, stopIndex) => {
      const [lng, lat] = line.coordinates[coordinateIndex];
      const [row, column] = gridCell(lat, lng);
      const key = cellKey(row, column);
      const members = grid.get(key) ?? [];
      members.push([lineIndex, stopIndex]);
      grid.set(key, members);
    });
  });
  const graph: Graph = {
    lines,
    stops,
    stopKm: lines.map((line, lineIndex) =>
      stops[lineIndex].map(index => line.cumulativeKm[index]),
    ),
    grid,
    transfers: new Map(),
  };
  stops.forEach((lineStops, line) => {
    lineStops.forEach((_coordinate, stop) => {
      const transfers = nearestPerLine(
        graph,
        graphPoint(graph, [line, stop]),
        MAX_TRANSFER_WALK_KM,
        line,
      );
      if (transfers.length) {
        graph.transfers.set(stopKey([line, stop]), transfers);
      }
    });
  });
  return graph;
}

function scanLine(
  stopKm: number[],
  boards: Map<number, number>,
  circuitKm: number | null,
): Map<number, {cost: number; board: number}> {
  const count = stopKm.length;
  const laps = circuitKm ? 2 : 1;
  const km: number[] = [];
  const boardCosts: number[] = [];
  for (let lap = 0; lap < laps; lap += 1) {
    stopKm.forEach((value, index) => {
      km.push(value + lap * (circuitKm ?? 0));
      boardCosts.push(lap === 0 ? boards.get(index) ?? Infinity : Infinity);
    });
  }
  const best = Array.from({length: count}, () => ({cost: Infinity, board: -1}));
  let running = Infinity;
  let runningStop = -1;
  let scan = 0;
  for (let position = 0; position < km.length; position += 1) {
    while (scan < km.length && km[scan] <= km[position] - MIN_RIDE_KM) {
      if (boardCosts[scan] - km[scan] < running) {
        running = boardCosts[scan] - km[scan];
        runningStop = scan;
      }
      scan += 1;
    }
    const stop = position % count;
    const cost = running + km[position];
    if (cost < best[stop].cost) {
      best[stop] = {cost, board: runningStop};
    }
  }
  const result = new Map<number, {cost: number; board: number}>();
  best.forEach((value, stop) => {
    if (Number.isFinite(value.cost)) {
      result.set(stop, {...value, board: value.board % count});
    }
  });
  return result;
}

function rideKm(graph: Graph, ride: Ride): number {
  const km = graph.stopKm[ride.line];
  return ride.alight >= ride.board
    ? km[ride.alight] - km[ride.board]
    : km[km.length - 1] - km[ride.board] + km[ride.alight];
}

function fare(rideDistanceKm: number, mode: string): number | null {
  if (mode !== 'jeepney') {
    return null;
  }
  return (
    FARE_BASE_PHP +
    FARE_PER_KM_PHP *
      Math.ceil(rounded(Math.max(0, rideDistanceKm - FARE_BASE_KM), 3))
  );
}

function makeJourney(
  graph: Graph,
  rounds: Array<Map<string, Label>>,
  finishStop: Stop,
  endWalk: number,
): Journey {
  const rides: Ride[] = [];
  const walks = [endWalk];
  let current = finishStop;
  for (let round = rounds.length - 1; round >= 0; round -= 1) {
    const label = rounds[round].get(stopKey(current));
    if (!label) {
      continue;
    }
    rides.push({line: current[0], board: label.board, alight: current[1]});
    walks.push(label.walkKm);
    if (!label.previous) {
      break;
    }
    current = label.previous;
  }
  rides.reverse();
  walks.reverse();
  const rideKms = rides.map(ride => rideKm(graph, ride));
  const fares = rides.map((ride, index) =>
    fare(rideKms[index], graph.lines[ride.line].mode),
  );
  const adjustedWalks = walks.map(walk => walk * STRAIGHT_LINE_DETOUR);
  const totalRideKm = rideKms.reduce((sum, value) => sum + value, 0);
  const totalWalkKm = adjustedWalks.reduce((sum, value) => sum + value, 0);
  const accessWalkKm = adjustedWalks[0] + adjustedWalks[adjustedWalks.length - 1];
  const rideMinutes = Math.max(
    6,
    Math.round(
      (totalRideKm / RIDE_KMH) * 60 +
        BOARDING_MINUTES +
        TRANSFER_MINUTES * (rides.length - 1),
    ),
  );
  const farePhp = fares.some(value => value === null)
    ? null
    : (fares as number[]).reduce((sum, value) => sum + value, 0);
  return {
    rides,
    rideKms,
    fares,
    walks: adjustedWalks,
    rideKm: totalRideKm,
    walkKm: totalWalkKm,
    accessWalkKm,
    rideMinutes,
    durationMinutes: rideMinutes + Math.round((totalWalkKm / WALK_KMH) * 60),
    farePhp,
    cost:
      totalRideKm +
      accessWalkKm * WALK_WEIGHT +
      (totalWalkKm - accessWalkKm) * TRANSFER_WALK_WEIGHT +
      (rides.length - 1) * TRANSFER_PENALTY,
  };
}

function search(graph: Graph, origin: Point, destination: Point): Journey[] {
  const egress = nearestPerLine(graph, destination, MAX_ACCESS_WALK_KM);
  let boards = new Map<number, Map<number, BoardEntry>>();
  nearestPerLine(graph, origin, MAX_ACCESS_WALK_KM).forEach(candidate => {
    const lineBoards = boards.get(candidate.line) ?? new Map();
    lineBoards.set(candidate.stop, {
      cost: candidate.walkKm * WALK_WEIGHT,
      previous: null,
      walkKm: candidate.walkKm,
    });
    boards.set(candidate.line, lineBoards);
  });

  const rounds: Array<Map<string, Label>> = [];
  const journeys: Journey[] = [];
  for (let rideCount = 1; rideCount <= MAX_RIDES; rideCount += 1) {
    if (!boards.size || !egress.length) {
      break;
    }
    const arrivals = new Map<string, Label>();
    boards.forEach((lineBoards, line) => {
      const costs = new Map<number, number>();
      lineBoards.forEach((entry, stop) => costs.set(stop, entry.cost));
      const circuitKm = graph.lines[line].circuit
        ? graph.stopKm[line][graph.stopKm[line].length - 1]
        : null;
      scanLine(graph.stopKm[line], costs, circuitKm).forEach(
        ({cost, board}, stop) => {
          const entry = lineBoards.get(board);
          if (entry) {
            arrivals.set(stopKey([line, stop]), {
              cost,
              board,
              previous: entry.previous,
              walkKm: entry.walkKm,
            });
          }
        },
      );
    });
    rounds.push(arrivals);

    let finish: {cost: number; stop: Stop; walkKm: number} | null = null;
    for (const candidate of egress) {
      const label = arrivals.get(stopKey([candidate.line, candidate.stop]));
      if (!label) {
        continue;
      }
      const cost = label.cost + candidate.walkKm * WALK_WEIGHT;
      if (!finish || cost < finish.cost) {
        finish = {
          cost,
          stop: [candidate.line, candidate.stop],
          walkKm: candidate.walkKm,
        };
      }
    }
    if (finish) {
      journeys.push(makeJourney(graph, rounds, finish.stop, finish.walkKm));
    }

    const nextBoards = new Map<number, Map<number, BoardEntry>>();
    arrivals.forEach((label, key) => {
      const [line, stop] = key.split(':').map(Number) as Stop;
      (graph.transfers.get(key) ?? []).forEach(transfer => {
        const cost =
          label.cost +
          transfer.walkKm * TRANSFER_WALK_WEIGHT +
          TRANSFER_PENALTY;
        const lineBoards = nextBoards.get(transfer.line) ?? new Map();
        const current = lineBoards.get(transfer.stop);
        if (!current || cost < current.cost) {
          lineBoards.set(transfer.stop, {
            cost,
            previous: [line, stop],
            walkKm: transfer.walkKm,
          });
          nextBoards.set(transfer.line, lineBoards);
        }
      });
    });
    boards = nextBoards;
  }
  return journeys;
}

const streetName = /\b(St|Rd|Ave|Street|Road|Avenue|Drive|Blvd)\b\.?/i;

function nearestLandmark(anchors: Anchor[], point: Point): string | null {
  const candidates = anchors
    .map(anchor => ({
      anchor,
      distance: distanceKm(anchor, point),
      street: streetName.test(anchor.name),
    }))
    .filter(candidate => candidate.distance <= LANDMARK_RADIUS_KM)
    .sort((a, b) => Number(a.street) - Number(b.street) || a.distance - b.distance);
  return candidates[0]?.anchor.name ?? null;
}

function routeStop(graph: Graph, anchors: Anchor[], stop: Stop): RouteStop {
  const point = graphPoint(graph, stop);
  const landmark = nearestLandmark(anchors, point);
  return {
    ...point,
    landmark,
    label: landmark ? `near ${landmark}` : null,
  };
}

function sliceCoordinates(line: Line, start: number, end: number): Coordinate[] {
  if (start <= end) {
    return line.coordinates.slice(start, end + 1);
  }
  return [...line.coordinates.slice(start), ...line.coordinates.slice(1, end + 1)];
}

function signboard(line: Line): string {
  const withoutVia = line.name.split(' via ')[0];
  return withoutVia.endsWith(' Loop')
    ? withoutVia.slice(0, -' Loop'.length)
    : withoutVia;
}

function heading(line: Line, alightKm: number): string | null {
  if (line.anchors.length < 2 || line.turnaroundKm === null) {
    return null;
  }
  if (!line.circuit || alightKm <= line.turnaroundKm) {
    return line.anchors[line.anchors.length - 1].name;
  }
  return line.anchors[0].name;
}

function toPlannedTrip(
  graph: Graph,
  anchors: Anchor[],
  journey: Journey,
): PlannedTrip {
  const legs: RouteLeg[] = journey.rides.map((ride, index) => {
    const line = graph.lines[ride.line];
    const startCoordinate = graph.stops[ride.line][ride.board];
    const endCoordinate = graph.stops[ride.line][ride.alight];
    return {
      routeId: line.id,
      routeNumber: line.number,
      routeName: line.name,
      color: line.color,
      signboard: signboard(line),
      heading: heading(line, graph.stopKm[ride.line][ride.alight]),
      board: routeStop(graph, anchors, [ride.line, ride.board]),
      alight: routeStop(graph, anchors, [ride.line, ride.alight]),
      geometry: {
        type: 'LineString',
        coordinates: sliceCoordinates(line, startCoordinate, endCoordinate),
      },
      roadDistanceKm: rounded(journey.rideKms[index]),
      rideMinutes: Math.max(1, Math.round((journey.rideKms[index] / RIDE_KMH) * 60)),
      farePhp: journey.fares[index],
    };
  });
  return {
    city: 'bacolod',
    rideCount: legs.length,
    lines: legs.map(leg => ({
      id: leg.routeId,
      number: leg.routeNumber,
      name: leg.routeName,
      color: leg.color,
    })),
    legs,
    originWalkKm: rounded(journey.walks[0]),
    destinationWalkKm: rounded(journey.walks[journey.walks.length - 1]),
    transferWalkKm: rounded(journey.walkKm - journey.accessWalkKm),
    rideKm: rounded(journey.rideKm),
    walkKm: rounded(journey.walkKm),
    durationMinutes: journey.durationMinutes,
    farePhp: journey.farePhp,
    walkBasis: 'estimated',
    note:
      'Calculated entirely on this device from the downloaded DASIG route pack. Confirm the signboard and direction before boarding.',
  };
}

function uniqueLandmarks(lines: Line[]): Anchor[] {
  const byName = new Map<string, Anchor>();
  lines.forEach(line => {
    [...line.anchors, ...line.returnAnchors].forEach(anchor => {
      if (!byName.has(anchor.name)) {
        byName.set(anchor.name, anchor);
      }
    });
  });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createOfflinePlanner(network: NetworkGeoJSON): OfflinePlanner {
  if (network.type !== 'FeatureCollection' || network.features.length === 0) {
    throw new Error('The Bacolod route pack is empty or invalid.');
  }
  const lines = network.features.map(makeLine);
  const graph = buildGraph(lines);
  const landmarks = uniqueLandmarks(lines);
  return {
    network,
    landmarks,
    plan(origin: Point, destination: Point): PlannedTrip | null {
      if (distanceKm(origin, destination) < 0.25) {
        return null;
      }
      const journeys = search(graph, origin, destination);
      if (!journeys.length) {
        return null;
      }
      const cheapest = Math.min(...journeys.map(journey => journey.cost));
      const primary = journeys
        .filter(journey => journey.cost <= cheapest * PREFER_FEWER_RIDES_RATIO)
        .sort((a, b) => a.rides.length - b.rides.length || a.cost - b.cost)[0];
      return toPlannedTrip(graph, landmarks, primary);
    },
  };
}
