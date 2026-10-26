# Vägvis 2.3.0 för GitHub och Streamlit

Vägvis uppskattar vägtrafikens klimatpåverkan med livscykelperspektiv i Malmö, Helsingborg och Gävle. Paketet innehåller läsbar beräkningskod, data, källregister, importverktyg, tester och manual. Det körs lokalt eller via Streamlit utan Netlify-krediter, API-nycklar eller AI-tjänster.

Två självständiga modeller ingår:

- **A – trafik i området:** fordonskilometer på vägar inom varje område, inklusive genomfart.
- **B – hushållens bilar:** registrerade personbilar per DeSO × årlig körsträcka, tilldelat bilarnas hemområde. Körning utanför kommunen ingår.

A och B har olika systemgränser och ska inte summeras.

## Valbar körsträcka per DeSO i 2.3.0

Under **B → Antaganden & scenario → Körsträcka i modell B** finns tre alternativ:

1. Kommunvärden och eventuella verifierade lokala värden (befintligt standardläge).
2. Samma riksgenomsnitt för alla områden (befintligt jämförelseläge).
3. **Skattning per DeSO – valda antaganden** (nytt, kräver aktivt val).

Det nya alternativet ger olika körsträcka mellan DeSO. Det använder tillgängliga indikatorer för centrumavstånd, kollektivtrafik, dagligvaror/service, inkomst och bilinnehav. Koefficienterna är öppet redovisade modellval, inte skattade svenska effekter. Inget forskningsresultat används som påstått belägg för deras numeriska värden. Saknade indikatorer ger inget eget bidrag och visas som saknade.

Första leveransen innehåller centrumavstånd som beräknats från paketets OSM-vägnät och registrerade bilar per hushåll för samtliga 348 DeSO. **Inkomst, kollektivtrafikpunkter och servicepunkter har inte kunnat hämtas i byggmiljön (HTTP 403) och är tomma.** De tre faktorerna påverkar därför inte första leveransens skattning. Bilinnehavets koefficient är noll från start för att undvika en ogrundad extra bilinnehavseffekt. Centrumavståndet bygger på bostadsvägar som geografisk proxy och är fågelvägsavstånd, inte befolkningsvägd restid. GIS-underlaget avser 2026; utsläppsberäkningens basår är 2024.

DeSO-faktorerna begränsas till valda intervall och normaliseras så att kommunens bilvägda medelkörsträcka och sammanlagda trafikarbete behålls. Detta kontrollerar summeringen, inte fördelningens träffsäkerhet. Osäkerhetsintervallet är villkorat av valda CV, utan empiriskt skattad säkerhet för DeSO-fördelningen. Nya modellantaganden anges i en separat panel när det nya läget väljs; färger, karta, navigering och befintliga beräkningslägen behålls.

### Komplettera indikatorerna automatiskt

Kör **Actions → Hamta korstrackeindikatorer → Run workflow** i GitHub. Flödet försöker hämta SCB:s medianekonomiska standard 2024 och OSM-punkter för kollektivtrafik och dagligvaror, validerar data och skapar en granskningsbar uppdatering på en ny gren. Befintliga underlag behålls om en källa inte kan hämtas. Granska täckningen i `underlag/korstracka/`, slå ihop ändringen och välj **Reboot app** i Streamlit. Nya data ändrar inte de valda koefficienternas evidensstatus. Hållplatsavstånd är en fysisk tillgänglighetsproxy; turtäthet och restider ingår inte.

Lokalt kan samma hämtning köras med `python verktyg/hamta_korstrackeindikatorer.py`. Se verktygets `--help` för import av egna källfiler. Beräkning och sparade projekt fungerar därefter utan nätanrop. Full metod, källor och datatäckning finns i knappen **Beräkningsbeskrivning och källor**, i `underlag/korstrackemodell_metod.md` och i den uppdaterade manualen.

Landmasken från OpenStreetMap, registrerade bilar/hushåll/befolkning, fordonsfaktorer, A-modellen och de två tidigare körsträckelägena har bevarats. A och B ska fortfarande inte summeras.

## Ladda upp till GitHub

1. Packa upp paketet och öppna mappen `vagvis_2_3_0`.
2. Skapa helst ett nytt repo. Välj **Add file → Upload files** och dra in mappens **innehåll**. Om du använder de uppdelade ZIP-filerna, packa upp dem först och ladda upp delarnas innehåll till samma repo i ordning. Gör en commit efter varje del och behåll mappstrukturen. `streamlit_app.py` ska ligga direkt i repots rot.
GitHubs webbuppladdning tillåter högst **100 filer** i samma uppladdning. Använd de uppdelade paketen och ladda upp i **flera omgångar** om hela mappen inte accepteras. Varje del ska packas upp och läggas i samma repo, med bibehållna sökvägar.

3. Kontrollera att `.github/` och `.streamlit/` kom med. Webbläsaren kan dölja punktmappar; använd GitHub Desktop eller Git om de saknas.
4. Gör commit, exempelvis `Vägvis 2.3.0`.
5. I Streamlit Community Cloud: välj repot och huvudfilen `streamlit_app.py`, Python 3.12.
6. Öppna appen och kontrollera att den visar **Vägvis 2.3.0** och **MODELLPAKET 2.3** i sidomenyn.

Vid uppdatering av ett befintligt repo tas gamla filer inte bort av en uppladdning. Kör därför **Actions → Stada repo → Run workflow** efter uppladdningen. Flödet jämför repot med `MANIFEST_SHA256.json`, tar bort filer som inte hör till paketet (till exempel sidor och skript från äldre modellversioner, `app/Vagvis.html` och okomprimerade geodatafiler från 2.1.1) och lägger ändringen i en pull request som listar varje fil. Filer under `underlag/` och `dokument/` behålls. Lokalt: `python verktyg/stada_repo.py` (visar) och `python verktyg/stada_repo.py --ta-bort`.

Om flödet inte får skapa pull requesten (inställningen *Allow GitHub Actions to create and approve pull requests* är avstängd som standard) finns ändringen på grenen `stada-repo-<nr>`; öppna en pull request från den.

### Om appen fortfarande visar en äldre version

Står det **MODELLPAKET 2.0** (eller 2.1) i sidomenyn kör Streamlit fortfarande en äldre version. Kontrollera i tur och ordning:

1. Att uppladdningen gick till samma repo och gren som appen använder (Streamlit Community Cloud → appens meny → **Settings**).
2. Att **Main file path** är `streamlit_app.py` i repots rot. Äldre versioner kan ha använt en annan startfil, som då fortsätter att visa den gamla sidan.
3. Kör **Actions → Stada repo** och slå ihop pull requesten, så att gamla filer tas bort.
4. Välj **Reboot app** i Streamlit. Sidan byggs då om från de nya källfilerna.

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
| Områden | SCB DeSO 2025 (348) och RegSO 2025 (144). Landmask och yta utan hav från OpenStreetMaps landpolygoner, 26 oktober 2026 |
| Vägnät | OpenStreetMap, oktober 2026 (32 274 vägar) |
| Trafikflöden | Uppmätt på Öresundsbron (Øresundsbron 2024); övriga vägar schablon per vägklass, kalibrerade per kommun |
| Körsträcka (B) | Härledda kommunvärden: Malmö 11 892, Helsingborg 12 917, Gävle 12 521 km per bil. Valbart riksgenomsnitt eller antagandebaserad DeSO-fördelning. Inga uppmätta DeSO-körsträckor ingår |
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

Körsträckestatistiken bygger på mätarställningar och metodskattningar. SCB har meddelat att körsträckor endast levereras ned till kommunnivå. Paketet hänvisar därför inte till beställning av uppmätt DeSO-körsträcka som en tillgänglig datakälla.

Kommunvärdena bygger på RUS/SCB tabell 2 för 2024 och överförs till B-modellens privatbilsbestånd genom kvoten mot riket: K = 12 753 km × (kommunens mil per bil / rikets mil per bil). Tabell 2 omfattar alla personbilar som varit i trafik under året, även företagsägda. Att motsvarande relativa kommunskillnad gäller hushållens bilar vid årets slut är ett modellantagande.

```bash
python verktyg/importera_korstracka.py kommun --ar 2024 --excel Tabell-2-Korstracka-till-ar-2025.xlsx
```

Import av en egen verifierbar DeSO-leverans stöds även fortsättningsvis av `importera_korstracka.py deso fil.csv`, men någon sådan leverans ingår inte. Detta är inte en automatisk SCB-tjänst. Den nya delmodulen använder geografiska och socioekonomiska indikatorer för en uttrycklig modellskattning. Se `dokument/Bestallning_korstracka_DeSO_SCB.txt` för databehov och möjliga analysuttag ur resvaneundersökningar.

### Landmask (kustlinje)

SCB:s DeSO omfattar även vatten, och flera DeSO i Malmö, Helsingborg och Gävle sträcker sig långt ut i havet. För att kartan ska visa bara land och för nyckeltalet *t CO₂e per hektar utan hav* behövs en detaljerad kustlinje. Paketet innehåller en sådan mask, byggd 26 oktober 2026 ur OpenStreetMaps landpolygoner. För att uppdatera den: **Actions → Bygg landmask → Run workflow.** Flödet laddar ned landpolygonerna från osmdata.openstreetmap.de, klipper ut de tre kommunerna och kontrollerar masken mot vägnätet: högst 1 % av vägpunkterna inom kommunens DeSO får ligga mer än 15 m utanför landytan (broar). En grövre eller inaktuell kustlinje avvisas och inga filer ändras. Resultatet läggs på grenen `landmask-<nr>` med en pull request som visar ytan utan hav per kommun. Slå ihop den och välj **Reboot app** i Streamlit. Lokalt:

```bash
python -m pip install shapely==2.2.0 pyshp==2.3.1
python verktyg/bygg_landmask.py land-polygons-split-4326.zip
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
```

Masken påverkar bara kartvisningen och nyckeltalet per hektar. Utsläppen beräknas alltid med SCB:s fullständiga DeSO-geometri, så trafik på broar och i hamnar räknas med. Sjöar räknas som land. **Stada repo** tar bort den grova masken från 2.2.5 om den finns kvar i repot, men aldrig en mask som flödet har byggt.

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
node tests/test_distance.cjs
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
