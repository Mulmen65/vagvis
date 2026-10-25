#!/usr/bin/env python3
"""Skriv MANIFEST_SHA256.json med SHA-256 för alla filer i paketet.

  python verktyg/skapa_manifest.py

Byggda och tillfälliga filer (app/Vagvis.html, testresultat/, __pycache__/, .git/) ingår inte.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SKIP_DIRS = {'.git', 'testresultat', '__pycache__', 'node_modules'}
SKIP_FILES = {'MANIFEST_SHA256.json', 'app/Vagvis.html'}


def version():
    m = re.search(r"VERSION\s*=\s*'([^']+)'", (ROOT/'kallkod/source/core.js').read_text(encoding='utf-8'))
    return m.group(1) if m else None


def files():
    for path in sorted(ROOT.rglob('*')):
        rel = path.relative_to(ROOT).as_posix()
        if path.is_file() and not (set(path.relative_to(ROOT).parts) & SKIP_DIRS) and rel not in SKIP_FILES:
            yield rel, path


def main():
    out = {'modelVersion': version(), 'algorithm': 'SHA-256',
           'files': {rel: hashlib.sha256(path.read_bytes()).hexdigest() for rel, path in files()}}
    (ROOT/'MANIFEST_SHA256.json').write_text(json.dumps(out, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f"MANIFEST_SHA256.json: {len(out['files'])} filer, version {out['modelVersion']}.")


if __name__ == '__main__':
    main()
