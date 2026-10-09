import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import {
  Camera,
  CircleLayer,
  LineLayer,
  MapView,
  ShapeSource,
} from '@maplibre/maplibre-react-native';

import {spokenDirections} from './src/domain/directions';
import {chooseConfidentPlace, parseVoiceIntent, searchPlaces} from './src/domain/places';
import {createOfflinePlanner, type OfflinePlanner} from './src/domain/planner';
import type {Anchor, PlannedTrip, Point} from './src/domain/types';
import {
  offlineVoiceAvailable,
  speakOffline,
  startListening,
} from './src/native/OfflineVoice';
import {
  BACOLOD_MAP_STYLE,
  downloadBacolodMap,
  hasBacolodMapPack,
} from './src/services/offlineMap';
import {
  loadActivePack,
  syncRoutePack,
  type PackSyncState,
} from './src/services/routePack';

// Set this to the HTTPS origin where this repository's optional publisher is
// deployed. Trip planning never depends on it; the bundled pack is sufficient.
const ROUTE_PACK_SERVER: string | null = null;
const BACOLOD_CENTER: [number, number] = [122.9545, 10.6825];

type Field = 'origin' | 'destination';

function pointFeature(point: Point, kind: string) {
  return {
    type: 'Feature' as const,
    properties: {kind},
    geometry: {type: 'Point' as const, coordinates: [point.lng, point.lat]},
  };
}

function routeShape(trip: PlannedTrip | null) {
  return {
    type: 'FeatureCollection' as const,
    features:
      trip?.legs.map(leg => ({
        type: 'Feature' as const,
        properties: {routeNumber: leg.routeNumber},
        geometry: leg.geometry,
      })) ?? [],
  };
}

function Button({
  label,
  onPress,
  secondary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        secondary && styles.buttonSecondary,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}>
      <Text style={[styles.buttonText, secondary && styles.buttonSecondaryText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function AppContent() {
  const [planner, setPlanner] = useState<OfflinePlanner | null>(null);
  const [packVersion, setPackVersion] = useState('bundled');
  const [packState, setPackState] = useState<PackSyncState>('bundled');
  const [originText, setOriginText] = useState('Ayala');
  const [destinationText, setDestinationText] = useState('SM City Bacolod');
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [trip, setTrip] = useState<PlannedTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapProgress, setMapProgress] = useState<number | null>(null);
  const stopListeningRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    let mounted = true;
    void loadActivePack().then(pack => {
      if (!mounted) return;
      setPlanner(createOfflinePlanner(pack.network));
      setPackVersion(pack.version);
      setPackState(pack.source === 'downloaded' ? 'ready' : 'bundled');
    });
    void offlineVoiceAvailable().then(available => mounted && setVoiceAvailable(available));
    void hasBacolodMapPack().then(ready => mounted && setMapReady(ready));
    return () => {
      mounted = false;
      stopListeningRef.current?.();
    };
  }, []);

  const originMatches = useMemo(
    () => (planner ? searchPlaces(planner.landmarks, originText, 3) : []),
    [originText, planner],
  );
  const destinationMatches = useMemo(
    () => (planner ? searchPlaces(planner.landmarks, destinationText, 3) : []),
    [destinationText, planner],
  );
  const mapRoute = useMemo(() => routeShape(trip), [trip]);
  const routePoints = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: [
        ...(origin ? [pointFeature(origin, 'origin')] : []),
        ...(destination ? [pointFeature(destination, 'destination')] : []),
      ],
    }),
    [destination, origin],
  );

  const pickPlace = (field: Field, place: Anchor) => {
    if (field === 'origin') {
      setOriginText(place.name);
      setOrigin(place);
    } else {
      setDestinationText(place.name);
      setDestination(place);
    }
    setTrip(null);
    setError(null);
  };

  const resolveTypedPlaces = (): {origin: Point; destination: Point} | null => {
    if (!planner) return null;
    const resolvedOrigin = origin ?? chooseConfidentPlace(planner.landmarks, originText);
    const resolvedDestination =
      destination ?? chooseConfidentPlace(planner.landmarks, destinationText);
    if (!resolvedOrigin) {
      setError('Choose a known starting place or use your current GPS location.');
      return null;
    }
    if (!resolvedDestination) {
      setError('Choose a destination from the downloaded Bacolod landmarks.');
      return null;
    }
    setOrigin(resolvedOrigin);
    setDestination(resolvedDestination);
    return {origin: resolvedOrigin, destination: resolvedDestination};
  };

  const plan = () => {
    const points = resolveTypedPlaces();
    if (!points || !planner) return;
    const nextTrip = planner.plan(points.origin, points.destination);
    if (!nextTrip) {
      setTrip(null);
      setError(
        'No offline jeepney connection was found within walking distance of both points.',
      );
      return;
    }
    setTrip(nextTrip);
    setError(null);
  };

  const useCurrentLocation = async () => {
    if (
      Platform.OS === 'android' &&
      (await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      )) !== PermissionsAndroid.RESULTS.GRANTED
    ) {
      setError('Location permission is needed to use your current position.');
      return;
    }
    Geolocation.getCurrentPosition(
      position => {
        const current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setOrigin(current);
        setOriginText('Current location');
        setTrip(null);
        setError(null);
      },
      () => setError('Your current location is unavailable. You can still choose a landmark.'),
      {enableHighAccuracy: true, timeout: 12000, maximumAge: 30000},
    );
  };

  const applyTranscript = (transcript: string) => {
    setListening(false);
    stopListeningRef.current?.();
    stopListeningRef.current = null;
    if (!planner) return;
    const intent = parseVoiceIntent(transcript);
    if (intent.kind === 'incomplete') {
      setError(intent.message);
      return;
    }
    const resolvedDestination = chooseConfidentPlace(
      planner.landmarks,
      intent.destinationText,
    );
    const resolvedOrigin = intent.originText
      ? chooseConfidentPlace(planner.landmarks, intent.originText)
      : origin;
    if (!resolvedDestination) {
      setDestinationText(intent.destinationText);
      setError(`I heard “${transcript},” but the destination is ambiguous. Choose a match below.`);
      return;
    }
    if (!resolvedOrigin) {
      setDestinationText(resolvedDestination.name);
      setDestination(resolvedDestination);
      setError('I found the destination. Now choose a starting place or use GPS.');
      return;
    }
    setOriginText(
      intent.originText &&
      'name' in resolvedOrigin &&
      typeof resolvedOrigin.name === 'string'
        ? resolvedOrigin.name
        : 'Current location',
    );
    setOrigin(resolvedOrigin);
    setDestinationText(resolvedDestination.name);
    setDestination(resolvedDestination);
    const nextTrip = planner.plan(resolvedOrigin, resolvedDestination);
    setTrip(nextTrip);
    setError(
      nextTrip
        ? null
        : 'No offline jeepney connection was found for the spoken places.',
    );
  };

  const listen = async () => {
    try {
      stopListeningRef.current?.();
      setListening(true);
      setError(null);
      stopListeningRef.current = await startListening(applyTranscript, message => {
        setListening(false);
        setError(message);
      });
    } catch (caught) {
      setListening(false);
      setError(caught instanceof Error ? caught.message : 'Voice recognition is unavailable.');
    }
  };

  const updateRoutes = async () => {
    if (!ROUTE_PACK_SERVER) {
      setError('No route-pack server is configured. The bundled Bacolod routes remain ready.');
      return;
    }
    const finalState: {current: PackSyncState} = {current: 'checking'};
    const pack = await syncRoutePack(ROUTE_PACK_SERVER, state => {
      finalState.current = state;
      setPackState(state);
    });
    setPlanner(createOfflinePlanner(pack.network));
    setPackVersion(pack.version);
    if (finalState.current === 'failed') {
      setError('The server is unavailable. The last verified Bacolod routes remain ready.');
    }
  };

  const downloadMap = async () => {
    setError(null);
    try {
      await downloadBacolodMap(progress => {
        setMapProgress(Math.round(progress.percentage));
        if (progress.percentage >= 100) setMapReady(true);
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The offline map could not be downloaded.');
    }
  };

  if (!planner) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#1f7a4d" size="large" />
        <Text style={styles.muted}>Building the offline Bacolod route graph…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F6F4EE" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>D</Text></View>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>BACOLOD · ON-DEVICE</Text>
            <Text style={styles.title}>DASIG</Text>
          </View>
          <View style={styles.readyBadge}>
            <View style={styles.readyDot} />
            <Text style={styles.readyText}>ROUTES READY</Text>
          </View>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Ask for a jeepney route—even in airplane mode.</Text>
          <Text style={styles.heroBody}>
            Speech recognition, place matching, and up to three jeepney rides are calculated on this phone.
          </Text>
          <Pressable
            accessibilityRole="button"
            disabled={!voiceAvailable || listening}
            onPress={listen}
            style={[styles.mic, (!voiceAvailable || listening) && styles.micDisabled]}>
            <Text style={styles.micIcon}>{listening ? '•••' : '●'}</Text>
            <Text style={styles.micText}>
              {listening
                ? 'Listening… say “from Ayala to SM”'
                : voiceAvailable
                  ? 'Speak a trip'
                  : 'Offline voice model unavailable'}
            </Text>
          </Pressable>
        </View>

        <View style={styles.card}>
          <PlaceField
            label="FROM"
            value={originText}
            onChange={value => {
              setOriginText(value);
              setOrigin(null);
              setTrip(null);
            }}
            matches={originMatches}
            onPick={place => pickPlace('origin', place)}
          />
          <Button label="Use my current location" secondary onPress={useCurrentLocation} />
          <View style={styles.divider} />
          <PlaceField
            label="TO"
            value={destinationText}
            onChange={value => {
              setDestinationText(value);
              setDestination(null);
              setTrip(null);
            }}
            matches={destinationMatches}
            onPick={place => pickPlace('destination', place)}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Button label="Plan entirely offline" onPress={plan} />
        </View>

        <View style={styles.mapCard}>
          <MapView style={styles.map} mapStyle={BACOLOD_MAP_STYLE} logoEnabled={false}>
            <Camera centerCoordinate={BACOLOD_CENTER} zoomLevel={12.2} />
            <ShapeSource id="network" shape={planner.network}>
              <LineLayer
                id="network-lines"
                style={{lineColor: '#8f9a92', lineWidth: 1.2, lineOpacity: 0.42}}
              />
            </ShapeSource>
            <ShapeSource id="planned-route" shape={mapRoute}>
              <LineLayer
                id="planned-route-line"
                style={{lineColor: '#163d2b', lineWidth: 5, lineOpacity: 0.95}}
              />
            </ShapeSource>
            <ShapeSource id="route-points" shape={routePoints}>
              <CircleLayer
                id="route-point-circles"
                style={{
                  circleColor: '#f7c948',
                  circleStrokeColor: '#163d2b',
                  circleStrokeWidth: 2,
                  circleRadius: 6,
                }}
              />
            </ShapeSource>
          </MapView>
          <View style={styles.mapFooter}>
            <View>
              <Text style={styles.mapStatus}>{mapReady ? 'Offline basemap ready' : 'Route overlay ready offline'}</Text>
              <Text style={styles.mapHint}>
                {mapProgress === null ? 'Download tiles before leaving Wi-Fi.' : `${mapProgress}% downloaded`}
              </Text>
            </View>
            <Button label={mapReady ? 'Map ready' : 'Download map'} secondary disabled={mapReady} onPress={downloadMap} />
          </View>
        </View>

        {trip ? <TripCard trip={trip} onSpeak={() => void speakOffline(spokenDirections(trip))} /> : null}

        <View style={styles.syncCard}>
          <View style={styles.syncCopy}>
            <Text style={styles.syncTitle}>Published route pack</Text>
            <Text style={styles.syncBody}>
              {packVersion === 'bundled' ? 'Bundled hackathon snapshot' : `Verified version ${packVersion}`}
              {' · '}{packState}
            </Text>
          </View>
          <Button
            label={!ROUTE_PACK_SERVER ? 'Server not configured' : ['checking', 'downloading', 'verifying'].includes(packState) ? 'Updating…' : 'Check update'}
            secondary
            disabled={!ROUTE_PACK_SERVER || ['checking', 'downloading', 'verifying'].includes(packState)}
            onPress={() => void updateRoutes()}
          />
        </View>

        <Text style={styles.disclaimer}>
          DASIG uses published or inferred corridors. Confirm the signboard, direction, current service, and fare before boarding.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PlaceField({
  label,
  value,
  onChange,
  matches,
  onPick,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  matches: Anchor[];
  onPick: (place: Anchor) => void;
}) {
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={`${label.toLowerCase()} place`}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder="Search downloaded landmarks"
        placeholderTextColor="#778078"
        value={value}
        onChangeText={onChange}
        style={styles.input}
      />
      <View style={styles.chips}>
        {matches.map(place => (
          <Pressable key={place.name} onPress={() => onPick(place)} style={styles.chip}>
            <Text style={styles.chipText}>{place.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function TripCard({trip, onSpeak}: {trip: PlannedTrip; onSpeak: () => void}) {
  return (
    <View style={styles.tripCard}>
      <View style={styles.tripHeader}>
        <View>
          <Text style={styles.eyebrow}>CALCULATED ON THIS DEVICE</Text>
          <Text style={styles.tripTitle}>
            {trip.durationMinutes} min · {trip.rideCount} {trip.rideCount === 1 ? 'jeep' : 'jeeps'}
          </Text>
          <Text style={styles.tripMeta}>
            {trip.farePhp === null ? 'Ask driver for fare' : `About ₱${trip.farePhp}`} · {trip.walkKm.toFixed(1)} km walking
          </Text>
        </View>
        <Button label="Read aloud" secondary onPress={onSpeak} />
      </View>
      {trip.legs.map((leg, index) => (
        <View key={`${leg.routeId}-${index}`} style={styles.leg}>
          <View style={[styles.routeNumber, {backgroundColor: leg.color}]}>
            <Text style={styles.routeNumberText}>{leg.routeNumber}</Text>
          </View>
          <View style={styles.legCopy}>
            <Text style={styles.legTitle}>{leg.signboard}</Text>
            <Text style={styles.legBody}>
              Board {leg.board.label ?? 'at the marked point'}
              {leg.heading ? ` · toward ${leg.heading}` : ''}
            </Text>
            <Text style={styles.legBody}>Get off {leg.alight.label ?? 'at the marked point'}</Text>
          </View>
        </View>
      ))}
      <Text style={styles.tripNote}>{trip.note}</Text>
    </View>
  );
}

export default function App() {
  return <AppContent />;
}

const styles = StyleSheet.create({
  safe: {flex: 1, backgroundColor: '#F6F4EE'},
  content: {padding: 18, paddingBottom: 40, gap: 16},
  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#F6F4EE'},
  header: {flexDirection: 'row', alignItems: 'center', gap: 12},
  brandMark: {width: 42, height: 42, borderRadius: 12, backgroundColor: '#163D2B', alignItems: 'center', justifyContent: 'center'},
  brandMarkText: {color: '#E8F7A1', fontSize: 24, fontWeight: '900'},
  headerCopy: {flex: 1},
  eyebrow: {fontSize: 10, letterSpacing: 1.2, color: '#526058', fontWeight: '800'},
  title: {fontSize: 21, color: '#111611', fontWeight: '800'},
  readyBadge: {flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DFF4E6', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7},
  readyDot: {width: 7, height: 7, borderRadius: 4, backgroundColor: '#1F7A4D'},
  readyText: {fontSize: 9, color: '#1F603F', letterSpacing: 0.7, fontWeight: '900'},
  hero: {backgroundColor: '#163D2B', borderRadius: 24, padding: 22, gap: 12},
  heroTitle: {fontSize: 30, lineHeight: 34, color: '#F7F2DE', fontWeight: '800'},
  heroBody: {fontSize: 15, lineHeight: 22, color: '#C8D8CC'},
  mic: {marginTop: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#E8F7A1', paddingVertical: 15, borderRadius: 16},
  micDisabled: {opacity: 0.52},
  micIcon: {color: '#C9362B', fontSize: 18},
  micText: {color: '#163D2B', fontWeight: '800', fontSize: 15},
  card: {backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, gap: 13, borderWidth: 1, borderColor: '#E3E5DF'},
  fieldLabel: {fontSize: 10, letterSpacing: 1.4, color: '#526058', fontWeight: '900', marginBottom: 7},
  input: {borderWidth: 1.5, borderColor: '#C7CDC8', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, color: '#111611', fontSize: 17, backgroundColor: '#FCFCF8'},
  chips: {flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 8},
  chip: {backgroundColor: '#EDF1EC', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7},
  chipText: {fontSize: 12, color: '#304037', fontWeight: '700'},
  divider: {height: 1, backgroundColor: '#E8EAE5'},
  button: {backgroundColor: '#163D2B', borderRadius: 13, minHeight: 43, paddingHorizontal: 15, paddingVertical: 11, alignItems: 'center', justifyContent: 'center'},
  buttonSecondary: {backgroundColor: '#EEF2EC', borderWidth: 1, borderColor: '#D7DDD7'},
  buttonDisabled: {opacity: 0.5},
  buttonPressed: {opacity: 0.78},
  buttonText: {color: '#FFFFFF', fontSize: 13, fontWeight: '800'},
  buttonSecondaryText: {color: '#254333'},
  error: {backgroundColor: '#FDECEA', color: '#982D27', borderRadius: 10, padding: 11, lineHeight: 18},
  mapCard: {backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', borderWidth: 1, borderColor: '#E3E5DF'},
  map: {height: 330},
  mapFooter: {padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10},
  mapStatus: {fontSize: 13, fontWeight: '800', color: '#25372D'},
  mapHint: {fontSize: 11, color: '#68736C', marginTop: 2},
  tripCard: {backgroundColor: '#FFFBE8', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#E8DFAE', gap: 14},
  tripHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10},
  tripTitle: {fontSize: 24, color: '#111611', fontWeight: '900', marginTop: 4},
  tripMeta: {fontSize: 13, color: '#556157', marginTop: 3},
  leg: {flexDirection: 'row', gap: 12, paddingTop: 13, borderTopWidth: 1, borderTopColor: '#E6DCA8'},
  routeNumber: {width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  routeNumberText: {color: '#FFFFFF', fontSize: 16, fontWeight: '900', textShadowColor: '#00000055', textShadowRadius: 2},
  legCopy: {flex: 1},
  legTitle: {fontSize: 16, color: '#172018', fontWeight: '800'},
  legBody: {fontSize: 13, lineHeight: 19, color: '#566158', marginTop: 2},
  tripNote: {fontSize: 11, lineHeight: 16, color: '#6A6D58'},
  syncCard: {backgroundColor: '#E9EEE8', borderRadius: 18, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10},
  syncCopy: {flex: 1},
  syncTitle: {fontSize: 13, fontWeight: '800', color: '#26372D'},
  syncBody: {fontSize: 11, color: '#647068', marginTop: 3},
  disclaimer: {fontSize: 11, lineHeight: 17, color: '#667068', textAlign: 'center', paddingHorizontal: 12},
  muted: {color: '#657067'},
});
