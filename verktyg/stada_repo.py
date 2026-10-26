#!/usr/bin/env python3
"""Hitta och ta bort filer som inte hör till det aktuella Vägvis-paketet.

  python verktyg/stada_repo.py            # visar vad som skulle tas bort
  python verktyg/stada_repo.py --ta-bort  # tar bort filerna (git rm om repot är ett git-repo)

En uppladdning via GitHubs webbgränssnitt lägger till och skriver över filer men tar aldrig
bort gamla. Filer från äldre modellversioner kan därför ligga kvar i repot. Verktyget jämför repot med
MANIFEST_SHA256.json:

* filer som finns i manifestet behålls,
* kända inaktuella filer och filer från äldre modellversioner tas bort,
* övriga filer i kod- och appmapparna tas bort,
* filer under underlag/ och dokument/ behålls, eftersom importerade data (NVDB, mätningar,
  körsträckor) och egna dokument hamnar där. De listas så att de kan granskas.

GitHub-flödet "Stada repo" kör verktyget och lägger ändringen i en pull request.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = 'MANIFEST_SHA256.json'
OLD_MODEL = re.compile(r'(?i)bilmodell|stortorg|(^|/)v[67][-_]')
OBSOLETE = {
    'app/Vagvis.html',  # byggs vid körning sedan 2.2.0
    'underlag/raw/osm_roads_2026.geojson',  # ersatt av .geojson.gz
    'underlag/raw/scb_deso_2025.geojson',  # ersatt av .geojson.gz
    'dokument/Kontrollresultat_2.1.1.json',
    'dokument/Vagvis_manual_2.1.1.docx',
    'dokument/Kontrollresultat_2.2.0.json',
    'dokument/Vagvis_manual_2.2.0.docx',
    'dokument/Vagvis_manual_2.2.1.docx',
    'dokument/Kontrollresultat_2.2.1.json',
    'dokument/Vagvis_manual_2.2.2.docx',
    'dokument/Kontrollresultat_2.2.2.json',
    'dokument/Vagvis_manual_2.2.3.docx',
    'dokument/Kontrollresultat_2.2.3.json',
    'dokument/Vagvis_manual_2.2.4.docx',
    'dokument/Kontrollresultat_2.2.4.json',
    'dokument/Vagvis_manual_2.2.5.docx',
    'dokument/Kontrollresultat_2.2.5.json',
    'underlag/raw/land_gavle_osm_100m.geojson',  # ersatt av coast_display_2026.json (10 m)
}
# Grov landmask från 2.2.5 (geo-maps earth-lands-10m). Tas bort bara om innehållet är exakt det
# gamla, så att en landmask som flödet "Bygg landmask" har byggt aldrig tas bort.
OBSOLETE_CONTENT = {
    'underlag/raw/coast_display_2026.json': 'bec960dbcc2667468a69637609357f18470cea781745d82c1798c5a5d69314bc',
    'underlag/raw/land_area_2026.json': '5a44de2f3ee4c54d12e14f98c9abfb5fc59fc2d6a23215d0cb1312496b67a5ae',
}
KEEP_PREFIXES = ('underlag/', 'dokument/')
SKIP_DIRS = {'.git', '__pycache__', 'node_modules', 'testresultat'}


def repo_files():
    try:
        out = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True)
        return sorted(p for p in out.stdout.decode('utf-8').split('\0') if p)
    except (OSError, subprocess.CalledProcessError):
        # Utan git: hoppa över byggda filer som .gitignore utesluter.
        return sorted(p.relative_to(ROOT).as_posix() for p in ROOT.rglob('*')
                      if p.is_file() and not set(p.relative_to(ROOT).parts) & SKIP_DIRS
                      and p.relative_to(ROOT).as_posix() != 'app/Vagvis.html')


def obsolete_content(f):
    path = ROOT/f
    if f not in OBSOLETE_CONTENT or not path.is_file():
        return False
    return hashlib.sha256(path.read_bytes()).hexdigest() == OBSOLETE_CONTENT[f]


def classify(files, manifest):
    remove, review = [], []
    for f in files:
        if f == MANIFEST or f in manifest:
            continue
        if OLD_MODEL.search(f) or f in OBSOLETE or obsolete_content(f):
            remove.append(f)
        elif f.startswith(KEEP_PREFIXES):
            review.append(f)
        else:
            remove.append(f)
    return remove, review


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--ta-bort', action='store_true', help='ta bort filerna i stället för att bara lista dem')
    a = p.parse_args(argv)
    manifest = json.loads((ROOT/MANIFEST).read_text(encoding='utf-8'))
    remove, review = classify(repo_files(), set(manifest['files']))
    print(f"Paket: Vägvis {manifest.get('modelVersion')} ({len(manifest['files'])} filer i manifestet).")
    if not remove:
        print('Inga inaktuella filer hittades.')
    for f in remove:
        print('TA BORT', f)
    for f in review:
        print('BEHÅLLS (egna data eller dokument, granska)', f)
    if a.ta_bort and remove:
        tracked = subprocess.run(['git', 'rev-parse', '--is-inside-work-tree'], cwd=ROOT, capture_output=True).returncode == 0
        for f in remove:
            if tracked:
                subprocess.run(['git', 'rm', '-q', '--', f], cwd=ROOT, check=True)
            else:
                (ROOT/f).unlink(missing_ok=True)
        print(f'{len(remove)} filer borttagna.')
    return remove


if __name__ == '__main__':
    main()
