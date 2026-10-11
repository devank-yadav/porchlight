"""Local speech-to-text for phone calls (free, offline). Used when VOICE_MODE=record.

Run:  python3 -m venv ~/Developer/whisper-venv && ~/Developer/whisper-venv/bin/pip install faster-whisper
      ~/Developer/whisper-venv/bin/python server/stt/whisper_server.py
POST /transcribe with raw audio bytes (wav/mp3) -> {"text": "..."}
"""
import json
import os
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from faster_whisper import WhisperModel

MODEL = os.environ.get("WHISPER_MODEL", "base.en")
PORT = int(os.environ.get("STT_PORT", "5055"))
model = WhisperModel(MODEL, device="cpu", compute_type="int8")
print(f"[stt] Whisper {MODEL} ready on http://127.0.0.1:{PORT}", flush=True)


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/transcribe":
            self.send_error(404)
            return
        audio = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        with tempfile.NamedTemporaryFile(suffix=".wav") as f:
            f.write(audio)
            f.flush()
            segments, _ = model.transcribe(f.name, language="en", beam_size=1, vad_filter=True)
            text = " ".join(s.text.strip() for s in segments).strip()
        body = json.dumps({"text": text}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
