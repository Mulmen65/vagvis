# Valbar skattning av körsträcka per DeSO

Vägvis 2.3.0, 26 oktober 2026.

Delmodellen fördelar B-modellens kommunala trafikarbete mellan DeSO. Grundinställningen är fortsatt `household.kmMode = "local"`. Befintliga kommun- och rikslägen behåller sina beräkningar. Det nya läget heter `deso_estimate` och används först efter ett aktivt val.

## Syfte och status

Delmodellen är en öppen uppskattning för känslighetsanalys. Den använder registrerade bilantal, tillgängliga indikatorer och valda känslighetskoefficienter. Den har inte skattats eller validerats mot observerad årssträcka per DeSO. En bättre geografisk upplösning är inte i sig bevis för bättre träffsäkerhet. Körsträckans status är `model_estimate`.

SCB har meddelat att körsträckor levereras ned till kommunnivå. Paketet förutsätter därför ingen beställning av DeSO-körsträckor från SCB. Ett förslag till förfrågan om RVU-analysuttag finns i `dokument/Bestallning_korstracka_DeSO_SCB.txt`; filnamnet behålls för befintliga länkar.

## Indikatorer och faktisk täckning

Indikatorerna finns i `kallkod/data/distance-indicators.json`. Metadata, hämtningskvitton och aktiv visning anger faktiskt antal numeriska värden, källor, datum och geografiska approximationer. En beskriven datakälla innebär inte att dess värden har lästs in.

| Indikator | Transformation | Grundkoefficient |
|---|---|---:|
| Avstånd till valt centrum | ln(1 + km) | 0,12 |
| Avstånd till kollektivtrafikpunkt | ln(1 + km) | 0,08 |
| Avstånd till service eller dagligvaror | ln(1 + km) | 0,08 |
| Median ekonomisk standard | ln(inkomst) | 0,10 |
| Registrerade bilar per hushåll | ln(1 + bilar/hushåll) | 0,00 |

Samtliga koefficienter är valda modellantaganden. De är inte numeriskt hämtade från Elldér (2015), Berry och Börjesson (2026) eller RVU. Grundkoefficienten noll för bilinnehav undviker en obelagd extra koppling utöver det registrerade bilantal som redan driver trafikarbete.

Saknad indikator ger bidrag noll. Ett skyddat eller saknat inkomstvärde blir aldrig noll kronor eller ett påhittat kommunvärde. Indikatorernas geografiska år skiljs från beräkningsåret. Nutida OSM-geometri är en proxy när den används för basår 2024 och bevisar inte hur service eller kollektivtrafik såg ut 2024.

SCB:s median ekonomisk standard i TAB6684 är disponibel inkomst justerad för hushållets storlek och sammansättning, med individen som analysenhet. Inkomstår 2024 använder DeSO 2025. TAB6589 och TAB6568 ger bilantal och hushåll. Deras kvot visar inte fördelningen mellan hushåll med noll, en och flera bilar (SCB, 2026a, 2026b; SCB och Trafikanalys, 2026).

Avstånd beskrivs enligt faktiskt beräkningssteg. Fågelvägsavstånd är inte gångtid eller restid. Startpunkter från bostadsgator är en geografisk proxy och inte befolkningsrutor. OSM:s hållplatspunkter beskriver inte avgångsfrekvens. Tidtabellsbaserad tillgänglighet kräver en faktisk bearbetning av GTFS. Historik för 2024 kan sökas via KoDa; API-nyckel behövs (Samtrafiken, u.å.).

## Relativ fördelning och kommunankare

För varje indikator centreras transformerade giltiga värden med kommunens bilantal som vikt. Saknade värden har neutralt bidrag. Den relativa poängen är:

\[
r_i=\exp\left(\sum_k\beta_k[x_{ik}-\bar{x}_{ck}]\right).
\]

För den aktiva bilpopulationen väljs en gemensam skalfaktor så att:

\[
f_i=\max\{f_{min},\min[f_{max},\lambda r_i]\},\qquad
\sum_{i\in c}P_if_i=\sum_{i\in c}P_i.
\]

Därefter beräknas:

\[
K_i=K_c f_i,\qquad V_i=P_iK_i,\qquad E_i=V_iF/10^6.
\]

`P` är registrerade personbilar, `K` km per bil och år och `F` livscykelfaktor i g CO2e per fordonskm. Grundgränserna är 0,65 och 1,50 gånger kommunankaret och gäller den centrala grundskattningen. Monte Carlo-variation kan ge värden utanför gränserna. Gränserna och normaliseringen löses tillsammans; en efterföljande enkel klippning skulle kunna bryta kommunens summa. Om alla bidrag är neutrala blir `f = 1`. Om kommunen saknar bilar blir trafikarbetet noll.

Kommunankaret är bilvägt medel av de befintliga lokala körsträckorna, med riksvärde som reserv. I medföljande data är det 11 892 km för Malmö, 12 917 km för Helsingborg och 12 521 km för Gävle. Dessa är härledda privatbilsnivåer: nationell nivå multipliceras med kommunens relativa körsträcka för samtliga personbilar. RUS-medlet omfattar bilar som varit i trafik någon gång under året, inklusive juridiska personer. Överföringen till privata bilar vid årets slut innehåller därför ett populationsantagande (RUS och SCB, 2025; Trafikanalys, 2025a, 2025b).

Kommunnormalisering säkrar summan av bastrafikarbetet. Den visar inte att ett enskilt DeSO har rätt körsträcka. Med gemensam livscykelfaktor inom kommunen blir kommunens centrala basutsläpp samma som i kommunläget, medan fördelningen mellan DeSO och RegSO kan ändras.

## Scenarier och osäkerhet

Scenarier utgår från den beräknade basfördelningen. Åtgärdernas faktorer för körning multipliceras därefter och normaliseras inte bort. Nya hushåll använder det valda områdets körsträcka när en egen körsträcka inte har angetts. Samband i basmodellen ska inte tolkas som kausala effekter av att bygga en station eller butik.

Det valbara läget har en separat lokal CV med grundvärde 0,35. Detta är ett antagande. Lokala lognormala faktorer normaliseras med `P × K`, så att lokal omfördelningsvariation inte ändrar kommunens trafikarbete före kommunens gemensamma variation. Kommunankarets och livscykelfaktorernas osäkerhet hanteras separat. Modellintervallen är villkorade av dessa val. Koefficienternas kunskapsosäkerhet kräver dokumenterade alternativa koefficientuppsättningar eller framtida empirisk skattning; CV är inte ett empiriskt konfidensintervall för koefficienterna.

## Evidens och fortsatt validering

Elldér (2015) visar stöd för att pröva geografisk närhet i modeller för dagliga reslängder, med tydliga skillnader mellan reseärenden. Studien ger inga färdiga värden för årssträcka per hushållsregistrerad bil i DeSO. Berry och Börjesson (2026) skiljer bilinnehav från körning villkorad på bilinnehav. Deras totala inkomstelasticitet för hushållens privata trafikarbete ska inte direkt läggas på km per bil när bilantalet redan ingår i Vägvis.

Skånes RVU 2023 kan bidra till en framtida skattning men kräver bilförarsträcka separat från passagerarsträcka, nollresdagar, rätt analysvikter, matchning av bilpopulation och dokumenterad överföring från höstdag till helår (Region Skåne, 2024). Modellens geografiska prognos bör prövas i områden som inte användes vid skattningen och jämföras med grundmodellen som använder samma körsträcka inom kommunen.

## Referenser

Berry, C. och Börjesson, M. (2026). Are the rich reaching saturation: Income and fuel price elasticities of car ownership and use. *Economics of Transportation*, 45, 100448. https://doi.org/10.1016/j.ecotra.2026.100448

Elldér, E. (2015). *The changing role and importance of the built environment for daily travel in Sweden*. Göteborgs universitet, Series B, 126. https://gupea.ub.gu.se/server/api/core/bitstreams/0bec7cb4-5023-4785-9ac1-f3555f0c72f9/content

OpenStreetMap-bidragsgivare (u.å.). *Overpass API*. https://wiki.openstreetmap.org/wiki/Overpass_API

Region Skåne (2024). *Metodrapport Skånes resvaneundersökning 2023*. https://utveckling.skane.se/siteassets/publikationer/metodrapport---skanes-resvaneundersokning-2023.pdf

RUS och SCB (2025). *Körsträckedata per kommun, tabell 2 Körsträcka*. https://www.rus.se/statistik-och-indikatorer/korstrackor/

Samtrafiken (u.å.). *GTFS Sweden 3 och KoDa*. Trafiklab. https://www.trafiklab.se/api/gtfs-datasets/gtfs-sweden/ och https://www.trafiklab.se/api/our-apis/koda/

SCB (2026a). *Ekonomisk standard, andel av befolkningen per inkomstklass efter region. Fasta priser. År 2011–2024*. TAB6684. https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__HE__HE0110__HE0110I/Tab3InkDesoRegso/

SCB (2026b). *Antal hushåll per region efter hushållstyp*. TAB6568. https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__BE__BE0101__BE0101Y/HushallDesoTyp/

SCB och Trafikanalys (2026). *Personbilar registrerade på folkbokförda personer 31 december efter status och region*. TAB6589. https://www.statistikdatabasen.scb.se/pxweb/sv/ssd/START__TK__TK1001__TK1001Z/PersBilarDesoN/

Trafikanalys (2025a). *Körsträckor 2024*. Statistik 2025:10.

Trafikanalys (2025b). *Fordon i län och kommuner 2024*.
