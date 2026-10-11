// OWNER: Person A (voice & AI).
// Speech-to-text for VOICE_MODE=record: download her recorded reply from Twilio and send it to the
// local Whisper server (server/stt/whisper_server.py). Free and offline; returns '' if it's not running.
const STT_URL = process.env.STT_URL || 'http://127.0.0.1:5055/transcribe';

export async function transcribeRecording(recordingUrl) {
  const auth = 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  let audio = null;
  // The file can take a moment to appear after <Record> finishes.
  for (let i = 0; i < 6 && !audio; i++) {
    const res = await fetch(`${recordingUrl}.wav`, { headers: { Authorization: auth } });
    if (res.ok) audio = Buffer.from(await res.arrayBuffer());
    else await new Promise((r) => setTimeout(r, 400));
  }
  if (!audio) throw new Error('recording not available');
  const res = await fetch(STT_URL, { method: 'POST', body: audio, headers: { 'Content-Type': 'audio/wav' } });
  if (!res.ok) throw new Error(`STT ${res.status}`);
  return (await res.json()).text || '';
}
