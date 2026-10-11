// OWNER: Person B (backend & workflows).
// Uber hand-off: a universal link that opens the Uber app (or m.uber.com) with pickup and
// drop-off filled in. A person still confirms and pays in Uber, so nothing is booked by us.
// UBER_CLIENT_ID is optional (it only tags the link). RIDE_HOME_ADDRESS / RIDE_DROPOFF_ADDRESS swap the
// sample addresses for real ones, so a live demo opens Uber with a real trip.
// Coordinates for a place she names ("the public library, State College") from OpenStreetMap, so Uber
// can drop the pin. Best effort: 2.5 s timeout, cached, null if not found (the link still works by name).
const geoCache = new Map();
export async function geocode(query) {
  const key = String(query || '').toLowerCase().trim();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  let hit = null;
  try {
    // Prefer places near her home (RIDE_HOME_LATLNG) without ruling out farther ones (the airport).
    const [hlat, hlng] = String(process.env.RIDE_HOME_LATLNG || '').split(',').map(Number);
    const near = hlat && hlng ? `&viewbox=${hlng - 0.3},${hlat + 0.3},${hlng + 0.3},${hlat - 0.3}` : '';
    const q = String(query).replace(/\s+on\s+/i, ', ');
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us${near}&q=${encodeURIComponent(q)}`, {
      headers: { 'User-Agent': 'Porchlight-hackathon-demo/1.0' }, signal: AbortSignal.timeout(2500),
    });
    const [first] = res.ok ? await res.json() : [];
    if (first) hit = { latlng: `${first.lat},${first.lon}`, address: first.display_name.split(',').slice(0, 4).join(',').trim() };
  } catch { /* offline or slow: fall back to the name */ }
  geoCache.set(key, hit);
  return hit;
}

export function uberLink({ from, to, place, placeLatLng, pickupPlace, pickupLatLng } = {}) {
  // place: a destination she named on the call ("the grocery store"): used as is, never swapped for RIDE_DROPOFF_ADDRESS.
  const clean = (s) => String(s || '').replace(/\s*\(sample\)/i, '').trim();
  const q = new URLSearchParams({ action: 'setPickup' });
  if (process.env.UBER_CLIENT_ID) q.set('client_id', process.env.UBER_CLIENT_ID);
  // Uber places the pins from latitude/longitude (RIDE_HOME_LATLNG / RIDE_DROPOFF_LATLNG, "40.79,-77.85");
  // the address alone is only a label and can leave the fields empty.
  const pin = (key, latlng) => {
    const [lat, lng] = String(latlng || '').split(',').map((n) => n.trim());
    if (lat && lng) { q.set(`${key}[latitude]`, lat); q.set(`${key}[longitude]`, lng); }
  };
  // pickupPlace: somewhere other than home that she named ("from the library").
  if (pickupPlace) { pin('pickup', pickupLatLng); q.set('pickup[formatted_address]', clean(pickupPlace)); q.set('pickup[nickname]', clean(pickupPlace).split(',')[0]); }
  const pickup = pickupPlace ? null : clean(process.env.RIDE_HOME_ADDRESS || from);
  if (pickupPlace) { /* set above */ } else if (pickup) { pin('pickup', process.env.RIDE_HOME_LATLNG); q.set('pickup[formatted_address]', pickup); q.set('pickup[nickname]', 'Home'); } else q.set('pickup', 'my_location');
  const dropoff = place ? clean(place) : clean(process.env.RIDE_DROPOFF_ADDRESS || to);
  if (dropoff) { if (place && placeLatLng) pin('dropoff', placeLatLng); else if (!place && process.env.RIDE_DROPOFF_ADDRESS) pin('dropoff', process.env.RIDE_DROPOFF_LATLNG); q.set('dropoff[formatted_address]', dropoff); q.set('dropoff[nickname]', dropoff.split(',')[0]); }
  return `https://m.uber.com/ul/?${q.toString()}`;
}
