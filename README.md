# Vägvis 2.2.2 för GitHub och Streamlit

Vägvis uppskattar vägtrafikens klimatpåverkan med livscykelperspektiv i Malmö, Helsingborg och Gävle. Paketet innehåller läsbar beräkningskod, data, källregister, importverktyg, tester och manual. Det körs lokalt eller via Streamlit utan Netlify-krediter, API-nycklar eller AI-tjänster.

Två självständiga modeller ingår:

- **A – trafik i området:** fordonskilometer på vägar inom varje område, inklusive genomfart.
- **B – hushållens bilar:** registrerade personbilar per DeSO × årlig körsträcka, tilldelat bilarnas hemområde. Körning utanför kommunen ingår.

A och B har olika systemgränser och ska inte summeras.

## Nytt i 2.2.2

- **Uppmätt körsträcka per kommun 2024** i modell B, från SCB:s körsträckedata hos RUS (tabell 2, mätarställningar vid besiktning): Malmö 11 892, Helsingborg 12 917 och Gävle 12 521 km per privat bil (riksmedelvärdet är 12 753). Modell B ändras med −6,8, +1,3 respektive −1,8 % och intervallen blir smalare. Originaltabellerna ligger i `underlag/raw/rus/`.

## Nytt i 2.2.1

- **Körsträcka per kommun och DeSO i modell B.** Modellen använder uppmätt körsträcka (mätarställningar vid besiktning, sammanställda av SCB) när den finns: i första hand per DeSO, i andra hand per kommun, och annars riksmedelvärdet 12 753 km. Ingen schablon för avstånd till centrum används. Se *Körsträcka i modell B* nedan.
- **Städning av repot.** GitHub-flödet **Stada repo** tar bort filer från äldre modellversioner som blivit kvar efter tidigare uppladdningar.
- Beställningsunderlag till SCB för körsträcka per DeSO: `dokument/Bestallning_korstracka_DeSO_SCB.txt`.

## Nytt i 2.2.0

| Område | 2.1.1 | 2.2.0 |
|---|---|---|
| Direktutsläpp per fordonskm | Egna förbrukningsvärden | Kalibrerade så att varje fordonsklass återger Trafikverkets reviderade nationella utsläpp och trafikarbete 2024 |
| Personbilens livscykel | Egna schabloner | ICCT (2025): 240 000 km, tillverkning 7,2/7,9/6,5 t, batteri 72,8 kg CO₂e/kWh, 53,4 kWh, underhåll per drivlina |
| Drivlinor | Bensin, diesel, el, laddhybrid, biogas | + elhybrid; körsträckeviktad mix 2024 från Trafikanalys |
| Laddhybrid | 45 % eldrift i A och B | 35 % i A (all trafik), 47 % i B (privatbilar) |
| El | 37 g/kWh (byggexempel) | 90 g/kWh, nordisk elmix (Naturvårdsverket/SMED) |
| Fordonsandelar per vägtyp | Egna schabloner | Trafikverkets normalvärden per vägtyp och DeSO-typ (landsbygd/tätort) |
| Direktutsläpp stad/landsbygd | En faktor | Kvoter enligt Trafikverkets HBEFA-faktorer |
| Trafikflöden | 100 % schablon | Uppmätt ÅDT på Öresundsbron; importverktyg för NVDB och kommunala mätningar |
| Kommuntotal i A | Okalibrerad | Grundfallet kalibreras mot kommunal statistik för direktutsläpp 2024; uppmätta länkar skalas inte |
| Körsträcka i B | 11 410 km (fel population) | 12 753 km per privat bil i årsslutsbeståndet, härledd ur Trafikanalys |
| Hushåll och befolkning per DeSO | Fördelade efter bostadsgatornas längd i OSM | SCB:s register 2024 (TAB6568, TAB6574); summorna stämmer exakt med kommunraderna |
| Osäkerhet | Valda CV | Kommunnivåfelet (0,45) motsvarar observerad avvikelse; kalibrerat läge använder referensens CV |
| Paketstorlek | 61 MB, 69 filer | cirka 8 MB, packade data, ingen färdigbyggd 18 MB-HTML i repot |

## Ladda upp till GitHub

1. Packa upp paketet och öppna mappen `vagvis_2_2_2`.
2. Skapa helst ett nytt repo. Välj **Add file → Upload files** och dra in mappens **innehåll** i ett enda steg (under 100 filer och cirka 8 MB). `streamlit_app.py` ska ligga direkt i repots rot.
3. Kontrollera att `.github/` och `.streamlit/` kom med. Webbläsaren kan dölja punktmappar; använd GitHub Desktop eller Git om de saknas.
4. Gör commit, exempelvis `Vägvis 2.2.2`.
5. I Streamlit Community Cloud: välj repot och huvudfilen `streamlit_app.py`, Python 3.12.
6. Öppna appen och kontrollera att den visar **Vägvis 2.2.2**.

Vid uppdatering av ett befintligt repo tas gamla filer inte bort av en uppladdning. Kör därför **Actions → Stada repo → Run workflow** efter uppladdningen. Flödet jämför repot med `MANIFEST_SHA256.json`, tar bort filer som inte hör till paketet (till exempel sidor och skript från äldre modellversioner, `app/Vagvis.html` och okomprimerade geodatafiler från 2.1.1) och lägger ändringen i en pull request som listar varje fil. Filer under `underlag/` och `dokument/` behålls. Lokalt: `python verktyg/stada_repo.py` (visar) och `python verktyg/stada_repo.py --ta-bort`.

Om flödet inte får skapa pull requesten (inställningen *Allow GitHub Actions to create and approve pull requests* är avstängd som standard) finns ändringen på grenen `stada-repo-<nr>`; öppna en pull request från den.

## Så fungerar Streamlit-sidan

`vagvis_sidor.py` monterar huvudsidan vid körning av `kallkod/source/shell.html`, källkoden och datafilerna, exakt som byggskriptet gör. Därför behöver den stora färdigbyggda HTML-filen inte ligga i repot. GitHub-flödet **Kontrollera Vagvis** bygger ändå en fristående `Vagvis.html` och sparar den som artefakt (**Vagvis-fristaende-html**) för den som vill öppna appen utan server.

## Köra på egen dator

```bash
python -m pip install -r requirements.txt
python -m streamlit run streamlit_app.py
```

Windows: dubbelklicka på `STARTA_LOKALT_WINDOWS.cmd`. För en fristående HTML-fil: `node kallkod/bygg_appen.cjs` (Node.js 22), därefter öppnas `app/Vagvis.html` i webbläsaren.

## Startunderlagets status

| Storhet | Status |
|---|---|
| Områden | SCB DeSO 2025 (348) och RegSO 2025 (144) |
| Vägnät | OpenStreetMap, oktober 2026 (32 274 vägar) |
| Trafikflöden | Uppmätt på Öresundsbron (Øresundsbron 2024); övriga vägar schablon per vägklass, kalibrerade per kommun |
| Körsträcka (B) | Uppmätt per kommun 2024 (RUS/SCB tabell 2): Malmö 11 892, Helsingborg 12 917, Gävle 12 521 km per privat bil; samma värde för alla DeSO i kommunen tills DeSO-värden beställs |
| Kommunreferenser (TTW 2024) | Malmö 279,7 kt (två kommunala serier), Helsingborg ≈ 205 kt och Gävle ≈ 195 kt (Nationella emissionsdatabasen framskriven) |
| Bilar per DeSO (B) | SCB TAB6589, 2024, i trafik – registerdata |
| Hushåll och befolkning per DeSO | SCB TAB6568 och TAB6574, 2024 – registerdata (Malmö 172 941 hushåll, Helsingborg 70 852, Gävle 50 993) |
| Livscykel | ICCT 2025 (personbil), Trafikverket 2026 (direktutsläpp), Naturvårdsverket 2025 (el), direktiv 2015/652 (bränslen) |

Alla parametrar med källa och status finns i `underlag/evidensregister.json` och i appens vy **Metod & källor**.

## Förbättra underlaget

### Hushåll och befolkning per DeSO (SCB)

Uppgifterna för 2024 är redan inlästa (`underlag/raw/active_scb_2024.json`, med filnamn och SHA-256 för originalfilerna). För att läsa in på nytt eller kontrollera: **Actions → Hamta kallunderlag → Run workflow**. Flödet laddar ned SCB:s bulkfiler, validerar dem, bygger om och lägger resultatet på en ny gren med en pull request. Lokalt går både ZIP och uppackad CSV att ange:

```bash
python verktyg/importera_scb_hushall.py TAB6568_sv.zip TAB6574_sv.zip
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
```

Filerna laddas ned från `https://www.statistikdatabasen.scb.se/Resources/PX/bulk/ssd/sv/TAB6568_sv.zip` respektive `TAB6574_sv.zip`. Importen kräver 2024, alla 348 DeSO och att DeSO-summorna stämmer med kommunraderna. Filerna läses strömmande och lagras inte i repot.

### Körsträcka i modell B

Körsträckan per bil mäts genom mätarställningar vid kontrollbesiktning. SCB sammanställer dem per kommun (öppna data) och kan ta fram dem per DeSO på beställning.

**Per kommun (öppet, inläst för 2024):** SCB:s körsträckedata hos RUS, tabell 2 (https://www.rus.se/statistik-och-indikatorer/korstrackor/), mil per bil för bilar registrerade i kommunen. Vägvis överför värdet till privatägda bilar med kvoten mot riket: K = 12 753 km × (kommunens mil per bil / rikets mil per bil).

```bash
python verktyg/importera_korstracka.py kommun --ar 2024 --excel Tabell-2-Korstracka-till-ar-2025.xlsx
# eller med värdena direkt (mil per bil):
python verktyg/importera_korstracka.py kommun --ar 2024 --riket <riket> 1280=<Malmö> 1283=<Helsingborg> 2180=<Gävle>
```

**Per DeSO (beställning):** skicka `dokument/Bestallning_korstracka_DeSO_SCB.txt` till SCB (uppdrag@scb.se). Leveransen läses in med

```bash
python verktyg/importera_korstracka.py deso korstracka_deso_2024.csv
```

Verktyget kräver alla 348 DeSO, bilantal som stämmer med TAB6589 och rimlig körsträcka per bil. Skyddade celler får kommunens eller rikets värde. Kör sedan `python verktyg/bygg_underlag.py` och `node kallkod/bygg_appen.cjs`. Under **Antaganden & scenario** kan du växla mellan uppmätta värden och samma riksmedelvärde för alla.

### Trafikverkets ÅDT (NVDB)

Hämta NVDB-lagret med trafikflöden från Lastkajen (kräver inloggning) som GeoPackage eller GeoJSON. Kör per kommun:

```bash
python verktyg/importera_nvdb_adt.py nvdb_malmo.gpkg --kommun 1280 --falt-adt <fält ÅDT> --falt-tunga <fält tunga> --falt-matar <fält mätår>
```

### Kommunala trafikmätningar

CSV med kolumnerna `id, lat, lon, flode, matt (ADT/MVD), manad, ar, riktning, tung_andel, kalla`:

```bash
python verktyg/importera_trafikmatningar.py matningar.csv --kommun 1280
```

MVD räknas om till ÅDT med Trafikverkets månads- och veckodagsindex. Kör därefter `python verktyg/bygg_underlag.py` och `node kallkod/bygg_appen.cjs`. Uppmätta vägar ersätter schablonen och skalas inte vid kalibreringen.

### Kontrollera fordonsfaktorerna

```bash
node verktyg/kalibrera_fordonsfaktorer.cjs
```

visar att varje klass återger Trafikverkets nationella g CO₂e/fkm för 2024. Med `--skriv` skrivs nya värden till `kallkod/data/config.json` efter ändrad fordonsmix.

## Ändra och kontrollera modellen

```bash
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
node tests/test_modell.cjs
node tests/test_register.cjs
python -m unittest discover -s tests -p 'test_*.py' -v
python verktyg/skapa_manifest.py
```

`skapa_manifest.py` skriver kontrollsummor för alla filer i paketet till `MANIFEST_SHA256.json`.

Projektfilerna i `kallkod/data/` lagras förlustfritt packade (`vagvis-pack-1`: heltalskoordinater med differenskodning, delad områdesfil `omraden.json`). `core.js` (`unpackProject`) och `verktyg/paket.py` packar upp dem.

## Innehåll

| Sökväg | Innehåll |
|---|---|
| `streamlit_app.py`, `vagvis_sidor.py` | Streamlit-start och montering av sidan |
| `kallkod/source/` | Gränssnitt och beräkningsmotorer (A, B, scenarier) |
| `kallkod/data/` | Packade projekt, områden, inställningar och beräknat A-resultat |
| `underlag/` | Källregister, evidensregister, råfiler (komprimerade), uppmätta länkar |
| `verktyg/` | Databygge, packning, kalibrering och importverktyg |
| `tests/` | Numeriska, data- och paketkontroller |
| `dokument/` | Manual, evidenskontroll, kontrollresultat och beställningsunderlag (trafikdata, körsträcka) |
| `app/` | Metodsida och trafikdatasida (huvudsidan byggs vid körning) |

Koden omfattas av MIT-licensen i `LICENSE.txt`. Källdata behåller sina villkor; OpenStreetMaps attribution och ODbL ska respekteras. Leaflet har BSD 2-Clause-licens.
