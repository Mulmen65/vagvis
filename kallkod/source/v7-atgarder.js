// Mobilitetsåtgärder, effektstorlekar, samverkansregler och referenser.
// Allt efter window.ATGARDER = är JSON: dubbla citattecken, inga kommentarer, inga avslutande kommatecken.
// eB = bilar per hushåll, eV = fordonskm per hushåll, eC = CO2 per km, [central, minst, mest].
// roll: push = gör bilen mindre attraktiv, pull = gör alternativen bättre, stod = övrigt.
// Python-modellen klimatmodell.py läser samma fil.
window.ATGARDER = {
 "version": "2026-10-19, med IVL C820 och referenskontroll",
 "roller": {
  "push": "Gör bilen mindre attraktiv",
  "pull": "Gör alternativen mer attraktiva",
  "stod": "Stöd, incitament och körsätt"
 },
 "overlapp": 0.5,
 "samverkan": {
  "overlapp": 0.5,
  "pullUtanPush": [
   0.7,
   0.5,
   1.0
  ],
  "ivlPaket": {
   "pushpull": [
    0.1,
    0.3
   ],
   "pull": [
    0.05,
    0.15
   ]
  },
  "text": [
   "Effekterna kan inte adderas. Åtgärder som riktar sig till samma resor överlappar, och IVL konstaterar att summan av enskilda effekter blir för hög. Inom samma grupp räknas därför den största effekten fullt och övriga med 50 %. Mellan grupper multipliceras effekterna.",
   "Push och pull behövs tillsammans. Paket som både gör bilen mindre attraktiv (push) och alternativen mer attraktiva (pull) minskar biltrafikarbetet med 10–30 %, medan paket med enbart positiva incitament minskar det med 5–15 %. Förbättrad kollektivtrafik som ensam åtgärd ger ofta liten överflyttning. Modellen räknar därför pull-åtgärdernas effekt med 70 % (50–100 %) när inget i paketet gör bilen mindre attraktiv, och med full effekt när en push-åtgärd genomförs fullt ut. Däremellan skalas faktorn linjärt mot push-åtgärdens nivå.",
   "Ett bra paket står på tre ben: bättre alternativ till bilen, ekonomiska och administrativa styrmedel för bilen, och en markanvändning med täthet, närhet och funktionsblandning. Information och incitament förstärker effekten och acceptansen av de övriga styrmedlen. Modellen visar vilka ben ett valt paket täcker.",
   "Åtgärder som sänker utsläppen per kilometer, som lägre hastighet på motorleder, påverkar inte antalet kilometer. Deras effekt multipliceras med effekten på fordonskm när klimatpåverkan räknas fram."
  ],
  "refs": [
   "ivl2024",
   "kuss2022",
   "litman2023a"
  ]
 },
 "grupper": [
  {
   "id": "parkering",
   "namn": "Parkering",
   "roll": "push"
  },
  {
   "id": "gatuutrymme",
   "namn": "Gatuutrymme och trafikzoner",
   "roll": "push"
  },
  {
   "id": "avgift",
   "namn": "Avgifter för biltrafik",
   "roll": "push"
  },
  {
   "id": "kollektiv",
   "namn": "Kollektivtrafik",
   "roll": "pull"
  },
  {
   "id": "cykel",
   "namn": "Cykel",
   "roll": "pull"
  },
  {
   "id": "delad",
   "namn": "Delad mobilitet",
   "roll": "pull"
  },
  {
   "id": "arbete",
   "namn": "Arbetsresor",
   "roll": "stod"
  },
  {
   "id": "info",
   "namn": "Information och beteende",
   "roll": "stod"
  },
  {
   "id": "korsatt",
   "namn": "Hastighet och körsätt",
   "roll": "stod"
  }
 ],
 "lista": [
  {
   "id": "parkeringspris",
   "grupp": "parkering",
   "roll": "push",
   "namn": "Parkering prissätts separat och marknadsmässigt",
   "kort": "Boende- och gatuparkering får ett pris nära marknadsnivå och hyrs separat från bostaden.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av full nivå (100 % ≈ marknadspris, ungefär fördubblat)",
   "eB": [
    -0.1,
    -0.05,
    -0.15
   ],
   "eV": [
    -0.12,
    -0.05,
    -0.25
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Nederländerna, Norge; IVL:s internationella översikt",
   "harledning": "I Amsterdam motsvarade väntetiden för boendeparkering en priselasticitet för bilinnehav på −0,8, och norska data visar att hushåll med egen parkering har betydligt fler bilar. IVL:s översikt (2024) anger att marknadsmässiga parkeringsavgifter och färre platser minskar bilinnehavet med 5–15 % och antalet bilresor med 10–30 %, och att marknadsmässiga avgifter på all gatuparkering i en stadsdel kan minska biltrafikens utsläpp där med upp till 30 % (amerikansk handbok). En del av bilresorna i området görs av besökare och pendlare, så effekten på de boendes körning är mindre. Modellen använder −10 % bilinnehav (−5 till −15 %) och −12 % fordonskm (−5 till −25 %).",
   "refs": [
    "degroote2015",
    "toi1425",
    "christiansen2017",
    "ivl2024"
   ],
   "endastNy": false
  },
  {
   "id": "parkeringsutbud",
   "grupp": "parkering",
   "roll": "push",
   "namn": "Färre parkeringsplatser i befintliga områden",
   "kort": "Gatuparkering tas bort eller görs om till cykelbanor, grönska och sociala ytor; boendeparkeringen minskar.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av full nivå (100 % ≈ hälften av gatuparkeringen tas bort)",
   "eB": [
    -0.05,
    -0.02,
    -0.1
   ],
   "eV": [
    -0.06,
    -0.02,
    -0.13
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "C",
   "geografi": "Norge, Frankrike; IVL:s internationella översikt",
   "harledning": "IVL:s översikt (2024) anger att ett minskat utbud av parkeringsplatser i bostadsområden kan minska biltrafikens utsläpp i området med upp till 13 % (amerikansk handbok). Oslo minskade gatuparkeringen i centrum från 1 450 till 690 platser och Paris tar bort hälften av sina 140 000 gatuplatser, i båda fallen som del av större paket. Norska data visar att parkering nära bostaden ökar bilinnehavet. Modellen använder −5 % bilinnehav (−2 till −10 %) och −6 % fordonskm (−2 till −13 %). Effekten överlappar med prissättning av parkering.",
   "refs": [
    "ivl2024",
    "hagen2021",
    "toi1425"
   ],
   "endastNy": false
  },
  {
   "id": "mobilitetshus",
   "grupp": "parkering",
   "roll": "push",
   "namn": "Samlad parkering i mobilitetshus",
   "kort": "Bilparkeringen samlas i hus i områdets utkant, minst lika långt från bostaden som hållplatsen.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av bilplatserna ligger i mobilitetshus",
   "endastNy": true,
   "eB": [
    -0.05,
    0,
    -0.1
   ],
   "eV": [
    -0.1,
    -0.05,
    -0.15
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "C",
   "geografi": "Norge, Sverige (Malmö)",
   "harledning": "Norska studier visar att viljan att ta bilen minskar med gångavståndet till parkeringen och att hushåll som parkerar mer än 200 meter bort använder bilen mindre. En jämförelse mellan fastigheter i Malmö visar att efterfrågan på parkering var 25–50 % lägre där de boende hade tillgång till bilpool eller cykelpool (refererad i IVL 2024). Hur stor effekten av själva avståndet är har inte kvantifierats väl. Modellen antar −10 % fordonskm (−5 till −15 %) och −5 % bilinnehav (0 till −10 %). Åtgärden gäller bara nya bostäder.",
   "refs": [
    "christiansen2017",
    "toi1425",
    "grybb2023"
   ]
  },
  {
   "id": "gatuutrymme",
   "grupp": "gatuutrymme",
   "roll": "push",
   "namn": "Omfördelat gatuutrymme, cirkulationsplan eller lågtrafikområde",
   "kort": "Bilkörfält och gatuparkering görs om till gång, cykel, kollektivtrafik och stadsliv; genomfart med bil stängs.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av området omfattas",
   "eB": [
    -0.02,
    0,
    -0.05
   ],
   "eV": [
    -0.1,
    -0.04,
    -0.2
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Norge, Belgien, Spanien, Storbritannien; 70 fall i 11 länder",
   "harledning": "IVL lyfter omfördelning av gatuutrymme som en nyckelåtgärd. I ett 70-tal fall i 11 länder minskade biltrafiken i de berörda områdena med i median 10,6 % och i medel 21,9 %; bara en liten del flyttade till andra gator. Effekten var 15–28 % när större områden omfattades och 4–52 % för enstaka gator. I Oslos centrum minskade biltrafiken med 11 % 2016–2018 och 19 % 2018–2019, i Gent sjönk bilens andel av resorna från 45 till 38 % och Barcelonas superkvarter minskade trafiken med cirka 15 %. Trafiken i ett område omfattar även genomfart, så de boendes egen körning minskar mindre. IVL använder själv −10 % i sina beräkningar. Modellen använder −10 % fordonskm (−4 till −20 %) och −2 % bilinnehav (0 till −5 %).",
   "refs": [
    "ivl2024",
    "cairns2002",
    "hagen2021",
    "ivlgent"
   ],
   "endastNy": false
  },
  {
   "id": "trangselskatt",
   "grupp": "avgift",
   "roll": "push",
   "namn": "Trängselskatt",
   "kort": "Avgift för att köra in i eller genom centrala staden, som i Stockholm och Göteborg.",
   "typ": "binar",
   "eB": [
    0,
    0,
    -0.02
   ],
   "eV": [
    -0.05,
    -0.02,
    -0.1
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Sverige; IVL:s internationella översikt",
   "harledning": "Trafiken över betalsnittet minskade med 22 % när trängselskatten infördes i Stockholm och med 12 % i Göteborg, och effekten har bestått. IVL:s översikt anger att vägavgifter för att köra in i städer minskar biltrafiken med 10–30 %. Boendes totala bilkörning minskar mindre, eftersom bara en del av körningen passerar snittet. Modellen antar −5 % fordonskm (−2 till −10 %) och ingen säker effekt på bilinnehavet.",
   "refs": [
    "borjessonitf",
    "borjesson2012",
    "borjesson2015",
    "borjesson2017",
    "ivl2024"
   ],
   "endastNy": false
  },
  {
   "id": "kollektivtrafik",
   "grupp": "kollektiv",
   "roll": "pull",
   "namn": "Spårväg, BRT eller stomlinje med hög turtäthet",
   "kort": "Ny eller kraftigt förbättrad kollektivtrafik inom ungefär 500 meter från bostäderna.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av full nivå",
   "eB": [
    -0.03,
    0,
    -0.06
   ],
   "eV": [
    -0.08,
    -0.03,
    -0.15
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Norge, Sverige; IVL:s internationella översikt",
   "harledning": "Efter att Bybanen öppnade i Bergen sjönk bilens andel av resorna från 58,8 % till 50,7 % (2008–2014). IVL:s översikt anger att snabb, bekväm kollektivtrafik med hög turtäthet ökar resandet i berörda stråk med 20–50 % och minskar bilresandet med 5–15 %, men att förbättrad kollektivtrafik som ensam åtgärd ofta ger liten överflyttning. I en modellanalys för bland annat Malmö gav stomlinjer för buss med full framkomlighet tillsammans med fördubblade parkeringsavgifter i centrum en överflyttning av 10–20 % av bilresorna. Modellen tillskriver kollektivtrafiken −8 % fordonskm (−3 till −15 %) och −3 % bilinnehav (0 till −6 %) när den kombineras med push-åtgärder, se Samverkan.",
   "refs": [
    "engebretsen2017",
    "toibergen",
    "ivl2024",
    "norheim2016"
   ],
   "endastNy": false
  },
  {
   "id": "elcykel",
   "grupp": "cykel",
   "roll": "pull",
   "namn": "Elcykel till hushållen",
   "kort": "Elcykelstöd, förmånscykel eller elcykelpool som ger hushållen tillgång till elcykel.",
   "typ": "andel",
   "min": 0,
   "max": 50,
   "steg": 5,
   "standard": 20,
   "nivaText": "av hushållen får elcykel",
   "perText": "per hushåll med elcykel",
   "eB": [
    0,
    0,
    -0.03
   ],
   "eV": [
    -0.15,
    -0.05,
    -0.25
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "A",
   "geografi": "Norge, Sverige",
   "harledning": "I ett naturligt experiment i Oslo minskade bilens andel av resorna med 10 procentenheter bland dem som fått elcykelstöd, jämfört med en kontrollgrupp. I ett norskt försök ökade cyklingen från 4,8 till 10,3 km per dag. Utvärderingen av den svenska elcykelpremien fann att ungefär hälften av elcykelresandet ersätter bilresor. Eftersom elcykeln främst ersätter kortare bilresor räknar modellen med −15 % fordonskm (−5 till −25 %) per hushåll med elcykel och ingen säker effekt på bilinnehavet.",
   "refs": [
    "sundfor2024",
    "fyhri2015",
    "nv2019"
   ],
   "endastNy": false
  },
  {
   "id": "cykelnat",
   "grupp": "cykel",
   "roll": "pull",
   "namn": "Snabbcykelväg och sammanhängande cykelnät",
   "kort": "Separerade, gena cykelstråk som binder ihop området med centrum och stora arbetsplatser.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av full utbyggnad",
   "eB": [
    0,
    0,
    -0.02
   ],
   "eV": [
    -0.03,
    -0.01,
    -0.07
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Danmark, Storbritannien",
   "harledning": "Längs Farumruten i Köpenhamnsregionen ökade cykeltrafiken med 52 % på två år och 25 % av de nya cyklisterna hade tidigare kört bil. I brittiska orter som fick stöd för gång, cykel och kollektivtrafik (Local Sustainable Transport Fund) minskade bilkörningen med upp till 7 % jämfört med orter utan stöd (refererat i IVL 2024). Den som byter en bilresa om dagen mot cykel minskar sitt klimatavtryck med ungefär 0,5 ton per år. Modellen antar −3 % fordonskm vid full utbyggnad (−1 till −7 %).",
   "refs": [
    "farum2015",
    "ivl2024",
    "preston2016",
    "brand2021"
   ],
   "endastNy": false
  },
  {
   "id": "bilpool",
   "grupp": "delad",
   "roll": "pull",
   "namn": "Bilpool i fastigheten",
   "kort": "Delade bilar i eller nära huset, gärna med medlemskap som ingår i hyran eller avgiften.",
   "typ": "andel",
   "min": 0,
   "max": 60,
   "steg": 5,
   "standard": 25,
   "nivaText": "av hushållen är medlemmar",
   "perText": "per medlemshushåll",
   "eB": [
    -0.25,
    -0.11,
    -0.4
   ],
   "eV": [
    -0.2,
    -0.06,
    -0.4
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Sverige (Malmö), Nederländerna",
   "harledning": "Hushåll som går med i en bilpool äger över 30 % färre bilar och kör 15–20 % kortare med bil (Nederländerna). IVL:s översikt anger att bilinnehavet bland medlemmar minskar med 11 % eller mer, att körsträckan per person kan minska med 6–80 % och att en poolbil kan ersätta 7–15 privatbilar. I Malmö var efterfrågan på parkering 25–50 % lägre i fastigheter med bilpool eller cykelpool. Om bilpoolen blir ett komplement för hushåll som behåller bilen kan körningen i stället öka. Modellen använder −25 % bilinnehav (−11 till −40 %) och −20 % fordonskm (−6 till −40 %) per medlemshushåll.",
   "refs": [
    "nijland2015",
    "steorn2017",
    "ivl2024",
    "grybb2023"
   ],
   "endastNy": false
  },
  {
   "id": "grontransportplan",
   "grupp": "arbete",
   "roll": "stod",
   "namn": "Grön transportplan på arbetsplatsen",
   "kort": "Arbetsgivaren erbjuder rabatterat kollektivtrafikkort, cykelfaciliteter och rådgivning och tar betalt för parkeringen.",
   "typ": "andel",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 30,
   "nivaText": "av hushållen har någon som omfattas",
   "perText": "per hushåll som omfattas",
   "eB": [
    0,
    0,
    -0.02
   ],
   "eV": [
    -0.05,
    -0.02,
    -0.1
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Storbritannien, Sverige; IVL:s internationella översikt",
   "harledning": "Gröna transportplaner minskar bilpendlingen med i genomsnitt cirka 15 %: 5–15 % när de bygger på frivillighet och 20–25 % när de innehåller ekonomiska incitament som parkeringsavgifter. Region Östergötlands gröna resplan minskade klimatpåverkan med cirka 13 %. Modellen antar att arbetspendlingen är ungefär en tredjedel av hushållets bilkörning, vilket ger −5 % fordonskm (−2 till −10 %) per hushåll som omfattas.",
   "refs": [
    "ivl2024",
    "cairns2004",
    "trivector2016"
   ],
   "endastNy": false
  },
  {
   "id": "distansarbete",
   "grupp": "arbete",
   "roll": "stod",
   "namn": "Distansarbete tre dagar i veckan",
   "kort": "Arbetsgivare erbjuder distansarbete minst tre dagar i veckan där arbetet tillåter det.",
   "typ": "andel",
   "min": 0,
   "max": 60,
   "steg": 5,
   "standard": 20,
   "nivaText": "av hushållen har någon som arbetar hemifrån",
   "perText": "per hushåll som arbetar hemifrån",
   "eB": [
    0,
    0,
    0
   ],
   "eV": [
    -0.08,
    -0.03,
    -0.15
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "C",
   "geografi": "Storbritannien, Sverige",
   "harledning": "Tre dagar hemma i veckan tar bort ungefär 60 % av pendlingsresorna. En del av vinsten försvinner när den frigjorda tiden används till andra bilresor eller när man flyttar längre från jobbet. Brittiska resvanedata visar att de som arbetar hemifrån tre dagar eller mer i veckan minskar även sina övriga resor (refererat i IVL 2024). Med pendlingen som ungefär en tredjedel av bilkörningen antar modellen −8 % fordonskm (−3 till −15 %) per hushåll.",
   "refs": [
    "ivl2024",
    "caldarola2022"
   ],
   "endastNy": false
  },
  {
   "id": "radgivning",
   "grupp": "info",
   "roll": "stod",
   "namn": "Mobilitetsrådgivning, testresenär och testcyklist",
   "kort": "Personlig resplanering, information och prova-på för kollektivtrafik, bilpool och cykel, gärna vid inflyttning.",
   "typ": "andel",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av hushållen nås",
   "perText": "per nått hushåll",
   "eB": [
    0,
    0,
    0
   ],
   "eV": [
    -0.06,
    -0.03,
    -0.12
   ],
   "eC": [
    0,
    0,
    0
   ],
   "grad": "B",
   "geografi": "Storbritannien, Sverige (Helsingborg), europeiska städer",
   "harledning": "Rådgivning och kampanjer som uppmuntrar boende att välja annat än bil, gärna med rabatterad kollektivtrafik, minskar de boendes bilresor med 6–12 %. Personlig mobilitetsrådgivning har minskat andelen bilresor med 5–10 % i europeiska städer, och i det brittiska programmet Sustainable Travel Towns minskade bilkörningen per person med 6–10 % när rådgivningen kombinerades med bättre kollektivtrafik. I Helsingborgs testcyklistkampanj gjorde 79 % av deltagarna mer än hälften av sina arbetsresor med cykel ett år senare. Modellen antar −6 % fordonskm (−3 till −12 %) per nått hushåll.",
   "refs": [
    "cairns2004",
    "ivl2024",
    "cairnsjones2016",
    "helsingborg2023"
   ],
   "endastNy": false
  },
  {
   "id": "hastighet70",
   "grupp": "korsatt",
   "roll": "stod",
   "namn": "Sänkt hastighet till 70 km/h på motorleder och bättre efterlevnad",
   "kort": "Motorleder och motorvägar i och kring staden skyltas om till 70 km/h, med hastighetskameror.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av motorlederna i och kring staden",
   "eB": [
    0,
    0,
    0
   ],
   "eV": [
    0,
    0,
    0
   ],
   "eC": [
    -0.03,
    -0.01,
    -0.05
   ],
   "grad": "B",
   "geografi": "Sverige, Spanien",
   "harledning": "Åtgärden minskar utsläppen per kilometer, inte antalet kilometer. Enligt IVL minskar bränsleförbrukningen för lätta fordon med 2,6 % per km vid omskyltning från 80 till 70 km/h, med 13 % från 100 km/h och med 20 % från 110 km/h. Sänkta hastigheter och bättre efterlevnad beräknas minska biltrafikens utsläpp med cirka 3 % i Sverige, och i Spanien minskade bränsleförbrukningen med 2–3 % när gränsen sänktes från 120 till 110 km/h. Eftersom bara en del av hushållens körning sker på motorleder använder modellen −3 % CO₂ per km (−1 till −5 %). IVL lyfter åtgärden som en av de tydligaste på kort sikt.",
   "refs": [
    "ivl2024",
    "asensio2014"
   ],
   "endastNy": false
  },
  {
   "id": "sparsamkorning",
   "grupp": "korsatt",
   "roll": "stod",
   "namn": "Kampanj för sparsam körning och rätt däcktryck",
   "kort": "Information och utbildning till bilister om sparsam körning och däcktryck.",
   "typ": "niva",
   "min": 0,
   "max": 100,
   "steg": 10,
   "standard": 100,
   "nivaText": "av full kampanjnivå",
   "eB": [
    0,
    0,
    0
   ],
   "eV": [
    0,
    0,
    0
   ],
   "eC": [
    -0.008,
    -0.004,
    -0.015
   ],
   "grad": "C",
   "geografi": "Sverige; IEA",
   "harledning": "Rätt däcktryck kan minska bränsleförbrukningen med 1,5 % enligt IEA. I ett svenskt scenario antogs 20 % av bilisterna spara i snitt 4 % bränsle med sparsam körning och rätt däcktryck. Modellen använder −0,8 % CO₂ per km (−0,4 till −1,5 %).",
   "refs": [
    "ivl2024"
   ],
   "endastNy": false
  }
 ],
 "fortatning": {
  "namn": "Förtätning",
  "elB": [
   -0.03,
   0,
   -0.06
  ],
  "elV": [
   -0.05,
   -0.02,
   -0.1
  ],
  "grad": "C",
  "geografi": "Danmark, Norge, Sverige och internationella översikter",
  "harledning": "Nordisk forskning visar att läget i staden och den stadsövergripande tätheten betyder mest: i Köpenhamnsregionens ytterkant kör man nästan fyra gånger så långt med bil på vardagar som nära centrum. IVL:s översikt anger att boende i täta, gångvänliga stadsdelar med god kollektivtrafik kör 20–60 % kortare med bil än boende i utglesade stadsdelar, och att förtätning i utglesad bebyggelse tillsammans med omfördelat gatuutrymme minskar bilanvändningen med 5–15 %. Lokal förtätning har mindre effekt än läget. Modellen använder elasticiteten −0,05 (−0,02 till −0,10) för fordonskm per hushåll och −0,03 (0 till −0,06) för bilinnehav. Effekten av läget fångas redan av modellens lägesindex.",
  "refs": [
   "naess2012",
   "ewing2010",
   "ivl2024",
   "litman2023a"
  ]
 },
 "ptal": {
  "namn": "Lågt parkeringstal (tak)",
  "grad": "B",
  "geografi": "Sverige (bl.a. Malmö), Tyskland, Österrike, Schweiz, Storbritannien",
  "harledning": "Svenska projekt med lågt parkeringstal och mobilitetstjänster har ofta 0,4–0,6 bilar per hushåll. I Kvillebäcken i Göteborg fanns 0,42 bilar per lägenhet. I Malmö var efterfrågan på parkering 25–50 % lägre i fastigheter med bil- eller cykelpool. En genomgång av 16 europeiska projekt fann mer hållbart resande än i närliggande områden, men självselektion gör effekten av själva parkeringstalet osäker. Modellen använder parkeringstalet som ett tak för bilar per hushåll och räknar ett tak som binder som en push-åtgärd i samverkansregeln.",
  "refs": [
   "roth2018",
   "sprei2020",
   "toi1425",
   "grybb2023"
  ]
 },
 "ejModell": [
  {
   "namn": "Sänkt bashastighet till 30 km/h i tätort",
   "text": "Som enskild åtgärd har den osäker klimateffekt. IVL:s egna beräkningar antyder att utsläppen kan öka med 6,5–7 % om trafiken som i dag går i 40–50 km/h går i 30 km/h. I ett paket gör den gång och cykel säkrare och mer attraktivt, vilket är skälet till att städer som Bryssel, Helsingfors och Paris infört den."
  },
  {
   "namn": "Miljözoner",
   "text": "Effekten beror på utformningen. En zon där bara tjänstefordon, taxi och boende får köra minskar biltrafiken i zonen med 10–20 %, men boende är oftast undantagna. Londons ULEZ beräknas ha minskat utsläppen med 3 % i hela staden. Delvis fångat av åtgärden Omfördelat gatuutrymme."
  },
  {
   "namn": "Effektivare citylogistik och samlastning",
   "text": "Minskar lastbilsrörelserna med 30–70 % där den införs, men gäller godstrafik och inte hushållens bilar."
  },
  {
   "namn": "Busskörfält på motorleder",
   "text": "IVL beräknar 5–15 kton CO₂e per år för Stockholm, Göteborg och Malmö tillsammans, en liten effekt per hushåll. Ingår delvis i åtgärden Spårväg, BRT eller stomlinje."
  },
  {
   "namn": "Statliga styrmedel",
   "text": "Färdmedelsneutralt reseavdrag (cirka −2 % av biltrafikens utsläpp i landet), korrekt förmånsbeskattning av arbetsplatsparkering (−3,1 % bilresande) och skrotningspremier. De verkar i hela landet och styrs inte av kommunen."
  },
  {
   "namn": "Inte bygga ut vägkapaciteten",
   "text": "Varje ytterligare kilometer motorvägskörfält i och kring städer ökar vanligen biltrafikarbetet med 1,2 %. Modellen utgår från dagens vägnät."
  }
 ],
 "forval": [
  {
   "id": "inga",
   "namn": "Inga åtgärder",
   "val": {}
  },
  {
   "id": "paket",
   "namn": "Mobilitetspaket i nyproduktion",
   "val": {
    "parkeringspris": 100,
    "mobilitetshus": 100,
    "bilpool": 30,
    "elcykel": 20,
    "radgivning": 100
   },
   "text": "Liknar mobilitetsavtal och gröna parkeringstal i Stockholm, Göteborg och Malmö."
  },
  {
   "id": "ivl",
   "namn": "IVL-paket: push, pull och stöd",
   "val": {
    "parkeringspris": 100,
    "gatuutrymme": 50,
    "kollektivtrafik": 100,
    "cykelnat": 100,
    "bilpool": 15,
    "radgivning": 50,
    "hastighet70": 100
   },
   "text": "Kombinerar styrning av bilen, bättre alternativ och stödåtgärder enligt IVL:s slutsatser (2024)."
  },
  {
   "id": "befintlig",
   "namn": "Befintlig stad: parkering och kollektivtrafik",
   "val": {
    "parkeringspris": 100,
    "kollektivtrafik": 100,
    "cykelnat": 100,
    "bilpool": 15,
    "radgivning": 50
   }
  },
  {
   "id": "pull",
   "namn": "Bara bättre alternativ (pull)",
   "val": {
    "kollektivtrafik": 100,
    "cykelnat": 100,
    "elcykel": 20,
    "bilpool": 15,
    "radgivning": 50
   },
   "text": "Visar IVL:s slutsats att positiva incitament ensamma ger mindre effekt."
  },
  {
   "id": "max",
   "namn": "Alla åtgärder på full nivå",
   "val": {
    "parkeringspris": 100,
    "parkeringsutbud": 100,
    "mobilitetshus": 100,
    "gatuutrymme": 100,
    "trangselskatt": 1,
    "kollektivtrafik": 100,
    "elcykel": 30,
    "cykelnat": 100,
    "bilpool": 40,
    "grontransportplan": 50,
    "distansarbete": 30,
    "radgivning": 100,
    "hastighet70": 100,
    "sparsamkorning": 100
   },
   "text": "Teoretiskt maximum. Ligger över vad IVL funnit i genomförda paket."
  },
  {
   "id": "stad_ivl",
   "namn": "IVL-paket för hela staden",
   "stad": true,
   "val": {
    "parkeringspris": 60,
    "gatuutrymme": 30,
    "kollektivtrafik": 60,
    "cykelnat": 100,
    "bilpool": 10,
    "grontransportplan": 30,
    "radgivning": 30,
    "hastighet70": 100
   },
   "text": "Nivåer som är rimliga för en hel stad: parkeringsavgifter och omfördelat gatuutrymme främst i de centrala delarna, bättre stomlinjer för ungefär 60 % av hushållen och lägre hastighet på motorlederna."
  },
  {
   "id": "stad_befintlig",
   "namn": "Parkering och kollektivtrafik i hela staden",
   "stad": true,
   "val": {
    "parkeringspris": 60,
    "kollektivtrafik": 60,
    "cykelnat": 100,
    "bilpool": 10,
    "radgivning": 30
   }
  },
  {
   "id": "stad_pull",
   "namn": "Bara bättre alternativ i hela staden",
   "stad": true,
   "val": {
    "kollektivtrafik": 60,
    "cykelnat": 100,
    "elcykel": 15,
    "bilpool": 10,
    "radgivning": 30
   },
   "text": "Visar IVL:s slutsats att positiva incitament ensamma ger mindre effekt."
  },
  {
   "id": "stad_max",
   "namn": "Alla åtgärder på full nivå i hela staden",
   "stad": true,
   "val": {
    "parkeringspris": 100,
    "parkeringsutbud": 100,
    "gatuutrymme": 100,
    "trangselskatt": 1,
    "kollektivtrafik": 100,
    "elcykel": 30,
    "cykelnat": 100,
    "bilpool": 40,
    "grontransportplan": 50,
    "distansarbete": 30,
    "radgivning": 100,
    "hastighet70": 100,
    "sparsamkorning": 100
   },
   "text": "Teoretiskt maximum. Ligger över vad IVL funnit i genomförda paket."
  }
 ],
 "referenser": {
  "degroote2015": {
   "text": "de Groote, J., van Ommeren, J. & Koster, H. R. A. (2015). Car ownership and residential parking subsidies: Evidence from Amsterdam. Tinbergen Institute Discussion Paper TI 2015-116.",
   "fynd": "Ett års längre väntetid på boendeparkeringstillstånd minskar bilinnehavet med 2 procentenheter, vilket motsvarar en priselasticitet på −0,8.",
   "land": "Nederländerna",
   "url": "https://papers.tinbergen.nl/15116.pdf"
  },
  "toi1425": {
   "text": "Christiansen, P., Hanssen, J. U. & Skollerud, K. (2015). Effekt av parkeringstilbud. TØI-rapport 1425/2015. Transportøkonomisk institutt, Oslo.",
   "fynd": "80 % av hushållen med minst två bilar har parkering på egen tomt, mot 29 % av hushållen utan bil. 15 % av hushållen utan bil skulle skaffa bil om parkeringen var bättre. De som parkerar mer än 200 meter bort använder bilen mindre.",
   "land": "Norge",
   "url": "https://jernbanedirektoratet.no/content/uploads/sites/4/2021/12/effekt-av-parkeringstilbud-toi-rapport-1425-2015.pdf"
  },
  "christiansen2017": {
   "text": "Christiansen, P. m.fl. (2017). Parking facilities and the built environment: Impacts on travel behaviour. Transportation Research Part A 95, 198–206.",
   "fynd": "Viljan att ta bilen minskar med gångavståndet till parkeringen, särskilt i tät bebyggelse. Begränsad parkering både vid bostaden och vid målet ger mycket låg sannolikhet att resan görs med bil (norska resvaneundersökningen 2013/14).",
   "land": "Norge",
   "url": "https://toi.brage.unit.no/toi-xmlui/handle/11250/2603968"
  },
  "nijland2015": {
   "text": "Nijland, H., van Meerkerk, J. & Hoen, A. (2015). Impact of car sharing on mobility and CO2 emissions. PBL Planbureau voor de Leefomgeving, Haag.",
   "fynd": "Bildelare äger över 30 % färre bilar och kör 15–20 % färre kilometer med bil än innan de började dela bil.",
   "land": "Nederländerna",
   "url": "https://pbl.nl/en/node/4727"
  },
  "steorn2017": {
   "text": "Steorn, N. & Goldmann, M. (2017). Bilpoolsboom. 2030-sekretariatet, Stockholm. (Sammanställer bl.a. Trivector 2014 och Trafikanalys 2016:15.)",
   "fynd": "En poolbil ersätter i genomsnitt ungefär fem privatbilar. Upp till en tredjedel av nya medlemmar säljer eller avstår från en bil. Sunfleets medlemmar minskade sin bilkörning med 20 %, och medlemmar i bilpooler minskar bilresandet med 30–60 % enligt Trafikanalys.",
   "land": "Sverige och Norden",
   "url": "https://www.nordicenergy.org/wordpress/wp-content/uploads/2017/05/BILPOOLSBOOM_Online1.pdf"
  },
  "engebretsen2017": {
   "text": "Engebretsen, Ø., Christiansen, P. & Strand, A. (2017). Bergen light rail – effects on travel behaviour. Journal of Transport Geography 62, 111–121.",
   "fynd": "Införandet av Bybanen var den viktigaste drivkraften bakom ökat kollektivresande i Bergen, och kollektivresandet var högst i områden som trafikeras av banan.",
   "land": "Norge",
   "url": "https://www.toi.no/articles-9000/bergen-light-rail-effects-on-travel-behaviour-article34425-814.html"
  },
  "toibergen": {
   "text": "Transportøkonomisk institutt. Bergen: åpning av bybane og forsterket busstilbud. Databas över kollektivtrafikåtgärder (sammanfattning av Engebretsen m.fl. 2017).",
   "fynd": "Bilens andel av resorna sjönk från 58,8 % (2008) till 50,7 % (2014). Kollektivtrafikens andel ökade från 27,3 % till 31,9 %, och antalet kollektivresor per invånare ökade med 20 % 2008–2013.",
   "land": "Norge",
   "url": "https://toi.no/getfile.php/1371753-1637603838/mmarkiv/Forskningsprogram/ByBy/Database%20for%20kollektivtiltak/12%20-%20Bergen_%C3%85pning%20av%20bybane%20og%20forsterket%20busstilbud.pdf"
  },
  "naess2012": {
   "text": "Næss, P. (2012). Urban form and travel behavior: Experience from a Nordic context. Journal of Transport and Land Use 5(2), 21–45.",
   "fynd": "Boende i Köpenhamnsregionens ytterkant kör i genomsnitt nästan fyra gånger så långt med bil på vardagar som boende nära centrum. Stadsövergripande täthet och läge i förhållande till centrum betyder mer än lokal täthet.",
   "land": "Danmark, Norge, Sverige",
   "url": "https://jtlu.org/index.php/jtlu/article/view/314"
  },
  "ewing2010": {
   "text": "Ewing, R. & Cervero, R. (2010). Travel and the built environment: A meta-analysis. Journal of the American Planning Association 76(3), 265–294.",
   "fynd": "Elasticiteten för fordonskm är −0,04 mot befolkningstäthet, −0,09 mot funktionsblandning och −0,20 mot tillgänglighet till målpunkter. Underlaget är främst nordamerikanskt och används här som komplement till nordiska studier.",
   "land": "Internationellt (främst Nordamerika)",
   "url": "https://planning.org/knowledgebase/resource/9149498"
  },
  "sundfor2024": {
   "text": "Sundfør, H. B., Berntsen, S., Bere, E. & Fyhri, A. (2024). The effects of subsidising e-bikes on mode share and physical activity – A natural experiment. Journal of Transport & Health 35.",
   "fynd": "Bland dem som fått elcykelstöd i Oslo ökade cykelns andel av resorna med 12,6 procentenheter och bilens andel minskade med 10,1 procentenheter, jämfört med en kontrollgrupp.",
   "land": "Norge",
   "url": "https://uia.brage.unit.no/uia-xmlui/handle/11250/3131022"
  },
  "fyhri2015": {
   "text": "Fyhri, A. & Fearnley, N. (2015). Effects of e-bikes on bicycle use and mode share. Transportation Research Part D: Transport and Environment.",
   "fynd": "Deltagare som fick låna elcykel ökade sin cykling från 0,9 till 1,4 resor och från 4,8 till 10,3 km per dag. Cykelns andel av deras resor ökade från 28 % till 48 %. Ingen motsvarande ökning i kontrollgruppen.",
   "land": "Norge",
   "url": "https://toi.brage.unit.no/toi-xmlui/handle/11250/2602177"
  },
  "nv2019": {
   "text": "Naturvårdsverket (2019). Elcykling – vem, hur och varför? En utvärdering med elfordonspremien som utgångspunkt.",
   "fynd": "Ungefär hälften av elcykelresandet ersätter resor som annars hade gjorts med bil. I storstäderna ersatte elcykeln mindre än en tredjedel av arbetspendlingen med bil, i mindre orter nästan två tredjedelar.",
   "land": "Sverige",
   "url": "https://www.naturvardsverket.se/publikationer/6800/elcykling--vem-hur-och-varfor/"
  },
  "farum2015": {
   "text": "Ingeniøren (2015). Supercykelsti lokker pendlere ud af bilerne. Om utvärderingen av Farumruten 2012–2014.",
   "fynd": "Antalet cyklister på Farumruten ökade med 52 % på två år, och 25 % av de nya cyklisterna var tidigare bilister.",
   "land": "Danmark",
   "url": "https://ing.dk/artikel/supercykelsti-lokker-pendlere-ud-af-bilerne"
  },
  "borjessonitf": {
   "text": "Börjesson, M. Swedish congestion charges: long-term effects. Presentation, International Transport Forum (OECD).",
   "fynd": "Trafiken över betalsnittet minskade på kort sikt med 22 % i Stockholm och 12 % i Göteborg. I Stockholm har effekten ökat över tid, i Göteborg minskat något.",
   "land": "Sverige",
   "url": "https://www.itf-oecd.org/sites/default/files/docs/swedish-congestion-charges-long-term-effects.pdf"
  },
  "borjesson2012": {
   "text": "Börjesson, M., Eliasson, J., Hugosson, M. B. & Brundell-Freij, K. (2012). The Stockholm congestion charges – 5 years on. Effects, acceptability and lessons learnt. Transport Policy 20, 1–12.",
   "fynd": "Trafikminskningen av trängselskatten i Stockholm har ökat något över tid när yttre faktorer kontrolleras.",
   "land": "Sverige",
   "url": "https://swopec.hhs.se/ctswps/abs/ctswps2012_003.htm"
  },
  "borjesson2015": {
   "text": "Börjesson, M. & Kristoffersson, I. (2015). The Gothenburg congestion charge. Effects, design and politics. Transportation Research Part A 75, 134–146.",
   "fynd": "Trängselskattens effekter och anpassningar i Göteborg liknar dem i Stockholm.",
   "land": "Sverige",
   "url": "https://swopec.hhs.se/ctswps/abs/ctswps2014_025.htm"
  },
  "borjesson2017": {
   "text": "Börjesson, M. & Kristoffersson, I. (2017). The Swedish congestion charges: ten years on – and effects of increasing charging levels. CTS Working Paper 2017:2.",
   "fynd": "Den långsiktiga priselasticiteten har ökat i Stockholm men minskat i Göteborg.",
   "land": "Sverige",
   "url": "https://swopec.hhs.se/ctswps/abs/ctswps2017_002.htm"
  },
  "cairns2004": {
   "text": "Cairns, S., Sloman, L., Newson, C., Anable, J., Kirkbride, A. & Goodwin, P. (2004). Smarter Choices – Changing the Way We Travel. Department for Transport, London.",
   "fynd": "Med hög intensitet bedömdes mjuka åtgärder kunna minska tätortstrafiken i rusningstid med cirka 21 % och den totala trafiken med cirka 11 %. Med låg intensitet blev minskningen 2–3 %. Gröna transportplaner minskade bilpendlingen med i genomsnitt cirka 15 %.",
   "land": "Storbritannien",
   "url": "https://discovery.ucl.ac.uk/id/eprint/1224/"
  },
  "sprei2020": {
   "text": "Sprei, F., Hult, C., Hult, Å. & Roth, A. (2020). Review of the effects of developments with low parking requirements. Sustainability 12(5), 1744.",
   "fynd": "I 16 projekt med låga parkeringstal i Sverige, Österrike, Tyskland, Schweiz och Storbritannien var resandet mer hållbart än i närliggande områden. Självselektion och svaga utvärderingar gör orsakssambandet osäkert.",
   "land": "Sverige och Västeuropa",
   "url": "https://research.chalmers.se/publication/517938"
  },
  "roth2018": {
   "text": "Roth, A., Hult, C., Hult, Å., Vikengren, T. & Koucky, M. (2018). Sänkt p-tal som drivkraft för attraktiv stadsbyggnad och hållbar mobilitet. IVL rapport C 276.",
   "fynd": "Kvillebäcken (Göteborg): 0,42 bilar per lägenhet och 217 bilar per 1 000 invånare mot 285 i hela Göteborg. Hammarby Sjöstad: 210 bilar per 1 000 invånare (2011). Projekt med lågt p-tal och mobilitetstjänster har typiskt 0,4–0,6 bilar per hushåll.",
   "land": "Sverige",
   "url": "https://ozonmatnatet.ivl.se/download/18.34244ba71728fcb3f3fa47/1591705757570/C276.pdf"
  },
  "ivl2024": {
   "text": "Dickinson, J., Hult, C., Lundström, H. & Roth, A. (2024). Snabb omställning av vägtrafiken för minskad klimatpåverkan. En internationell litteraturöversikt av åtgärder för att minska trafikarbetet i större städer. IVL Svenska Miljöinstitutet, rapport C820, på uppdrag av Naturvårdsverket.",
   "fynd": "Paket med både push- och pull-åtgärder minskar biltrafikarbetet med 10–30 %, paket med bara positiva incitament med 5–15 %. Omfördelat gatuutrymme minskar biltrafiken i berörda områden med i storleksordningen 10 % eller mer. Marknadsmässiga parkeringsavgifter och färre platser minskar bilinnehavet med 5–15 % och bilresorna med 10–30 %. Effekterna av olika åtgärder kan inte adderas.",
   "land": "Internationell översikt med svenska beräkningar",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "cairns2002": {
   "text": "Cairns, S., Atkins, S. & Goodwin, P. (2002). Disappearing traffic? The story so far. Proceedings of the Institution of Civil Engineers – Municipal Engineer 151(1), 13–22.",
   "fynd": "I ett 70-tal fall i 11 länder där bilarnas utrymme minskades minskade biltrafiken med i medel 21,9 % och i median 10,6 %; trafiken flyttade bara delvis till andra gator. Refererad i IVL C820 (2024).",
   "land": "11 länder",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "hagen2021": {
   "text": "Hagen, O. H. & Tennøy, A. (2021). Street-space reallocation in the Oslo city center: Adaptations, effects, and consequences. Transportation Research Part D 97, 102944.",
   "fynd": "Gatuparkeringen i Oslos centrum minskade från 1 450 till 690 platser och genomfarten begränsades. Biltrafiken minskade med 11 % 2016–2018 och 19 % 2018–2019, utan negativa effekter på handelns omsättning.",
   "land": "Norge",
   "url": "https://doi.org/10.1016/j.trd.2021.102944"
  },
  "ivlgent": {
   "text": "Gustavsson Binder, T., Dickinson, J. & Lundström, H. (2023). ”Att göra en Gent”. Nya tag för attraktiva städer med mindre biltrafik. IVL Svenska Miljöinstitutet, rapport C793.",
   "fynd": "Gents cirkulationsplan delar staden i zoner som inte kan passeras med bil. Bilens andel av resorna sjönk från 45 till 38 % (2015–2018), cykelns andel ökade från 30 till 35 %, och kostnaden för införandet var cirka 5 miljoner euro. Refererad i IVL C820 (2024).",
   "land": "Belgien",
   "url": "https://www.mynewsdesk.com/se/ivl_svenska_miljoinstitutet_ab__/pressreleases/saa-kan-biltrafiken-minska-sju-laerdomar-foer-svenska-staeder-3288265"
  },
  "norheim2016": {
   "text": "Norheim, B. m.fl. (2016). Hållbara urbana transporter (HUT). Komparativa analyser Stockholm, Göteborg, Malmö och Uppsala. Urbanet Analyse, rapport 90/2016.",
   "fynd": "Stomlinjenät för buss med full framkomlighet tillsammans med fördubblade parkeringsavgifter i de centrala delarna ger en överflyttning av 10–20 % av bilresorna, beroende på stad. Refererad i IVL C820 (2024).",
   "land": "Sverige (bl.a. Malmö)",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "preston2016": {
   "text": "Preston, J. m.fl. (2016). Local Sustainable Transport Fund Evaluation: A Case Study Evaluation of Carbon Impacts and Congestion Relief. Department for Transport.",
   "fynd": "Bilkörningen minskade med upp till 7 % i orter som fick stöd för gång, cykel och kollektivtrafik jämfört med orter utan stöd. Refererad i IVL C820 (2024).",
   "land": "Storbritannien",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "brand2021": {
   "text": "Brand, C. m.fl. (2021). The climate change mitigation impacts of active travel: Evidence from a longitudinal panel study in seven European cities. Global Environmental Change 67, 102224.",
   "fynd": "Den som byter en bilresa om dagen mot cykel minskar sitt klimatavtryck med ungefär 0,5 ton per år. Om 10 % av befolkningen byter bilen mot cykel minskar livscykelutsläppen från bilresor med 4 %.",
   "land": "Sju europeiska städer",
   "url": "https://doi.org/10.1016/j.gloenvcha.2021.102224"
  },
  "grybb2023": {
   "text": "Grybb, M. m.fl. (2023). Effekter av mobilitetsåtgärder för boende. Vinnova steg 1-projekt. Tyréns Sverige AB.",
   "fynd": "I fastigheter i Malmö där de boende hade tillgång till bilpool eller cykelpool var efterfrågan på parkering 25–50 % lägre än i fastigheter utan sådana tjänster. Kontinuerlig information om tjänsterna behövs för att de ska användas. Refererad i IVL C820 (2024).",
   "land": "Sverige (Malmö)",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "trivector2016": {
   "text": "Trivector Traffic (2016). Grön resplan 2020 för Region Östergötland. Inklusive uppföljning av Grön resplan från år 2013. Trivector rapport 2016:08.",
   "fynd": "Region Östergötlands gröna resplan (prova-på-kort, bom vid sjukhusparkeringen, cykelservice, resfria möten) minskade klimatpåverkan med cirka 13 %, rensat för teknikutveckling. Refererad i IVL C820 (2024).",
   "land": "Sverige",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "caldarola2022": {
   "text": "Caldarola, B. & Sorrell, S. (2022). Do teleworkers travel less? Evidence from the English National Travel Survey. Transportation Research Part A 159, 282–303.",
   "fynd": "De som arbetar hemifrån reser totalt sett längre per vecka, men vid distansarbete tre dagar eller mer i veckan minskar både pendlingen och de övriga resorna. Refererad i IVL C820 (2024).",
   "land": "Storbritannien",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "cairnsjones2016": {
   "text": "Cairns, S. & Jones, M. (2016). Sustainable Travel Towns: An evaluation of the longer term impacts. Main report. Department for Transport, PPR776.",
   "fynd": "Mobilitetsrådgivning till hushåll, skolor och arbetsplatser tillsammans med bättre kollektivtrafik i tre städer med 100 000–180 000 invånare minskade bilkörningen per person med 6–10 %.",
   "land": "Storbritannien",
   "url": "https://assets.publishing.service.gov.uk/media/5b8fb003ed915d1ec02ff273/ppr776-sustainable-travel-towns-final-report.pdf"
  },
  "helsingborg2023": {
   "text": "Helsingborgs stad (2023). Från bilist till cyklist på 6 veckor. En metodguide. Samt Johansson, M. (2023). 300 testcyklister. Lunds universitet.",
   "fynd": "Drygt 300 bilpendlare testade att cykelpendla i sex veckor. Ett år senare gjorde 79 % mer än hälften av sina arbetsresor med cykel. 10 km cykelpendling om dagen motsvarar drygt 300 kg CO₂ per person och år. Refererad i IVL C820 (2024).",
   "land": "Sverige (Helsingborg)",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  },
  "asensio2014": {
   "text": "Asensio, J., Gómez-Lobo, A. & Matas, A. (2014). How effective are policies to reduce gasoline consumption? Evaluating a set of measures in Spain. Energy Economics 42, 34–42.",
   "fynd": "När hastighetsgränsen på spanska motorvägar sänktes från 120 till 110 km/h minskade vägtrafikens bränsleförbrukning med 2–3 %.",
   "land": "Spanien",
   "url": "https://doi.org/10.1016/j.eneco.2013.11.011"
  },
  "kuss2022": {
   "text": "Kuss, P. & Nicholas, K. A. (2022). A dozen effective interventions to reduce car use in European cities: Lessons learned from a meta-analysis and transition management. Case Studies on Transport Policy 10(3), 1494–1513.",
   "fynd": "Begränsad framkomlighet för bilen, som bilfria gator och zoner eller borttagna körfält och parkeringsplatser, kombinerat med satsningar på kollektiv-, gång- och cykeltrafik är en framgångsrik kombination. Personlig mobilitetsrådgivning till boende minskade andelen bilresor med 5–10 % i europeiska städer. Refererad i IVL C820 (2024).",
   "land": "Europeiska städer",
   "url": "https://lucsus.lu.se/kimberly-nicholas/publication/b75dc8e8-9ded-41e2-97e4-6e1c2fedeaa0"
  },
  "litman2023a": {
   "text": "Litman, T. (2023). Are Vehicle Travel Reduction Targets Justified? Why and How to Reduce Excessive Automobile Travel. Victoria Transport Policy Institute.",
   "fynd": "Paket med både positiva incitament och högre kostnader för bilen minskar biltrafiken med 10–30 %, paket med bara positiva incitament med 5–15 %. Boende i täta, tillgängliga stadsdelar kör 20–60 % kortare med bil. Refererad i IVL C820 (2024).",
   "land": "Internationellt (främst Nordamerika)",
   "url": "https://vtpi.org/vmt_red.pdf"
  }
 }
};
