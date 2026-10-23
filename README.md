# Vägvis 2.0.9 för GitHub och Streamlit

Vägvis uppskattar vägtrafikens klimatpåverkan i Malmö, Helsingborg och Gävle. Detta är ett komplett paket som kan läggas i ett nytt eller befintligt GitHub-repo. Den färdigbyggda appen ingår. Du behöver inte bygga källkoden för att använda paketet.

Gränssnittet från 2.0.8 finns kvar: modellerna A och B, kartor med OpenStreetMap, scenarier, åtgärder, räkneexempel och export. Knappen **Beräkningsbeskrivning och källor** finns längst ner i appen. Metodvyn har kompletterats med ett källregister och aktuella parametervärden. Projektets JSON-export innehåller också evidensregistret.

## Uppdatera ditt befintliga GitHub-repo

1. Packa upp zip-filen. Öppna mappen `vagvis_2_0_9`.
2. Öppna ditt befintliga repo på GitHub. Välj **Add file → Upload files**.
3. Dra **innehållet** i mappen till GitHub, inklusive undermapparna. `streamlit_app.py` ska hamna på repots översta nivå. Ladda inte upp själva zip-filen som app.
4. Skriv exempelvis `Vägvis 2.0.9 källspårning` och välj **Commit changes**.
5. Använd fortsatt `streamlit_app.py` som huvudfil i Streamlit och Python 3.12 som körmiljö. Kontrollera att appens nederkant visar **Vägvis 2.0.9**. Vid behov, starta om appen via Streamlits apphantering.

Filer med samma sökväg ersätts; andra filer i ditt repo lämnas kvar. Paketet kompletterar de startfiler som saknades i det uppladdade ändringspaketet för 2.0.8. Den tidigare kompletta Streamlit-inramningen ingick inte i underlaget; inramningen i detta paket är därför återställd kring det bevarade HTML-gränssnittet.

Kontrollera att mapparna `.github` och `.streamlit` följer med. Appen kräver ingen API-nyckel. API-hämtning sker separat från den publicerade appen.

## Vad är förbättrat

- Källregister med exakta länkar, användningsområde och kontrollstatus.
- Tydlig åtskillnad mellan registerdefinitioner, härledda uppgifter, modellbedömningar och bedömda åtgärdseffekter.
- Aktuella parametervärden läses från samma konfiguration som beräkningen. Två antaganden som redan är inbakade i hushållsunderlaget visas som härledda kontroller.
- Källstatus och tolkning visas även i det befintliga räkneexemplet.
- Dokumenterad API-hämtning med uttagskvitto, kontrollsummor, sidindelning och felrapportering.
- Numeriska regressionskontroller mot 2.0.8 och kontroller av datahantering.
- Uppdaterad rapport i `dokument/` och metodbeskrivning i appen.

## Hur resultaten ska tolkas

Grunddata, standardvärden och numeriska beräkningsformler från 2.0.8 är bevarade. Det har inte skattats en ny modell från RVU eller lagts in nya uppmätta vägflöden i 2.0.9. Versionen gör befintliga antaganden och kvarstående databehov tydligare.

**A** fördelar trafiken på vägarna inom området. Startprojektets ÅDT är antaganden från vägklass. Kommunal kalibrering verifierar inte fördelningen mellan DeSO.

**B** fördelar hushållsbilarnas hela körning till hemområdet, även körning utanför kommunen. B:s aktivitet är huvudsakligen från 2023 och DeSO 2018. Vald bilparksårgång kan vara en annan. V7:s mått ”direkt CO₂” innehåller även en faktor för elproduktion vid eldrift. Det är inte rent tank to wheel. A och B ska inte summeras.

De redovisade intervallen är villkorade modellintervall. Exakta statistiska felmarginaler för verkliga utsläpp har inte belagts. Åtgärdernas koefficienter och samverkansregler är dokumenterade bedömningar. Fullständig harmonisering av livscykelns växthusgaser och återvinningsallokering återstår.

## Hämta nya API-underlag direkt i GitHub

Du kan göra detta utan Python på din dator:

1. Öppna repots flik **Actions**.
2. Välj **Hamta kallunderlag** och sedan **Run workflow**.
3. Öppna körningen och hämta paketet **Vagvis-kallunderlag** under **Artifacts**.
4. Läs `hamtningskvitto.json`. Ett misslyckat uttag redovisas som fel. Även en misslyckad körning sparar kvittot när det är möjligt.

Hämtningen sparar rådata för granskning. Den ändrar inte appens indata eller gör en ny commit. Innan data aktiveras måste definitioner, referensår, områdesindelning och täckning kontrolleras. Saknade värden ersätts aldrig med noll.

SCB:s uttag gäller personbilar 2023 på DeSO 2018, personbilar 2024 på DeSO 2025 och hushåll 2023–2024. De två geografiska versionerna sparas separat. Trafikanalys hämtas som råunderlag och behöver kontrolleras mot avsedd målpopulation. Malmös datalager hämtas med sidindelning efter identifiering i resurskatalogen. RVU-mikrodata är inte kopplade till något verifierat öppet API här.

I leveransmiljön gav samtliga sex direkta API-uttag HTTP 403. Kvittot finns under `underlag/leveranskontroll/`. Tidigare data har därför behållits.

## Köra lokalt

Med Python installerat kan Windows-användare öppna `STARTA_LOKALT_WINDOWS.cmd`. Alternativt:

```bash
python -m pip install -r requirements.txt
python -m streamlit run streamlit_app.py
```

Beräkningarna körs i webbläsaren och använder inga Netlify-krediter eller AI-API-anrop. OpenStreetMaps bakgrundskarta behöver internet. Beräkningen kan också öppnas direkt via `app/Vagvis.html`.

## För den som vidareutvecklar koden

```bash
python verktyg/bygg_bilmodell_v7.py
node kallkod/bygg_appen.cjs
node tests/test_modell.cjs
python -m unittest discover -s tests -p 'test_*.py' -v
```

Node behövs bara vid ombyggnad, inte när Streamlit kör den färdiga appen. Python-hämtaren använder standardbiblioteket. Streamlit är versionslåst för att behålla den befintliga iframe-presentationen. GitHub-kontrollen omfattar även installation och serverstart; dessa steg kunde inte köras i leveransmiljön.

Ändra `kallkod/source/` och bygg sedan appen. Ett ändrat värde i `underlag/evidensregister.json` ändrar dokumentation, inte en numerisk inställning eller de redan beräknade hushållsraderna. Ändra relevant konfiguration eller underlagsfil för att ändra beräkningen, bygg om och granska resultatet. Bilmodell v7:s originalarkiv bevaras i `kallkod/bilmodell_v7_original.zip`, med ursprungliga licenser och märkningar.

## Innehåll

| Sökväg | Innehåll |
|---|---|
| `streamlit_app.py` | Huvudfil för Streamlit |
| `vagvis_sidor.py` | Läser de färdigbyggda sidorna |
| `app/` | Körbara HTML-sidor |
| `kallkod/source/` | Gränssnitt, beräkningsmotor och källstatus |
| `kallkod/data/` | Versionssparat basunderlag från 2.0.8 |
| `underlag/evidensregister.json` | Källor, parametrar och bedömda åtgärdseffekter |
| `verktyg/` | Hämtning och paketering |
| `tests/` | Kontroller av beräkning, export och datahantering |
| `dokument/` | Rapport, ändringsbeskrivning och kontrollresultat |
| `.github/workflows/` | Kontroller och manuellt startad API-hämtning |

