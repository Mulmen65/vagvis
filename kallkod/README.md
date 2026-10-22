# Källkoden till Vägvis

Här ligger hela Vägvis utom de filer som byggs fram. Appen som Streamlit visar, `app/Vagvis.html`,
byggs från den här mappen. Ändra därför aldrig `app/Vagvis.html` för hand.

## Innehåll

```
source/                Beräkning, gränssnitt, startdata, byggskript och tester
  core.js              Modell A: vägnät × trafik × livscykel, scenario per område, de boendes trafik
  households.js        Modell B: hushållens bilar som Bilmodell v7, åtgärder och områdesscenario
  app.js               Gränssnittet (alla vyer)
  shell.html, style.css, maps.js, network.js
  build.cjs            Bygger Vagvis_2.0.html (allt i en fil) och startresultatet
  geodata_project.json Startprojekt för A: DeSO 2025 och OSM-vägnätet
  household_project.json  Startprojekt för B: ur Bilmodell v7
  startresultat.json   Förberäknat startresultat för A (byggs om när motorn ändras)
  omradesytor.json     Yta och landyta per område (från berakna_ytor.py)
  berakna_ytor.py      Räknar ytorna i SWEREF 99 TM (kräver shapely och pyproj)
  test_*.cjs, test_*.py  Kontroller, *-tests.txt är senaste utfall
underlag/              OSM-vägnät, DeSO-gränser, hushållsunderlag och proveniens
bygg_appen.cjs         Bygger och kopierar till app/ och dokument/
LAS_MIG_FORST.txt, Andringar_2.0.txt, Kontrollresultat.txt   Dokumentation (kopieras till dokument/)
Trafikdata_till_Malmo.*, Trafikimport_schema.json, FIKTIV_*   Dataförfrågan och importmallar
hamta_underlag.py, starta_lokalt.py, *.cmd, *.command         För lokal användning av paketet
```

Bilmodell v7 ligger i `app/Bilmodell_v7`. Både appen och bygget använder den mappen
(`source/sokvagar.cjs` letar upp den).

## Så går en ändring live

1. Ändringen görs här, oftast i `source/`.
2. Bygg från arkivets översta mapp:
   ```bash
   node kallkod/bygg_appen.cjs
   ```
   Kräver Node.js 18 eller senare. Har beräkningsmotorn (`core.js`) ändrats räknas startresultatet om,
   vilket tar 1–3 minuter.
3. Kontrollera (se nedan). Basfallet i A och B ska vara oförändrat om inget annat är meningen.
4. Lägg in `kallkod/`, `app/` och `dokument/` i samma commit på grenen `main`, direkt eller genom att
   slå ihop en pull request.
5. Streamlit uppdaterar appen inom någon minut. Versionen står längst ned i Vägvis.

Ändras områdesgränserna: kör `python kallkod/source/berakna_ytor.py` före bygget. Bygget stoppar om en yta saknas.

## Kontroller

Från arkivets översta mapp, efter att appen har byggts:

```bash
node kallkod/source/test_core.cjs
node kallkod/source/test_v2.cjs
node kallkod/source/test_omradesscenario.cjs
node kallkod/source/test_rakneexempel.cjs
node kallkod/source/test_bundle.cjs
node kallkod/source/test_network.cjs
python kallkod/source/test_package.py
python -m pytest tests
```

Webbläsartesterna (`kallkod/source/test_webblasare*.py`) kräver Playwright med Chromium och körs mot
`kallkod/Netlify`, till exempel `python kallkod/source/test_webblasare_kartscenario.py kallkod/Netlify bilder`.

## Licenser

Vägvis källkod: MIT (`LICENSE.txt`). Vägnät: © OpenStreetMap-bidragsgivare, ODbL. DeSO: SCB.
