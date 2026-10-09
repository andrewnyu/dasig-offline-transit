import network from '../src/data/bacolod-network.json';
import {createOfflinePlanner} from '../src/domain/planner';
import type {NetworkGeoJSON} from '../src/domain/types';

const planner = createOfflinePlanner(network as unknown as NetworkGeoJSON);

describe('offline Bacolod planner', () => {
  it('plans Ayala to SM without any network service', () => {
    const trip = planner.plan(
      {lat: 10.6768, lng: 122.95},
      {lat: 10.6722, lng: 122.9443},
    );

    expect(trip).not.toBeNull();
    expect(trip?.rideCount).toBe(1);
    expect(trip?.legs[0].board.label).toBe('near Ayala');
    expect(trip?.legs[0].alight.label).toBe('near Sm');
    expect(trip?.farePhp).toBeGreaterThanOrEqual(14);
    expect(trip?.note).toContain('entirely on this device');
  });

  it('plans a required two-jeep journey', () => {
    const trip = planner.plan(
      {lat: 10.61779, lng: 123.00592},
      {lat: 10.6722, lng: 122.9443},
    );
    expect(trip?.rideCount).toBe(2);
  });

  it('plans up to three rides across far corners', () => {
    const trip = planner.plan(
      {lat: 10.65956, lng: 123.07579},
      {lat: 10.63613, lng: 122.94726},
    );
    expect(trip?.rideCount).toBe(3);
  });

  it('does not guess when an endpoint is outside mapped coverage', () => {
    expect(
      planner.plan(
        {lat: 10.8, lng: 123.15},
        {lat: 10.6722, lng: 122.9443},
      ),
    ).toBeNull();
  });
});
