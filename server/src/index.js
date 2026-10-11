// SHARED wiring only. Add new routes in voice/routes.js (Person A) or care/routes.js (Person B), not here.
import './env.js'; // must stay first
import express from 'express';
import cors from 'cors';
import * as store from './store.js';
import { seed } from './care/seed.js';
import { llmEnabled } from './voice/llm.js';
import { twilioEnabled } from './voice/notify.js';
import { voiceRoutes } from './voice/routes.js';
import { careRoutes } from './care/routes.js';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false })); // Twilio webhooks

app.use(voiceRoutes);
app.use(careRoutes);
app.get('/', (_req, res) => res.send('Porchlight API is running. Open the Porchlight app on your iPhone.'));

const PORT = Number(process.env.PORT || 3001);
await store.connect();
const existing = await store.list('seniors');
if (!existing.length || process.env.RESEED === '1') await seed();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[porchlight] API on http://localhost:${PORT}  (LLM: ${llmEnabled ? 'on' : 'mock'}, Twilio: ${twilioEnabled ? 'on' : 'off'})`);
});
