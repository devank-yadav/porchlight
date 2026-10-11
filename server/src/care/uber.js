// OWNER: Person B (backend & workflows).
// Uber hand-off: a universal link that opens the Uber app (or m.uber.com) with pickup and
// drop-off filled in. A person still confirms and pays in Uber, so nothing is booked by us.
// UBER_CLIENT_ID is optional (it only tags the link). RIDE_HOME_ADDRESS / RIDE_DROPOFF_ADDRESS swap the
// sample addresses for real ones, so a live demo opens Uber with a real trip.
export function uberLink({ from, to } = {}) {
  const clean = (s) => String(s || '').replace(/\s*\(sample\)/i, '').trim();
  const q = new URLSearchParams({ action: 'setPickup' });
  if (process.env.UBER_CLIENT_ID) q.set('client_id', process.env.UBER_CLIENT_ID);
  const pickup = clean(process.env.RIDE_HOME_ADDRESS || from);
  if (pickup) { q.set('pickup[formatted_address]', pickup); q.set('pickup[nickname]', 'Home'); } else q.set('pickup', 'my_location');
  const dropoff = clean(process.env.RIDE_DROPOFF_ADDRESS || to);
  if (dropoff) { q.set('dropoff[formatted_address]', dropoff); q.set('dropoff[nickname]', clean(to) || dropoff); }
  return `https://m.uber.com/ul/?${q.toString()}`;
}
