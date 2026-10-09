export type Coordinate = [number, number]; // [longitude, latitude]

export interface Point {
  lat: number;
  lng: number;
}

export interface Anchor extends Point {
  name: string;
}

export interface NetworkFeature {
  type: 'Feature';
  geometry: {
    type: 'LineString';
    coordinates: Coordinate[];
  };
  properties: {
    id: string;
    number: string | number;
    name: string;
    color: string;
    status: string;
    source_url?: string;
    mode?: string;
    anchors?: Anchor[];
    return_anchors?: Anchor[];
  };
}

export interface NetworkGeoJSON {
  type: 'FeatureCollection';
  features: NetworkFeature[];
}

export interface RouteLine {
  id: string;
  number: string;
  name: string;
  color: string;
}

export interface RouteStop extends Point {
  landmark: string | null;
  label: string | null;
}

export interface RouteLeg {
  routeId: string;
  routeNumber: string;
  routeName: string;
  color: string;
  signboard: string;
  heading: string | null;
  board: RouteStop;
  alight: RouteStop;
  geometry: {
    type: 'LineString';
    coordinates: Coordinate[];
  };
  roadDistanceKm: number;
  rideMinutes: number;
  farePhp: number | null;
}

export interface PlannedTrip {
  city: 'bacolod';
  rideCount: number;
  lines: RouteLine[];
  legs: RouteLeg[];
  originWalkKm: number;
  destinationWalkKm: number;
  transferWalkKm: number;
  rideKm: number;
  walkKm: number;
  durationMinutes: number;
  farePhp: number | null;
  walkBasis: 'estimated';
  note: string;
}

export interface PlaceMatch extends Anchor {
  score: number;
  aliases: string[];
}

export type VoiceIntent =
  | {
      kind: 'route';
      originText: string | null;
      destinationText: string;
    }
  | {
      kind: 'incomplete';
      message: string;
    };
