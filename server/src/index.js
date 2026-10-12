// SHARED wiring only. Add new routes in voice/routes.js (Person A) or care/routes.js (Person B), not here.
import './env.js'; // must stay first
import express from 'express';
import cors from 'cors';
import * as store from './store.js';
import { seed } from './care/seed.js';
import { llmEnabled } from './voice/llm.js';
import { twilioEnabled } from './voice/notify.js';
import { voiceRoutes } from './voice/routes.js';
import { attachRelay } from './voice/relay.js';
import { careRoutes } from './care/routes.js';
import { accountRoutes } from './account/routes.js';
import { requireSession } from './account/access.js';
import { checkTwilioSignature } from './voice/twilio-signature.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // ngrok or a hosting proxy in front: rate limits use the caller's address
app.use(cors()); // the web preview; the iPhone app doesn't need it
app.use(express.json({ limit: '12mb' })); // phone help sends a photo of the screen
app.use(express.urlencoded({ extended: false })); // Twilio webhooks
app.use((_req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' }); next(); });

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/twilio', checkTwilioSignature);
app.use(requireSession); // every other /api route needs a signed-in account
app.use(accountRoutes);
app.use(voiceRoutes);
app.use(careRoutes);
app.get('/', (_req, res) => res.send('Porchlight API is running. Open the Porchlight app on your iPhone.'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

const PORT = Number(process.env.PORT || 3001);
await store.connect();
// Sample people (Peggy Hollis and her circle) load only for tests and local demos: SEED_DEMO=1.
if (process.env.SEED_DEMO === '1') await seed();
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[porchlight] API on http://localhost:${PORT}  (LLM: ${llmEnabled ? 'on' : 'mock'}, Twilio: ${twilioEnabled ? 'on' : 'off'}${process.env.SEED_DEMO === '1' ? ', demo data' : ''})`);
});
server.on('error', (e) => {
  // Another Porchlight (or anything else) already has the port. Say so plainly: otherwise the phone keeps
  // talking to the old server and the new code seems to do nothing.
  if (e.code === 'EADDRINUSE') console.error(`[porchlight] Port ${PORT} is already in use, probably by another Porchlight server that's still running. Stop that one (Ctrl+C in its terminal) and start again, or set PORT.`);
  else console.error('[porchlight] Server error:', e.message);
  process.exit(1);
});
attachRelay(server); // WebSocket for natural phone calls (voice/relay.js)
