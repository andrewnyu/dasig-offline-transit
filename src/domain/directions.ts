import type {PlannedTrip} from './types';

const meters = (kilometers: number): number => Math.round(kilometers * 1000);

export function spokenDirections(trip: PlannedTrip): string {
  const instructions: string[] = [];
  if (trip.originWalkKm >= 0.03) {
    instructions.push(
      `Walk about ${meters(trip.originWalkKm)} meters to your first jeepney.`,
    );
  }
  trip.legs.forEach((leg, index) => {
    const heading = leg.heading ? ` toward ${leg.heading}` : '';
    const board = leg.board.label ? ` ${leg.board.label}` : '';
    const alight = leg.alight.label ? ` ${leg.alight.label}` : '';
    instructions.push(
      `Take route ${leg.routeNumber}, signboard ${leg.signboard}${heading}, from${board || ' the marked boarding point'}. Get off${alight || ' at the marked stop'}.`,
    );
    if (index < trip.legs.length - 1) {
      const transferMeters = meters(
        trip.transferWalkKm / Math.max(1, trip.legs.length - 1),
      );
      instructions.push(`Walk about ${transferMeters} meters for your transfer.`);
    }
  });
  if (trip.destinationWalkKm >= 0.03) {
    instructions.push(
      `Walk the final ${meters(trip.destinationWalkKm)} meters to your destination.`,
    );
  }
  instructions.push(
    'This route was calculated offline. Confirm the signboard and direction before boarding.',
  );
  return instructions.join(' ');
}
