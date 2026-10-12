// OWNER: Person B (backend & workflows).
// Uber hand-off: a universal link that opens the Uber app (or m.uber.com) with pickup and
// drop-off filled in. A person still confirms and pays in Uber, so nothing is booked by us.
// UBER_CLIENT_ID is optional (it only tags the link). Pickup is her home address (set in the app).
// Coordinates for a place she names ("the public library, State College"), so Uber can drop the pin.
// Uber only fills the drop-off from latitude/longitude: an address alone leaves the field empty.
// OpenStreetMap's Nominatim first, then Photon (better at shop names like "Walmart") if Nominatim
// is slow, rate-limited or finds nothing. Both are asked at once and the first answer wins, so a call
// never waits more than about 3 s. Best effort: cached, null if neither finds it.
const geoCache = new Map();
const UA = { 'User-Agent': 'Porchlight/1.0 (daily check-in calls for older adults)' };

async function nominatim(q, hlat, hlng) {
  const near = hlat && hlng ? `&viewbox=${hlng - 0.3},${hlat + 0.3},${hlng + 0.3},${hlat - 0.3}` : '';
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us${near}&q=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(3000) });
  const [first] = res.ok ? await res.json() : [];
  return first ? { latlng: `${first.lat},${first.lon}`, address: first.display_name.split(',').slice(0, 4).join(',').trim() } : null;
}

async function photon(q, hlat, hlng) {
  const near = hlat && hlng ? `&lat=${hlat}&lon=${hlng}` : '';
  const res = await fetch(`https://photon.komoot.io/api/?limit=1&lang=en${near}&q=${encodeURIComponent(q)}`, { headers: UA, signal: AbortSignal.timeout(3000) });
  const f = res.ok ? (await res.json()).features?.[0] : null;
  const [lon, lat] = f?.geometry?.coordinates || [];
  if (lat == null || lon == null) return null;
  const p = f.properties || {};
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const address = [p.name, street, p.city || p.town || p.village, p.state].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(', ');
  return { latlng: `${lat},${lon}`, address: address || q };
}

export async function geocode(query, near = '') {
  const key = String(query || '').toLowerCase().trim();
  if (!key) return null;
  if (geoCache.has(key)) return geoCache.get(key);
  // Prefer places near her home (near = "lat,lng") without ruling out farther ones (the airport).
  const [hlat, hlng] = String(near || '').split(',').map(Number);
  const q = String(query).replace(/\s+on\s+/i, ', ');
  // The first useful answer wins; an empty or failed one waits for the other.
  const [n, ph] = [nominatim(q, hlat, hlng).catch(() => null), photon(q, hlat, hlng).catch(() => null)];
  const hit = (await Promise.race([n.then((r) => r || ph), ph.then((r) => r || n)])) || (await n) || (await ph);
  if (!hit) console.warn('[uber] no coordinates for', JSON.stringify(query), '- Uber may open without the drop-off filled in');
  // Only cache a hit, so a blip on the network doesn't stick for the rest of the demo.
  if (hit) geoCache.set(key, hit);
  return hit;
}

// from / fromLatLng: her home address (pickup); without one, Uber uses wherever her phone is.
// place / placeLatLng: where she's going. Uber drops the pins from latitude/longitude; the address is the label.
export function uberLink({ from, fromLatLng, to, place, placeLatLng, pickupPlace, pickupLatLng } = {}) {
  const q = new URLSearchParams({ action: 'setPickup' });
  if (process.env.UBER_CLIENT_ID) q.set('client_id', process.env.UBER_CLIENT_ID);
  const pin = (key, latlng) => {
    const [lat, lng] = String(latlng || '').split(',').map((n) => n.trim());
    if (lat && lng) { q.set(`${key}[latitude]`, lat); q.set(`${key}[longitude]`, lng); }
  };
  if (pickupPlace) { pin('pickup', pickupLatLng); q.set('pickup[formatted_address]', pickupPlace); q.set('pickup[nickname]', pickupPlace.split(',')[0]); }
  else if (from) { pin('pickup', fromLatLng); q.set('pickup[formatted_address]', from); q.set('pickup[nickname]', 'Home'); }
  else q.set('pickup', 'my_location');
  const dropoff = String(place || to || '').trim();
  if (dropoff) {
    pin('dropoff', placeLatLng);
    q.set('dropoff[formatted_address]', dropoff);
    q.set('dropoff[nickname]', dropoff.split(',')[0]);
  }
  return `https://m.uber.com/ul/?${q.toString()}`;
}
