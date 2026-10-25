# Vägvis åtgärdsscenarier

Version 2.1.1. Datum 23 oktober 2026.

Modulen anger hur explicita användarantaganden påverkar ett basfall. Den skattar inte en lokal kausal effekt enbart utifrån åtgärdens namn. Fjorton åtgärder finns i katalogen. Samtliga har neutral effekt som grundinställning. Noll betyder att inget kvantifierat effektantagande har lagts in. Det betyder inte att en genomförd åtgärd saknar effekt.

## Parametrar

Varje vald åtgärd har deltagande `coverage` mellan 0 och 1, genomförande `intensity` mellan 0 och 1 samt relativa förändringar av `cars`, `vkm` och `energy`. −0,10 betyder en minskning med tio procent för den fullt berörda målgruppen. `vkm` avser hela den årliga förändringen av fordonskilometer och omfattar redan den eventuella effekt som färre bilar har på körningen. `energy` avser energiåtgång per kilometer, inte tillverkning.

En valbar gemensam effektandel `effectScale` mellan 0 och 1 kan användas för att dämpa samtliga effekter. Standardvärdet är 1. Parametern är ett användarantagande, inte en statistiskt skattad överlappsfaktor.

För åtgärd j bildas vikten w_j = coverage_j × intensity_j × effectScale. För varje dimension x bildas den samlade faktorn F_x = produkten av (1 + w_j × e_jx). Exempelvis ger två antagna minskningar av bilkörningen med 10 procent faktorn 0,90 × 0,90 = 0,81. Att effekterna kan kombineras så är ett uttryckligt modellantagande. Två underlag som redan mäter samma förändring får inte betraktas som oberoende tillägg.

Efter beräkningen gäller cars_efter = cars_före × F_cars och vkm_efter = vkm_före × F_vkm. Körsträckan per kvarvarande modellerad bil är vkm_efter / cars_efter. Vägvis multiplicerar aldrig F_vkm med F_cars en gång till. Om scenariot ger noll bilar men positiv körning avvisas den inkonsistenta kombinationen.

## Valbart litteraturexempel för bilpool

Nijland, van Meerkerk och Hoen redovisar i en nederländsk studie över 30 procent lägre bilinnehav och cirka 15–20 procent färre bilkilometer bland studerade bilpoolsanvändare efter att de börjat använda bilpool. Ett valbart överföringsscenario använder −30 procent för bilinnehav och −17,5 procent för fordonskilometer. Det första är en vald avrundad nivå nära den rapporterade förändringen. Det andra är mittpunkten mellan 15 och 20 procent. Exemplet gäller den deltagande målgruppen. Det är inte en empirisk effekt för svenska DeSO, och Vägvis använder inte studiens utsläppsresultat som en separat faktor.

Om 50 procent av 100 hushåll deltar och basfallet har 100 bilar och 1 000 000 fordonskilometer blir F_cars = 0,85 och F_vkm = 0,9125. Efter beräkningen återstår 85 modellerade bilar och 912 500 fordonskilometer. Körsträckan per bil blir cirka 10 735,3 kilometer. Exemplet visar varför bilantal och total körning behöver hanteras separat.

Nijland, H., van Meerkerk, J. och Hoen, A. (2015). *Impact of car sharing on mobility and CO2 emissions*. PBL Netherlands Environmental Assessment Agency, publikation 1842. Tillgänglig på: https://www.pbl.nl/en/publications/impact-of-car-sharing-on-mobility-and-co2-emissions (Hämtad 23 oktober 2026).

## Kodgränssnitt

`require('./scenarios.js')` och `window.VagvisScenarios` ger samma API. `initialState()` ger ett avstängt tillstånd. `effects(state, options)` beräknar faktorer och en spårbar lista över bidrag. `apply(baseline, state, options)` räknar om ett basfall med `cars`, `vkm` och valfritt `households`.

Tillståndet använder åtgärds-id som nyckel. Ett litteraturexempel anges exempelvis som `{bilpool: {enabled: true, coverage: 0.5, intensity: 1, preset: 'carsharing_pbl2015'}}`. För egna värden används `effects: {cars: -0.1, vkm: -0.08, energy: 0}`. Egna effekter har företräde framför ett valt förvals effekter. Beräkningskvittot skiljer dessa användarantaganden från litteraturexemplet.

Modulen innehåller inga geografiska fördelningsregler, inga antagna 25 kilometer långa resor och inga statistiska osäkerhetsfördelningar. Sådana beräkningar ska definieras separat av de moduler som använder scenariofaktorerna.
