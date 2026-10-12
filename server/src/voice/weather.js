// OWNER: Person A (voice & AI).
// Real weather for "Is it going to rain?": a short forecast where she lives, from Open-Meteo (free,
// no key). Cached 15 minutes; if it's unreachable, Porchlight just says it doesn't know.
const WMO = { 0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'cloudy', 45: 'foggy', 48: 'foggy', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'rain showers', 81: 'rain showers', 82: 'heavy showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorms', 96: 'thunderstorms with hail', 99: 'thunderstorms with hail' };
const cache = new Map();

// Her home's "lat,lng" (looked up when the family adds her address). No address, no forecast.
function home(latlng) {
  const [lat, lng] = String(latlng || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && latlng ? { lat, lng } : null;
}

const hour = (iso) => { const h = Number(iso.slice(11, 13)); return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; };

// One or two plain sentences, e.g. "Now 56°F and cloudy. Rest of today: up to 61°F, 70% chance of rain
// from 3 PM (light rain). Tomorrow: 48–63°F, partly cloudy, 10% chance of rain."
export async function forecast(tz = 'America/New_York', latlng) {
  const spot = home(latlng);
  if (!spot) return null;
  const { lat, lng } = spot;
  const key = `${lat},${lng},${tz}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 15 * 60000) return hit.text;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&hourly=precipitation_probability,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&temperature_unit=fahrenheit&timezone=${encodeURIComponent(tz)}&forecast_days=2`;
    const d = await (await fetch(url, { signal: AbortSignal.timeout(2500) })).json();
    const now = d.current.time.slice(0, 13);
    const today = d.current.time.slice(0, 10);
    const rest = d.hourly.time.map((t, i) => ({ t, p: d.hourly.precipitation_probability[i], w: d.hourly.weather_code[i] }))
      .filter((x) => x.t.slice(0, 10) === today && x.t.slice(0, 13) >= now);
    const wet = rest.find((x) => x.p >= 40);
    const kind = wet && wet.w >= 51 ? ` (${WMO[wet.w]})` : '';
    const restText = wet ? `${Math.max(...rest.map((x) => x.p))}% chance of rain from ${hour(wet.t)}${kind}` : 'no rain expected';
    const tmr = { lo: Math.round(d.daily.temperature_2m_min[1]), hi: Math.round(d.daily.temperature_2m_max[1]), p: d.daily.precipitation_probability_max[1], w: WMO[d.daily.weather_code[1]] || '' };
    const text = `Now ${Math.round(d.current.temperature_2m)}°F and ${WMO[d.current.weather_code] || 'mild'}. Rest of today: up to ${Math.round(d.daily.temperature_2m_max[0])}°F, ${restText}. Tomorrow: ${tmr.lo}–${tmr.hi}°F, ${tmr.w}, ${tmr.p}% chance of rain.`;
    cache.set(key, { at: Date.now(), text });
    return text;
  } catch (e) {
    console.warn('[weather] unavailable:', e.message);
    return null;
  }
}

// For the call prompt: whatever is cached right now, never waiting on the network (a reply must not stall
// on weather). A fresh fetch starts in the background when the cache is cold or stale.
export function cachedForecast(tz = 'America/New_York', latlng) {
  const spot = home(latlng);
  if (!spot) return null;
  const hit = cache.get(`${spot.lat},${spot.lng},${tz}`);
  if (!hit || Date.now() - hit.at > 15 * 60000) forecast(tz, latlng).catch(() => {});
  return hit?.text || null;
}
