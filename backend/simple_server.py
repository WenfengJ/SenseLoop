import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse

from app.data.mock_data import MOCK_SIGNALS, PROFILES
from app.services.report_builder import build_daily_report


class SenseLoopHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/health":
            return self._send_json({"status": "ok", "service": "anker-SenseLoop"})

        if path == "/api/profiles":
            return self._send_json(PROFILES)

        if path.startswith("/api/signals/"):
            profile_type = path.removeprefix("/api/signals/")
            signals = MOCK_SIGNALS.get(profile_type)
            if signals is None:
                return self._send_json({"detail": "profile_type not found"}, status=404)
            return self._send_json(signals)

        if path.startswith("/api/report/"):
            profile_type = path.removeprefix("/api/report/")
            profile = next((item for item in PROFILES if item["profileType"] == profile_type), None)
            signals = MOCK_SIGNALS.get(profile_type)
            if profile is None or signals is None:
                return self._send_json({"detail": "profile_type not found"}, status=404)
            return self._send_json(build_daily_report(profile, signals))

        return self._send_json({"detail": "not found"}, status=404)

    def _send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run():
    port = int(os.environ.get("PORT", "8000"))
    server = HTTPServer(("127.0.0.1", port), SenseLoopHandler)
    print(f"SenseLoop simple backend running at http://127.0.0.1:{port}")
    server.serve_forever()


if __name__ == "__main__":
    run()
