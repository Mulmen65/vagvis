# Vägvis 2.1.1 för GitHub och Streamlit

Vägvis uppskattar vägtrafikens klimatpåverkan i Malmö, Helsingborg och Gävle. Paketet innehåller färdigbyggd app, läsbar beräkningskod, data, källregister och manual. Det körs lokalt eller via Streamlit utan Netlify-krediter eller AI-API. Gränssnittets sidomeny, kartor och knapp **Beräkningsbeskrivning och källor** finns kvar.

Två självständiga modeller ingår:

- **A – trafik i området:** fordonskilometer på vägar inom varje geografiskt område, inklusive genomfart. Startunderlaget använder vägklasser och redovisade trafikantaganden där kompletta mätta länkflöden saknas. Kommunal kalibrering belägger inte fördelningen mellan områden.
- **B – hushållens bilar:** antalet bilar och deras årliga körsträcka, tilldelat bilarnas hemområde. Körning utanför kommunen ingår. B är inte en territoriell utsläppsinventering.

A och B ska inte summeras. Båda använder samma komponentindelade livscykelfaktorer. Fullständig cirkularitet eller verifierad cradle to cradle redovisas inte. Vägbyggande ingår inte. Osäkerhetsintervallen är villkorade modellintervall, inte belagda konfidensintervall för de verkliga utsläppen. RVU har inte använts för att skatta en ny kausal områdesmodell eller verifiera åtgärdernas koefficienter. Parametrar som saknar tillräckligt direkt stöd är märkta som bedömningar i källregistret.

## Startunderlagets status

Appen innehåller 348 DeSO och 144 RegSO enligt SCB:s indelning 2025 samt 32 274 väggeometrier från OpenStreetMap, hämtade 2026. Beräkningsåret är 2024. För modell A är ÅDT i startunderlaget antagen per vägklass. Vägnätets hämtningsår är inte ett belägg för nätets exakta utseende 2024.

**B använder registrerade personbilar direkt per DeSO.** SCB:s originalexport `TAB6589_sv.zip` ingår oförändrad i paketet. Urvalet är **2024, i trafik och exakt 348 DeSO enligt indelningen 2025**. Registrerade bilar summerar till **100 524 i Malmö, 58 000 i Helsingborg och 43 311 i Gävle**. Varje kommun är avstämd mot filens kommunrad. År 2025, avställda fordon, totalstatus, namngivna RegSO-rader och kommunrader adderas inte till DeSO-summorna. Dessa bilantal är redan aktiverade och kräver ingen API-hämtning eller internetanslutning.

Hushåll och befolkning på områdesnivå är fortfarande fördelade modellvärden. Malmös hushållstal är ett avrundat kommunalt värde; Helsingborgs och Gävles hushållstal bygger på överfört hushållsstorleksantagande. Dessa storheter har egna källstatusar och fördelas med bostadsväglängd. **Bilantalet fördelas inte med denna proxy.** I DeSO `1280C2850` är hushållsproxyn noll men registret anger 545 bilar. Bilarna och deras trafikarbete ingår; bilar per hushåll redovisas utan värde när hushållsnämnaren är noll. Inga hushåll hittas på för att fylla luckan.

Huvudberäkningen är `fordonskilometer = registrerade bilar × km per bil och år`. Hushåll och befolkning används för beskrivande kvoter och påverkar inte grundfallets absoluta trafikarbete. Körsträckan 11 410 km per bil är ett överfört riksgenomsnitt och livscykelfaktorerna är modellval. Bilstocken behandlas som fast indata i grundinställningens simulering. Angiven lokal variation avser antagen körsträckevariation, inte omflyttning av registrerade bilar.

Välj **modell B → Data & underlag → Hämta SCB-register 2024** för att komplettera med fullständiga hushålls-, befolknings- och biluttag från användarens webbläsare. Först när hela det efterfrågade uttaget har validerats ersätts underlaget. Nätfel eller spärrar behåller de redan inlagda bilantalen. Kommunala totaler och körsträcka kan även redigeras med egen motivering. Manuellt ändrade fält får egen källstatus; oförändrade registervärden behåller sin källa. Originalfil, filter, kontrollsummor och kommunavstämning finns i `underlag/raw/scb/` och i projektets metadata.

OpenStreetMap används som nätbaserad bakgrund. Gävle har en separat, generaliserad landmask för kartvisning. För Malmö och Helsingborg saknas en ny oberoende kustmask i denna leverans: SCB:s områden kan därför sträcka sig ut över vatten. Beräkningens gränser omfattar officiella kommunala vattenområden; en visningsmask ändrar inte analysgeometrin. Ingen landareal presenteras som verifierad när den saknas.

## Ladda upp och gör commit

1. Packa upp paketet. Öppna mappen `vagvis_2_1_1`.
2. Skapa helst ett nytt GitHub-repo för en ren installation. Välj **Add file → Upload files** och ladda upp mappens **innehåll**. `streamlit_app.py` ska ligga direkt i repots rot, inte i en extra undermapp.
3. Kontrollera att `.github/` och `.streamlit/` följer med. GitHubs filuppladdning visar inte alltid dolda mappar; GitHub Desktop eller Git kan användas för att lägga till hela innehållet.
4. Skriv exempelvis `Vägvis 2.1.1 självständiga modeller` och välj **Commit changes**.
5. Välj repot och huvudfilen `streamlit_app.py` i Streamlit Community Cloud. Använd Python 3.12. Inga hemligheter eller API-nycklar behövs för den färdigbyggda appen.
6. Kontrollera att appen visar **Vägvis 2.1.1** och öppna knappen **Beräkningsbeskrivning och källor** längst ner.

Vid uppdatering av ett befintligt repo ersätter uppladdningen endast filer med samma sökväg. Gamla filer och kataloger tas inte bort automatiskt. Använd paketets filstruktur som facit och ta bort överblivna sidor, källfiler och arkiv från äldre installationer innan du gör slutlig commit. Ändra inte filernas placering.

## Köra på egen dator

Installera Python 3.12. Windows-användare kan dubbelklicka på `STARTA_LOKALT_WINDOWS.cmd`. Alternativt, kör i paketets rot:

```bash
python -m pip install -r requirements.txt
python -m streamlit run streamlit_app.py
```

Öppna adressen som visas i terminalen. Beräkningarna sker i webbläsaren. OpenStreetMaps kartbakgrund behöver internet; kartplattor ingår inte i paketet. `app/Vagvis.html` kan även öppnas direkt i en modern webbläsare utan Streamlit. Underlag och beräkningar är inbyggda i denna fil.

## Hämta och aktivera nya primärdata

Den publicerade appen anropar inte statistik-API:er när besökaren öppnar den. Data hämtas separat, med råsvar och kvitto, innan de eventuellt aktiveras.

Utan lokal Python: välj **Actions → Hamta kallunderlag → Run workflow** i GitHub. Flödet hämtar SCB-tabellerna och aktiverar endast ett komplett, validerat uttag i sin tillfälliga arbetskopia. Då byggs även HTML-sidorna om. Öppna körningen och hämta **Vagvis-kallunderlag** under **Artifacts**. Paketet innehåller kvitto och uppdaterade data- och appfiler. Läs kvittot och kontrollera källornas enheter, år, områdesversion och målpopulation innan du laddar upp dessa filer med samma sökvägar och gör en ny commit. Flödet gör ingen commit åt dig. Ett misslyckat uttag markeras som fel; kvittot sparas och baslinjen ersätts inte.

Lokalt:

```bash
python verktyg/hamta_underlag.py --out underlag/hamtat
```

För att aktivera ett komplett, validerat SCB-uttag i modellens underlag:

```bash
python verktyg/hamta_underlag.py --out underlag/hamtat --activate
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
```

Aktivering kräver de efterfrågade tabellerna för rätt år och områden. Startpaketet har 348 DeSO 2025 och 144 RegSO 2025; RegSO är den högre områdesnivån och ska inte förväxlas med kommunernas administrativa stadsdelar. Ofullständiga uttag ska inte användas som nollor. Kontrollera också källstatusen för startunderlaget: officiella kommunvärden och områdesvärden som fördelats med schablon har olika evidensstyrka. Ett framgångsrikt API-anrop gör inte en bedömd fördelning till en observation. Komplettera med dokumenterade vägflöden för A och representativa körsträckedata för B för att stärka resultaten.

### Läsa in en ny SCB-export för bilar

Det medföljande underlaget är redan inläst. Om du senare ersätter bilfilen, kör i paketets rot:

```bash
python verktyg/importera_scb_bilar.py TAB6589_sv.zip --year 2024
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
```

Importören kontrollerar alla 348 DeSO, status, år och kommunavstämning före aktivering. En vanlig offlineombyggnad återläser och validerar den paketerade originalfilen så att registerbilarna bevaras. Filen innehåller även 2025 men den här beräkningsbaslinjen använder 2024.

## Ändra och kontrollera modellen

Node.js 22 behövs för att bygga om appen; Streamlit behöver endast de färdigbyggda HTML-filerna. Byggningen använder medföljande underlag och behöver ingen nätanslutning:

```bash
python verktyg/bygg_underlag.py
node kallkod/bygg_appen.cjs
node tests/test_modell.cjs
node tests/test_register.cjs
python -m unittest discover -s tests -p 'test_*.py' -v
```

Byggningen räknar om A:s startresultat från modellens aktuella kod, data, inställningar och slumptalsfrö. Den läser inte in en tidigare versions numeriska resultat. B beräknas av sin egen beräkningsmotor med samma livscykelkomponenter. Fast slumptalsfrö och oförändrad modell ger reproducerbara simuleringar; tidstämplar kan skilja sig.

Ändra `kallkod/source/` för kod och `kallkod/data/config.json` för beräkningsinställningar. Ändringar i källregistret påverkar dokumentationen; ändra den faktiska numeriska inställningen eller källdatan för att ändra resultatet. Bygg om, kör kontrollerna och granska resultatet innan commit. Byggskriptet återskapar `app/` och `underlag/SHA256.json`. Om enbart dokumentation eller gränssnitt ändrats kan `node kallkod/bygg_appen.cjs --reuse-result` återanvända det färska A-resultatet. Det kräver samma modellversion och exakt samma indata och konfiguration enligt fingeravtrycket; annars avbryts bygget. Efter ändrad beräkningskod ska ett fullständigt bygge köras.

GitHub-flödet **Kontrollera Vagvis** bygger appen, kör numeriska och strukturella kontroller och installerar sedan den riktiga Streamlit-versionen för serverstart och kontroll av Python-huvudfilen. Dessutom installeras Chromium via Playwright för riktiga kontroller av modellbyte, kartvyer, metodknapp, åtgärdsscenario och export. Körningen sparar kontrollresultat och skärmdumpar i artefakten **Vagvis-kontroller**. Granska dessa tillsammans med manuella rimlighetskontroller av valda områden.

## Innehåll och rättigheter

| Sökväg | Innehåll |
|---|---|
| `streamlit_app.py` | Huvudfil för Streamlit |
| `vagvis_sidor.py` | Tillåtna färdigbyggda sidor |
| `app/` | Körbar app, metodsida och underlagsbegäran |
| `kallkod/source/` | Gränssnitt och självständiga beräkningsmotorer |
| `kallkod/data/` | Modellens aktiva underlag och inställningar |
| `underlag/` | Primärunderlag, uttagskvitton, källregister och åtgärder |
| `verktyg/` | Hämtning och reproducerbar databeredning |
| `tests/` | Numeriska kontroller och paketkontroller |
| `dokument/` | Fristående manual och begäran om trafikunderlag |
| `.github/workflows/` | Automatiska kontroller och manuell datahämtning |
| `licenser/` | Licens för medföljande Leaflet |

Koden omfattas av MIT-licensen i `LICENSE.txt`. Källdata behåller sina egna villkor. OpenStreetMaps attribution och databaslicens ska respekteras; Leaflet har BSD 2-Clause-licens. Inga personidentifierande hushållsdata eller API-hemligheter ska läggas i repot.
