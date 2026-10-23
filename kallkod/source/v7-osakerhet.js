// Osäkerhetsanalys och referenskontroll: fördelningar, kontrollfall och nya referenser.
// Allt efter window.OSAKERHET = är JSON. v = [centralt, minst, mest] som i atgarder.js.
// Kontrollfallens modellinställningar bestämdes innan modellvärdena räknades fram.
window.OSAKERHET = {
 "version": "2026-10-19",
 "mc": {
  "n": 2000,
  "seed": 20261019,
  "rho": 0.5,
  "rhoTest": [
   0,
   0.5,
   1
  ],
  "kvantiler": [
   0.05,
   0.5,
   0.95
  ]
 },
 "parametrar": {
  "efIce": {
   "namn": "Utsläpp från bensin- och dieselbilar",
   "enhet": "kg CO₂ per km",
   "v": [
    0.15,
    0.13,
    0.18
   ],
   "text": "0,15 är formelns värde. IVL räknar med 0,14 kg CO₂e per km för personbilar 2021, med dåvarande inblandning av biodrivmedel, och ungefär 0,18 med den sänkta reduktionsplikten från 2024. Nedre gränsen speglar en nyare och snålare bilpark.",
   "refs": [
    "ivl2024"
   ]
  },
  "efEv": {
   "namn": "Utsläpp från elbilar",
   "enhet": "kg CO₂ per km",
   "v": [
    0.02,
    0.005,
    0.05
   ],
   "text": "Beror på hur elen räknas. Med ungefär 0,2 kWh per km ger svensk elproduktion under 0,01 kg per km, nordisk elmix omkring 0,01–0,02 och europeisk genomsnittsel omkring 0,05. Bedömning; påverkar resultatet lite eftersom elbilarna står för en liten del av körningen."
  },
  "eldrift": {
   "namn": "Laddhybridernas körning på el",
   "enhet": "andel",
   "v": [
    0.4,
    0.25,
    0.55
   ],
   "text": "Mätningar i Europa visar 45–49 % för privata laddhybrider och 11–15 % för tjänstebilar. Bilparken i staden har båda.",
   "kalla": "ICCT och Fraunhofer ISI (2022)",
   "url": "https://theicct.org/wp-content/uploads/2022/06/fs-real-world-phev-use-jun22.pdf"
  },
  "fordonskm": {
   "namn": "Fordonskm i bilmodellen",
   "enhet": "faktor",
   "kommuner": {
    "1280": {
     "p5": 0.9356,
     "p95": 1.0677
    },
    "1283": {
     "p5": 0.9087,
     "p95": 1.0962
    },
    "2180": {
     "p5": 0.8999,
     "p95": 1.106
    }
   },
   "text": "Hushållens fordonskm i hela kommunen, P5–P95 ur bilmodellens egen Monte Carlo-simulering (förmånsbilsfaktor φ, privatbilsfaktor ρ och kommunens körsträcka). Påverkar utsläppen i ton men inte den procentuella effekten av åtgärderna."
  },
  "overlapp": {
   "namn": "Överlapp inom en åtgärdsgrupp",
   "enhet": "andel",
   "v": [
    0.5,
    0.25,
    0.75
   ],
   "text": "Hur stor del av den näst största effekten i samma grupp som räknas. IVL konstaterar att effekterna inte kan adderas men har inte kvantifierat överlappet, så spannet är brett.",
   "refs": [
    "ivl2024"
   ]
  },
  "pullUtanPush": {
   "namn": "Pull-åtgärdernas effekt utan push",
   "enhet": "andel",
   "v": [
    0.7,
    0.5,
    1.0
   ],
   "text": "Valt så att paket med enbart pull hamnar inom IVL:s 5–15 % och paket med både push och pull inom 10–30 %.",
   "refs": [
    "ivl2024",
    "litman2023a"
   ]
  },
  "pendling": {
   "namn": "Arbetspendlingens andel av hushållets bilkörning",
   "enhet": "andel",
   "v": [
    0.33,
    0.25,
    0.4
   ],
   "text": "Används bara i referenskontrollen, för att räkna om modellens effekt på hushållets körning till effekt på arbetspendlingen. Samma antagande som i åtgärden Grön transportplan."
  }
 },
 "text": {
  "fordelning": "Varje åtgärdseffekt dras ur en triangelfördelning mellan lägsta och högsta effekt i underlaget, med modellens centrala värde som typvärde. Spannen kommer från åtgärdernas härledning, se fliken Åtgärder.",
  "korrelation": "Åtgärdernas effekter antas samvariera med korrelationen 0,5. Samma lokala förutsättningar, till exempel hur bra alternativen till bilen är och hur bilberoende hushållen är, gör att alla åtgärder tenderar att fungera bättre eller sämre samtidigt. Med korrelationen 0 tar osäkerheterna ut varandra och intervallet blir smalare. Med 1 blir det nästan lika brett som det gamla spannet, där alla åtgärder fick sin lägsta respektive högsta effekt samtidigt.",
  "ingar": "Osäkerheten i åtgärdernas effekter, samverkansreglerna, utsläppsfaktorerna, laddhybridernas eldrift och bilmodellens fordonskm.",
  "ingarInte": [
   "Om effekter från andra städer och länder går att överföra till Malmö, Helsingborg och Gävle. Det är den största osäkerheten, och den syns bara delvis i spannen.",
   "Om åtgärderna genomförs fullt ut och som beskrivet, och hur lång tid det tar innan full effekt nås.",
   "Självselektion: hushåll som redan kör lite väljer gärna områden med bilpool och lågt parkeringstal.",
   "Rekyleffekter, till exempel att mindre trängsel lockar ny biltrafik, och att elbilsandelen varierar mellan områden."
  ],
  "metod": [
   "Varje rad jämför ett publicerat resultat med vad modellen ger när den ställs in som i studien. Inställningarna bestämdes innan modellvärdena räknades fram och har inte justerats efteråt.",
   "Kalibrering betyder att studien användes när effektstorleken eller samverkansregeln bestämdes. Kontrollen visar då att modellen återger sitt underlag, inte att den träffar rätt i nya fall.",
   "Oberoende betyder att det publicerade resultatet inte användes när parametrarna sattes. Dessa rader är det bästa måttet på hur träffsäker modellen är.",
   "Proxy betyder att studien mäter något närliggande, till exempel bilresor, trafik i ett område eller bara arbetspendlingen, och inte hushållens fordonskm. Avvikelser är då väntade.",
   "Modellens intervall är 5:e till 95:e percentilen i en Monte Carlo-simulering med 2 000 dragningar och samma fördelningar som i osäkerhetsanalysen."
  ],
  "status": {
   "inom": "Modellens centrala värde ligger inom studiens intervall, eller inom 2 procentenheter eller 20 % av ett enskilt värde.",
   "forenligt": "Modellens 90-procentsintervall överlappar studiens resultat.",
   "under": "Modellen ger mindre effekt än studien, även i övre delen av sitt intervall.",
   "over": "Modellen ger större effekt än studien, även i nedre delen av sitt intervall.",
   "riktning": "Studien anger bara riktning. Modellen ger samma riktning.",
   "ovre": "Studien anger en övre gräns, och modellens värde ligger under den."
  }
 },
 "kontroller": [
  {
   "id": "K01",
   "kategori": "kalibrering",
   "tema": "Paket",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Paket med både push- och pull-åtgärder",
   "matt": "Biltrafikarbete",
   "pub": {
    "lo": -30,
    "hi": -10,
    "text": "−10 till −30 %"
   },
   "typ": "varde",
   "modell": {
    "forval": "ivl",
    "utfall": "V"
   },
   "modelltext": "Förvalet IVL-paket: push, pull och stöd (ett område)",
   "not": "Regeln att pull-åtgärder räknas med 70 % utan push valdes för att träffa IVL:s intervall."
  },
  {
   "id": "K02",
   "kategori": "kalibrering",
   "tema": "Paket",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Paket med enbart positiva incitament (pull)",
   "matt": "Biltrafikarbete",
   "pub": {
    "lo": -15,
    "hi": -5,
    "text": "−5 till −15 %"
   },
   "typ": "varde",
   "modell": {
    "forval": "pull",
    "utfall": "V"
   },
   "modelltext": "Förvalet Bara bättre alternativ (pull)",
   "not": "Samma samverkansregel som ovan, kalibrerad mot IVL."
  },
  {
   "id": "K03",
   "kategori": "kalibrering",
   "tema": "Paket",
   "studie": "Norheim m.fl. (2016)",
   "ref": "norheim2016",
   "plats": "Stockholm, Göteborg, Malmö, Uppsala (modellanalys)",
   "jamforelse": "Stomlinjer för buss med full framkomlighet och fördubblade parkeringsavgifter centralt",
   "matt": "Bilresor som flyttas till andra färdsätt",
   "pub": {
    "lo": -20,
    "hi": -10,
    "text": "10–20 % av bilresorna"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "kollektivtrafik": 100,
     "parkeringspris": 60
    },
    "utfall": "V"
   },
   "modelltext": "Kollektivtrafik 100 %, parkeringsavgifter 60 % (främst centralt)",
   "proxy": "Studien är en modellanalys (ex ante) och mäter andel bilresor; modellen räknar fordonskm per hushåll."
  },
  {
   "id": "K04",
   "kategori": "kalibrering",
   "tema": "Paket",
   "studie": "Preston m.fl. (2016)",
   "ref": "preston2016",
   "plats": "England, 77 lokala myndigheter",
   "jamforelse": "Satsningar på gång, cykel och kollektivtrafik (Local Sustainable Transport Fund)",
   "matt": "Körsträcka med bil jämfört med orter utan stöd",
   "pub": {
    "lo": -7,
    "hi": 0,
    "text": "upp till −7 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "cykelnat": 50,
     "kollektivtrafik": 30,
     "radgivning": 30
    },
    "utfall": "V"
   },
   "modelltext": "Cykelnät 50 %, kollektivtrafik 30 %, rådgivning till 30 % av hushållen; ingen push-åtgärd"
  },
  {
   "id": "K05",
   "kategori": "kalibrering",
   "tema": "Paket",
   "studie": "Cairns & Jones (2016)",
   "ref": "cairnsjones2016",
   "plats": "Darlington, Peterborough, Worcester",
   "jamforelse": "Mobilitetsrådgivning och marknadsföring tillsammans med bättre kollektivtrafik (Sustainable Travel Towns)",
   "matt": "Bilkörning per person",
   "pub": {
    "lo": -10,
    "hi": -6,
    "text": "−6 till −10 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "radgivning": 50,
     "kollektivtrafik": 30,
     "cykelnat": 30
    },
    "utfall": "V"
   },
   "modelltext": "Rådgivning till 50 % av hushållen, kollektivtrafik 30 %, cykelnät 30 %"
  },
  {
   "id": "K06",
   "kategori": "kalibrering",
   "tema": "Parkering",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Marknadsmässiga parkeringsavgifter och färre platser",
   "matt": "Bilinnehav",
   "pub": {
    "lo": -15,
    "hi": -5,
    "text": "−5 till −15 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "parkeringspris": 100,
     "parkeringsutbud": 100
    },
    "utfall": "B"
   },
   "modelltext": "Parkeringsavgifter 100 % och färre parkeringsplatser 100 %"
  },
  {
   "id": "K07",
   "kategori": "kalibrering",
   "tema": "Parkering",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Marknadsmässiga parkeringsavgifter och färre platser",
   "matt": "Antal bilresor",
   "pub": {
    "lo": -30,
    "hi": -10,
    "text": "−10 till −30 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "parkeringspris": 100,
     "parkeringsutbud": 100
    },
    "utfall": "V"
   },
   "modelltext": "Parkeringsavgifter 100 % och färre parkeringsplatser 100 %",
   "proxy": "Studien mäter antal bilresor, modellen fordonskm."
  },
  {
   "id": "K08",
   "kategori": "oberoende",
   "tema": "Parkering",
   "studie": "Dale m.fl. (2019), via Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "Nottingham, Storbritannien",
   "jamforelse": "Avgift på arbetsplatsparkering (Workplace Parking Levy)",
   "matt": "Bilpendling",
   "pub": {
    "v": -8.6,
    "text": "−8,6 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "V",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Modellens åtgärd är en grön transportplan med flera delar. Avgiften i Nottingham tas ut av arbetsgivaren, som inte alltid för den vidare till de anställda."
  },
  {
   "id": "K09",
   "kategori": "oberoende",
   "tema": "Parkering",
   "studie": "Strompen m.fl. (2012), via Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "Rotterdam, Nederländerna",
   "jamforelse": "Avgift på arbetsplatsparkering",
   "matt": "Bilpendling",
   "pub": {
    "lo": -25,
    "hi": -20,
    "text": "−20 till −25 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "V",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Modellens åtgärd är en grön transportplan med flera delar, studien en avgift på parkeringen."
  },
  {
   "id": "K10",
   "kategori": "kalibrering",
   "tema": "Gatuutrymme",
   "studie": "Cairns m.fl. (2002)",
   "ref": "cairns2002",
   "plats": "Ett 70-tal fall i 11 länder",
   "jamforelse": "Minskat utrymme för biltrafiken",
   "matt": "Biltrafik i berörda områden",
   "pub": {
    "v": -10.6,
    "text": "median −10,6 % (medel −21,9 %)"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "gatuutrymme": 100
    },
    "utfall": "V"
   },
   "modelltext": "Omfördelat gatuutrymme 100 %",
   "proxy": "Studien mäter trafiken i området, där även genomfart ingår; modellen de boendes körning."
  },
  {
   "id": "K11",
   "kategori": "kalibrering",
   "tema": "Gatuutrymme",
   "studie": "Hagen & Tennøy (2021)",
   "ref": "hagen2021",
   "plats": "Oslo centrum",
   "jamforelse": "Gatuparkering halverad och genomfart begränsad",
   "matt": "Biltrafik i centrum",
   "pub": {
    "lo": -19,
    "hi": -11,
    "text": "−11 % (2016–2018) och −19 % (2018–2019)"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "parkeringsutbud": 100,
     "gatuutrymme": 100
    },
    "utfall": "V"
   },
   "modelltext": "Färre parkeringsplatser 100 % och omfördelat gatuutrymme 100 %",
   "proxy": "Studien mäter trafiken i centrum, där även genomfart ingår; modellen de boendes körning."
  },
  {
   "id": "K12",
   "kategori": "kalibrering",
   "tema": "Gatuutrymme",
   "studie": "Gustavsson Binder m.fl. (2023), IVL C793",
   "ref": "ivlgent",
   "plats": "Gent, Belgien",
   "jamforelse": "Cirkulationsplan som delar staden i zoner",
   "matt": "Bilens andel av resorna",
   "pub": {
    "v": -15.6,
    "text": "45 → 38 % av resorna (−16 % relativt)"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "gatuutrymme": 100
    },
    "utfall": "V"
   },
   "modelltext": "Omfördelat gatuutrymme 100 %",
   "proxy": "Studien mäter bilens andel av resorna, modellen fordonskm."
  },
  {
   "id": "K13",
   "kategori": "oberoende",
   "tema": "Gatuutrymme",
   "studie": "CIVITAS (2013), via Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "Rom, Italien",
   "jamforelse": "Begränsad trafikzon i centrum",
   "matt": "Biltrafik i centrum",
   "pub": {
    "lo": -20,
    "hi": -10,
    "text": "−10 % (fria timmar) till −20 % (begränsade timmar)"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "gatuutrymme": 100
    },
    "utfall": "V"
   },
   "modelltext": "Omfördelat gatuutrymme 100 %",
   "proxy": "Studien mäter trafiken i zonen, modellen de boendes körning."
  },
  {
   "id": "K14",
   "kategori": "oberoende",
   "tema": "Gatuutrymme",
   "studie": "Tennøy & Hagen (2020), via IVL C820",
   "ref": "tennoy2020",
   "plats": "Oslo, tre större trafikleder",
   "jamforelse": "Minskat utrymme för biltrafik på lederna",
   "matt": "Bilpendling i berörda stråk",
   "pub": {
    "lo": -21,
    "hi": -16,
    "text": "−16 till −21 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "gatuutrymme": 100
    },
    "utfall": "V"
   },
   "modelltext": "Omfördelat gatuutrymme 100 %",
   "proxy": "Studien mäter pendlingen längs de berörda lederna; modellen hushållens hela bilkörning."
  },
  {
   "id": "K15",
   "kategori": "kalibrering",
   "tema": "Avgifter",
   "studie": "Börjesson (ITF)",
   "ref": "borjessonitf",
   "plats": "Stockholm och Göteborg",
   "jamforelse": "Trängselskatt",
   "matt": "Trafik över betalsnittet",
   "pub": {
    "lo": -22,
    "hi": -12,
    "text": "Stockholm −22 %, Göteborg −12 %"
   },
   "typ": "ovre",
   "modell": {
    "val": {
     "trangselskatt": 1
    },
    "utfall": "V"
   },
   "modelltext": "Trängselskatt",
   "proxy": "Trafiken över betalsnittet är en övre gräns för hur mycket de boendes totala körning kan minska."
  },
  {
   "id": "K16",
   "kategori": "oberoende",
   "tema": "Avgifter",
   "studie": "Eliasson (2007)",
   "ref": "eliasson2007",
   "plats": "Stockholms län, försöket 2006",
   "jamforelse": "Trängselskatt (Stockholmsförsöket)",
   "matt": "Koldioxidutsläpp från vägtrafiken i länet",
   "pub": {
    "lo": -3,
    "hi": -2,
    "text": "−2 till −3 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "trangselskatt": 1
    },
    "utfall": "CO2"
   },
   "modelltext": "Trängselskatt",
   "proxy": "Studien avser all vägtrafik i länet, även genomfart och boende utanför staden. Hushållen i staden berörs mer, så modellens värde bör ligga något över."
  },
  {
   "id": "K17",
   "kategori": "kalibrering",
   "tema": "Kollektivtrafik",
   "studie": "Engebretsen m.fl. (2017)",
   "ref": "toibergen",
   "plats": "Bergen, Norge",
   "jamforelse": "Bybanan och förstärkt busstrafik",
   "matt": "Bilens andel av resorna",
   "pub": {
    "v": -13.8,
    "text": "58,8 → 50,7 % av resorna (−14 % relativt)"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "kollektivtrafik": 100
    },
    "pushExtra": 1,
    "utfall": "V"
   },
   "modelltext": "Kollektivtrafik 100 %; Bergen hade redan bomring, så pull räknas fullt",
   "proxy": "Studien mäter bilens andel av resorna i hela staden, modellen fordonskm."
  },
  {
   "id": "K18",
   "kategori": "kalibrering",
   "tema": "Kollektivtrafik",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Snabb och bekväm kollektivtrafik med hög turtäthet",
   "matt": "Bilresor",
   "pub": {
    "lo": -15,
    "hi": -5,
    "text": "−5 till −15 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "kollektivtrafik": 100
    },
    "utfall": "V"
   },
   "modelltext": "Kollektivtrafik 100 %, ingen push-åtgärd",
   "proxy": "Studien mäter bilresor i berörda stråk, modellen fordonskm."
  },
  {
   "id": "K19",
   "kategori": "oberoende",
   "tema": "Cykel",
   "studie": "Cairns m.fl. (2017)",
   "ref": "cairns2017",
   "plats": "Brighton, Storbritannien",
   "jamforelse": "Lånad elcykel i 6–8 veckor",
   "matt": "Deltagarnas bilkörning",
   "pub": {
    "v": -20,
    "text": "−20 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "elcykel": 100
    },
    "utfall": "V"
   },
   "modelltext": "Elcykel till alla hushåll",
   "proxy": "Studien mäter deltagarnas egen körning under ett kort försök; modellen hela hushållets körning på lång sikt."
  },
  {
   "id": "K20",
   "kategori": "kalibrering",
   "tema": "Cykel",
   "studie": "Sundfør m.fl. (2024)",
   "ref": "sundfor2024",
   "plats": "Oslo, Norge",
   "jamforelse": "Elcykelstöd (naturligt experiment)",
   "matt": "Bilens andel av resorna",
   "pub": {
    "riktning": -1,
    "text": "−10,1 procentenheter (95 % KI −15,9 till −2,5)"
   },
   "typ": "riktning",
   "modell": {
    "val": {
     "elcykel": 100
    },
    "utfall": "V"
   },
   "modelltext": "Elcykel till alla hushåll",
   "proxy": "Studien anger förändring i procentenheter utan utgångsläge, så bara riktningen kan jämföras."
  },
  {
   "id": "K21",
   "kategori": "kalibrering",
   "tema": "Delad mobilitet",
   "studie": "Nijland m.fl. (2015)",
   "ref": "nijland2015",
   "plats": "Nederländerna",
   "jamforelse": "Medlemskap i bilpool",
   "matt": "Bilinnehav",
   "pub": {
    "v": -30,
    "text": "över 30 % färre bilar"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "bilpool": 100
    },
    "utfall": "B"
   },
   "modelltext": "Bilpool, alla hushåll medlemmar"
  },
  {
   "id": "K22",
   "kategori": "kalibrering",
   "tema": "Delad mobilitet",
   "studie": "Nijland m.fl. (2015)",
   "ref": "nijland2015",
   "plats": "Nederländerna",
   "jamforelse": "Medlemskap i bilpool",
   "matt": "Bilkörning",
   "pub": {
    "lo": -20,
    "hi": -15,
    "text": "−15 till −20 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "bilpool": 100
    },
    "utfall": "V"
   },
   "modelltext": "Bilpool, alla hushåll medlemmar"
  },
  {
   "id": "K23",
   "kategori": "kalibrering",
   "tema": "Delad mobilitet",
   "studie": "Steorn & Goldmann (2017)",
   "ref": "steorn2017",
   "plats": "Sverige (Sunfleet)",
   "jamforelse": "Medlemskap i bilpool",
   "matt": "Bilkörning",
   "pub": {
    "v": -20,
    "text": "−20 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "bilpool": 100
    },
    "utfall": "V"
   },
   "modelltext": "Bilpool, alla hushåll medlemmar"
  },
  {
   "id": "K24",
   "kategori": "oberoende",
   "tema": "Delad mobilitet",
   "studie": "Martin & Shaheen (2011)",
   "ref": "martin2011",
   "plats": "USA och Kanada",
   "jamforelse": "Medlemskap i bilpool",
   "matt": "Fordonskm per hushåll",
   "pub": {
    "v": -27,
    "text": "−27 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "bilpool": 100
    },
    "utfall": "V"
   },
   "modelltext": "Bilpool, alla hushåll medlemmar",
   "not": "Nordamerikanska förhållanden med högre bilinnehav före medlemskapet."
  },
  {
   "id": "K25",
   "kategori": "kalibrering",
   "tema": "Arbetsresor",
   "studie": "IVL C820 (2024)",
   "ref": "ivl2024",
   "plats": "Internationell översikt",
   "jamforelse": "Gröna transportplaner med ekonomiska styrmedel",
   "matt": "Bilpendling",
   "pub": {
    "lo": -30,
    "hi": -10,
    "text": "−10 till −30 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "V",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Modellen räknar hushållets hela bilkörning; omräknat med att pendlingen är ungefär en tredjedel."
  },
  {
   "id": "K26",
   "kategori": "oberoende",
   "tema": "Arbetsresor",
   "studie": "Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "Norwich, Graz, Nantes, Brighton & Hove",
   "jamforelse": "Resplaner på arbetsplatser",
   "matt": "Andel som bilpendlar",
   "pub": {
    "lo": -18,
    "hi": -3,
    "text": "−3 till −18 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "V",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Studien mäter andel bilpendlare, modellen fordonskm omräknat till pendling."
  },
  {
   "id": "K27",
   "kategori": "oberoende",
   "tema": "Arbetsresor",
   "studie": "Stumpel-Vos m.fl. (2013), via Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "Utrecht, Nederländerna",
   "jamforelse": "Mobilitetstjänster för pendlare",
   "matt": "Andel som bilpendlar",
   "pub": {
    "v": -37,
    "text": "−37 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "V",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Studien mäter andel bilpendlare, modellen fordonskm omräknat till pendling.",
   "not": "Ett enskilt toppresultat. IVL anger upp till 37 % när anställda får gratis kollektivtrafikkort."
  },
  {
   "id": "K28",
   "kategori": "kalibrering",
   "tema": "Arbetsresor",
   "studie": "Trivector (2016)",
   "ref": "trivector2016",
   "plats": "Region Östergötland",
   "jamforelse": "Grön resplan för arbets- och tjänsteresor",
   "matt": "Klimatpåverkan från resorna",
   "pub": {
    "v": -13,
    "text": "−13 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "grontransportplan": 100
    },
    "utfall": "CO2",
    "omrakning": "pendling"
   },
   "modelltext": "Grön transportplan för alla hushåll, omräknad till arbetspendling",
   "proxy": "Studien gäller en organisations arbets- och tjänsteresor, modellen hushållens pendling."
  },
  {
   "id": "K29",
   "kategori": "kalibrering",
   "tema": "Arbetsresor",
   "studie": "Caldarola & Sorrell (2022)",
   "ref": "caldarola2022",
   "plats": "England",
   "jamforelse": "Distansarbete tre dagar i veckan eller mer",
   "matt": "Resande totalt",
   "pub": {
    "riktning": -1,
    "text": "minskar både pendling och övriga resor"
   },
   "typ": "riktning",
   "modell": {
    "val": {
     "distansarbete": 100
    },
    "utfall": "V"
   },
   "modelltext": "Distansarbete i alla hushåll",
   "proxy": "Studien redovisar riktning, inte en jämförbar effektstorlek."
  },
  {
   "id": "K30",
   "kategori": "kalibrering",
   "tema": "Information",
   "studie": "Kuss & Nicholas (2022)",
   "ref": "kuss2022",
   "plats": "San Sebastián, Marseille, München",
   "jamforelse": "Personlig resplanering för boende",
   "matt": "Andel bilresor",
   "pub": {
    "lo": -12,
    "hi": -5.6,
    "text": "San Sebastián −8 till −12 %, Marseille −6 %, München −5,6 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "radgivning": 100
    },
    "utfall": "V"
   },
   "modelltext": "Rådgivning till alla hushåll",
   "proxy": "Studien mäter andel bilresor, modellen fordonskm."
  },
  {
   "id": "K31",
   "kategori": "kalibrering",
   "tema": "Körsätt",
   "studie": "Asensio m.fl. (2014)",
   "ref": "asensio2014",
   "plats": "Spanien",
   "jamforelse": "Hastighetsgräns på motorvägar sänkt från 120 till 110 km/h",
   "matt": "Bränsleförbrukning i vägtrafiken",
   "pub": {
    "lo": -3,
    "hi": -2,
    "text": "−2 till −3 %"
   },
   "typ": "varde",
   "modell": {
    "val": {
     "hastighet70": 100
    },
    "utfall": "C"
   },
   "modelltext": "70 km/h på motorlederna",
   "proxy": "Annan hastighetsnivå och ett nationellt vägnät; modellens åtgärd gäller stadsnära motorleder."
  },
  {
   "id": "K32",
   "kategori": "baslinje",
   "tema": "Baslinje",
   "studie": "IVL C820 (2024), Trafikverkets emissionsfaktorer",
   "ref": "ivl2024",
   "plats": "Sverige, 71 kommuner",
   "jamforelse": "Genomsnittligt utsläpp per km för personbilar 2021",
   "matt": "kg CO₂e per fordonskm",
   "pub": {
    "v": 0.14,
    "text": "0,140 kg per km",
    "enhet": "kg/km",
    "tol": 0.007
   },
   "typ": "varde",
   "modell": {
    "utfall": "EF",
    "kk": "1280",
    "ar": "2023"
   },
   "modelltext": "Malmö, elbilsandel 2023",
   "proxy": "Nationellt snitt 2021 med dåvarande inblandning av biodrivmedel; modellen avser Malmö 2023."
  }
 ],
 "referenser": {
  "eliasson2007": {
   "text": "Eliasson, J. (2007). Stockholms trängselavgifter. Föredrag av ordföranden i analysgruppen för utvärderingen av Stockholmsförsöket, KTH och WSP Analys & Strategi. Publicerat av Samferdselsdepartementet, Norge.",
   "fynd": "Trafiken över betalsnittet minskade med drygt 20 % under försöket. Koldioxidutsläppen från vägtrafiken i hela Stockholms län minskade med 2–3 % och de hälsofarliga utsläppen i innerstaden med 9–14 %.",
   "land": "Sverige",
   "url": "https://www.regjeringen.no/globalassets/upload/sd/vedlegg/veg-og-vegtrafikk/070522_foredrag_eliasson.pdf"
  },
  "cairns2017": {
   "text": "Cairns, S., Behrendt, F., Raffo, D., Beaumont, C. & Kiefer, C. (2017). Electrically-assisted bikes: Potential impacts on travel behaviour. Transportation Research Part A 103, 327–342.",
   "fynd": "80 anställda i Brighton fick låna en elcykel i 6–8 veckor. Deras bilkörning minskade med 20 % under försöket.",
   "land": "Storbritannien",
   "url": "https://research.brighton.ac.uk/en/publications/electrically-assisted-bikes-potential-impacts-on-travel-behaviour/"
  },
  "martin2011": {
   "text": "Martin, E. & Shaheen, S. (2011). Greenhouse Gas Emission Impacts of Carsharing in North America. IEEE Transactions on Intelligent Transportation Systems 12(4), 1074–1086.",
   "fynd": "Hushållen som gick med i en bilpool minskade sin körsträcka med 27 % i genomsnitt. De flesta ökade sina utsläpp något, men de som sålde eller avstod från en bil minskade dem så mycket att utsläppen sjönk med 0,58 ton per hushåll och år.",
   "land": "USA och Kanada",
   "url": "https://its.berkeley.edu/node/1861"
  },
  "tennoy2020": {
   "text": "Tennøy, A. & Hagen, O. H. (2020). Reallocation of Road and Street Space in Oslo: Measures for Zero Growth in Urban Traffic. Discussion Paper, International Transport Forum.",
   "fynd": "Minskat utrymme för biltrafik på tre större trafikleder i Oslo minskade bilpendlingen med 16–21 % utan att trängseln eller restiderna ökade nämnvärt. Refererad i IVL C820 (2024).",
   "land": "Norge",
   "url": "https://ivl.diva-portal.org/smash/get/diva2:1840739/FULLTEXT01.pdf"
  }
 }
};
