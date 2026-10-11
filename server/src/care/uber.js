// OWNER: Person B (backend & workflows).
// Uber hand-off: a universal link that opens the Uber app (or m.uber.com) with pickup and
// drop-off filled in. A person still confirms and pays in Uber, so nothing is booked by us.
// UBER_CLIENT_ID is optional (it only tags the link); RIDE_HOME_ADDRESS sets her real pickup.
export function uberLink({ from, to } = {}) {
  const clean = (s) => String(s || '').replace(/\s*\(sample\)/i, '').trim();
  const q = new URLSearchParams({ action: 'setPickup' });
  if (process.env.UBER_CLIENT_ID) q.set('client_id', process.env.UBER_CLIENT_ID);
  // Uber places the pins from latitude/longitude; the address is only the label. Coordinates come from
  // RIDE_HOME_LATLNG / RIDE_DROPOFF_LATLNG ("40.7990,-77.8554"). RIDE_DROPOFF_ADDRESS stands in for a
  // sample appointment so a real demo ride has somewhere real to go.
  const setPlace = (key, address, latlng, nickname) => {
    const [lat, lng] = String(latlng || '').split(',').map((n) => n.trim());
    if (lat && lng) { q.set(`${key}[latitude]`, lat); q.set(`${key}[longitude]`, lng); }
    q.set(`${key}[formatted_address]`, address);
    q.set(`${key}[nickname]`, nickname);
  };
  const pickup = clean(process.env.RIDE_HOME_ADDRESS || from);
  if (pickup) setPlace('pickup', pickup, process.env.RIDE_HOME_LATLNG, 'Home'); else q.set('pickup', 'my_location');
  const dropoff = clean(process.env.RIDE_DROPOFF_ADDRESS || to);
  if (dropoff) setPlace('dropoff', dropoff, process.env.RIDE_DROPOFF_ADDRESS ? process.env.RIDE_DROPOFF_LATLNG : null, process.env.RIDE_DROPOFF_ADDRESS ? dropoff.split(',')[0] : dropoff);
  return `https://m.uber.com/ul/?${q.toString()}`;
}
