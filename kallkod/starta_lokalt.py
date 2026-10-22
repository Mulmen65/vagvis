"""Serve only this model folder on loopback; no third-party Python packages."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    root = Path(__file__).resolve().parent
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        url = f"http://127.0.0.1:{server.server_port}/Vagvis_2.0.html"
        print("Vägvis 2.0 körs på din dator: " + url)
        print("Behåll detta fönster öppet. Avsluta med Ctrl+C.")
        print("Beräkningen sker lokalt. OpenStreetMap behöver internet.")
        webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
