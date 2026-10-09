import network from '../src/data/bacolod-network.json';
import {createOfflinePlanner} from '../src/domain/planner';
import {
  chooseConfidentPlace,
  parseVoiceIntent,
  searchPlaces,
} from '../src/domain/places';
import type {NetworkGeoJSON} from '../src/domain/types';

const landmarks = createOfflinePlanner(network as unknown as NetworkGeoJSON).landmarks;

describe('offline place understanding', () => {
  it('understands a complete spoken route request', () => {
    expect(parseVoiceIntent('Take me from Ayala to SM City Bacolod')).toEqual({
      kind: 'route',
      originText: 'Ayala',
      destinationText: 'SM City Bacolod',
    });
  });

  it('uses GPS as the implicit origin for destination-only speech', () => {
    expect(parseVoiceIntent('Go to University of St. La Salle')).toEqual({
      kind: 'route',
      originText: null,
      destinationText: 'University of St. La Salle',
    });
  });

  it('matches local aliases and speech variations', () => {
    expect(chooseConfidentPlace(landmarks, 'USLS')?.name).toBe('Lasalle');
    expect(chooseConfidentPlace(landmarks, 'SM City Bacolod')?.name).toBe('Sm');
    expect(searchPlaces(landmarks, 'libertad market')[0].name).toBe('Libertad');
  });
});
