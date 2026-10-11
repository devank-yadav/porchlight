// OWNER: Person B (backend & workflows).
// Uber hand-off: a universal link that opens the Uber app (or m.uber.com) with pickup and
// drop-off filled in. A person still confirms and pays in Uber, so nothing is booked by us.
// UBER_CLIENT_ID is optional (it only tags the link). RIDE_HOME_ADDRESS / RIDE_DROPOFF_ADDRESS swap the
// sample addresses for real ones, so a live demo opens Uber with a real trip.
export function uberLink({ from, to } = {}) {
  const clean = (s) => String(s || '').replace(/\s*\(sample\)/i, '').trim();
  const q = new URLSearchParams({ action: 'setPickup' });
  if (process.env.UBER_CLIENT_ID) q.set('client_id', process.env.UBER_CLIENT_ID);
  // Uber places the pins from latitude/longitude (RIDE_HOME_LATLNG / RIDE_DROPOFF_LATLNG, "40.79,-77.85");
  // the address alone is only a label and can leave the fields empty.
  const pin = (key, latlng) => {
    const [lat, lng] = String(latlng || '').split(',').map((n) => n.trim());
    if (lat && lng) { q.set(`${key}[latitude]`, lat); q.set(`${key}[longitude]`, lng); }
  };
  const pickup = clean(process.env.RIDE_HOME_ADDRESS || from);
  if (pickup) { pin('pickup', process.env.RIDE_HOME_LATLNG); q.set('pickup[formatted_address]', pickup); q.set('pickup[nickname]', 'Home'); } else q.set('pickup', 'my_location');
  const dropoff = clean(process.env.RIDE_DROPOFF_ADDRESS || to);
  if (dropoff) { if (process.env.RIDE_DROPOFF_ADDRESS) pin('dropoff', process.env.RIDE_DROPOFF_LATLNG); q.set('dropoff[formatted_address]', dropoff); q.set('dropoff[nickname]', dropoff.split(',')[0]); }
  return `https://m.uber.com/ul/?${q.toString()}`;
}
