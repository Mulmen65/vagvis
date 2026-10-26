# Indata till valbar körsträckeskattning per DeSO

Indikatorer är förklarande variabler. De är inte uppmätta körsträckor och innehåller inga statistiskt skattade samband med årssträcka per bil.

## Hämta och bygg

Kör `python verktyg/hamta_korstrackeindikatorer.py`. Hämtaren söker SCB:s originalexport TAB6684 och OpenStreetMap via Overpass för samtliga tre kommuners sökrutor. Inga API-nycklar behövs. Nätfel bevarar senaste användbara cache per källa; misslyckade hämtningar redovisas i `senaste_hamtning.json`. Därefter byggs indikatorerna från tillgängliga källor. Kör appbygget efter uppdateringen enligt paketets huvudinstruktioner.

För enbart reproducerbart offlinebygge: `python verktyg/bygg_korstrackeindikatorer.py`.

## Inkomstfil utan programmering

1. Öppna SCB:s tabell https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__HE__HE0110__HE0110I/Tab3InkDesoRegso/.
2. Välj **Ladda ner hela tabellen som csv-fil (TAB6684_sv.zip)**.
3. Kör `python verktyg/hamta_korstrackeindikatorer.py --income-zip TAB6684_sv.zip --no-network`.

Importen kräver år 2024, måttet Medianvärde, tkr, och exakt de 348 DeSO 2025 som finns i paketet. Kommun-/RegSO-rader används inte som DeSO. Skyddade celler behålls som null. Felaktig eller ofullständig fil ersätter inte tidigare användbara data.

## Mått

- **centreKm:** genomsnittlig fågelvägsdistans från längdviktade bostadsgator till vald centrumreferens. Stortorget i respektive stad är ett avrundat modellval i `centrumreferenser.json`; det är inte en officiell centrumdefinition.
- **transitKm:** närhet till fysisk kollektivtrafiknod: station/tåghållplats/spårvagnshållplats eller busstation. OSM-taggar railway=station/halt/tram_stop, amenity=bus_station eller public_transport=station. Detta är **inte** turtäthet, restid eller ett mått på alla busshållplatser.
- **serviceKm:** närhet till OSM-dagligvarubutik, shop=supermarket/convenience. Detta är **inte** tillgång till alla servicefunktioner.
- **income:** SCB median ekonomisk standard, tusentals kronor i 2024 års priser. Det är ekvivalerad disponibel inkomst för befolkningen i helårshushåll, inte specifikt bilägarnas inkomst.
- **bph:** registerbilar/hushåll. Kvoten är inte fördelningen av hushåll med noll, en eller flera bilar.

Alla distanser är fågelväg. Trettio deterministiska längdkvantiler per DeSO representerar bostadsgator, inte befolkningstäthet. Geometrin klipps mot DeSO-gränser. Där bostadsgator saknas används vägar klassade unclassified som uttrycklig fallback; saknas även dessa blir geografiska mått null. Befintliga polygonkoordinaters medel används aldrig som dold ersättning.

Vägnätet avser oktober 2026. Överföring till beräkningsåret 2024 är ett synligt antagande. OSM:s butikspunkter och fysiska stationer bevisar inte öppethållande eller trafikering 2024. Dagligvarubutiker utanför kommungränsen tillåts inom de dokumenterade sökrutorna. OSM-täckningen är inte verifierad fullständig.

## Egen dokumenterad punktfil

`--poi-json FIL.json --no-network` godtar följande format. Raderna nedan är en schemabeskrivning; skapa inte påhittade punktobservationer.

```json
{"schema":"vagvis-osm-access-points-1","osmTimestamp":"källans datum","points":[]}
```

Varje faktisk punkt har `id` (stabilt OSM-typ/ID eller eget dokumenterat ID), `kk` (1280/1283/2180), `kind` (transit/service), `lon`, `lat` samt frivilligt `name`/`tags`. Saknas en kommuns kategori blir motsvarande indikator null. Källor och datum ska anges i `sources`. Använd inte data från Pipos/Delfi i en offentlig distribution utan tillåtelse; dessa är inte samma öppna licens som OSM.

## Källor och rättigheter

SCB (2026). *Ekonomisk standard, andel av befolkningen per inkomstklass efter region. Fasta priser. TAB6684*. https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__HE__HE0110__HE0110I/Tab3InkDesoRegso/.

OpenStreetMap contributors (2026). *OpenStreetMap*. ODbL 1.0. https://www.openstreetmap.org/copyright. Overpass-dokumentation: https://wiki.openstreetmap.org/wiki/Overpass_API.

SCB och Trafikanalys (2026). *Personbilar registrerade på folkbokförda personer 31 december. TAB6589*. Hushåll: SCB TAB6568. Registeruppgifter från 2024 finns i huvudpaketets underlag.
