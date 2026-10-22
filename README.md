# Vägvis 2.0.7 på Streamlit

Vägvis beräknar vägtrafikens klimatavtryck per DeSO, stadsdelsområde och kommun i två modeller:

- **A – Trafik inom området:** vägnät × trafikmängd × livscykel (Malmö och Helsingborg).
- **B – Hushållens bilar:** bilinnehav × körsträcka, samma beräkning som Bilmodell v7 plus livscykel,
  mobilitetsåtgärder och referenskontroll (Malmö, Helsingborg och Gävle).
- **Områdesscenario (2.0.5):** under *Antaganden & scenario* väljer du en DeSO och prövar ny bebyggelse och
  mobilitetsåtgärder i båda modellerna, med förval för Jägersro ur Trivectors mobilitetsstrategi (2025).
- **Scenariot i kartan (2.0.6):** efter en beräkning visar kartan basfall, scenario eller förändring, och
  områdesscenariot sammanfattas i ord.
- **Per hektar och Så räknas resultatet (2.0.7):** kartan visar både totalen och CO₂ per hektar, och en ny
  flik räknar om valt område steg för steg, med schablonernas källor och kontroller mot oberoende data.

Det här arkivet publicerar Vägvis som en Streamlit-app. All beräkning sker i besökarens webbläsare.
Streamlit-servern skickar bara sidorna, så appen klarar sig gott inom Streamlit Community Clouds
gratisresurser.

| Adress | Sida |
|---|---|
| `/` eller `/vagvis` | Vägvis (startsida) |
| `/bilmodell_v7` | Bilmodell v7 |
| `/metod` | Metod och användning |
| `/trafikdata` | Dataförfrågan till Malmö stad |

## Innehåll

```
streamlit_app.py        Streamlit-appen (sidorna och layouten)
vagvis_sidor.py         Bygger varje sida som en enda HTML-text
requirements.txt        Python-paket: bara Streamlit
.streamlit/config.toml  Frivilliga inställningar (komprimering, ljust tema)
app/                    Det appen visar: Vägvis (byggd ur kallkod/), Bilmodell v7 och dokumentationssidor
dokument/               Läs mig först, ändringslogg och kontrollresultat (kopior ur kallkod/)
kallkod/                Källkoden till Vägvis: beräkning, gränssnitt, data, byggskript och tester
tests/                  Kontroller av Streamlit-appen
LICENSE.txt             Licenser
```

`app/Vagvis.html` byggs ur `kallkod/` med `node kallkod/bygg_appen.cjs`. Ändra den inte för hand.
Se `kallkod/README.md`.

Varför inte bara lägga HTML-filen i Streamlits statiska mapp? Streamlit skickar sådana HTML-filer
som ren text. Därför visar appen varje sida i en ram (`st.iframe`). Länkarna mellan sidorna leder
till Streamlit-sidorna, och Bilmodell v7:s skript, stilmallar, typsnitt och bilder bäddas in.

---

## Publicera: steg för steg

Du behöver ett GitHub-konto och en webbläsare. Du behöver inte installera något.

### Del 1. Lägg upp filerna på GitHub

1. Packa upp zip-filen. Du får mappen `vagvis-streamlit`.
2. Gå till [github.com](https://github.com) och logga in, eller skapa ett konto.
3. Klicka på **+** uppe till höger och välj **New repository**.
   - **Repository name:** till exempel `vagvis`.
   - **Public** eller **Private:** se Del 3. En publik app kräver i regel ett publikt arkiv.
   - Kryssa **inte** i *Add a README file*. README:n finns redan i paketet.
   - Klicka **Create repository**.
4. På det tomma arkivets sida klickar du på länken **uploading an existing file**.
5. Öppna mappen `vagvis-streamlit` på datorn och markera **allt innehåll i mappen**, inte själva
   mappen. Dra det till webbläsarfönstret.
   - Mappen `.streamlit` är dold. På Mac visar du den i Finder med Cmd + Skift + punkt. I Windows
     väljer du Visa → Visa → Dolda objekt. Appen fungerar även om mappen saknas, men laddar långsammare.
   - Mappar följer bara med när du drar och släpper, inte via *choose your files*.
   - GitHub tar emot högst 100 filer och 25 MB per fil i webbläsaren. Paketet har cirka 40 filer,
     och den största (`app/Vagvis.html`) är 11 MB.
6. Vänta tills alla filer syns i listan. Skriv till exempel `Vägvis 2.0.4` som meddelande och klicka
   **Commit changes**.
7. Kontrollera att `streamlit_app.py`, `vagvis_sidor.py`, `requirements.txt` och mappen `app` ligger
   direkt i arkivets översta nivå. Råkade du dra hela mappen hamnar allt under `vagvis-streamlit/`.
   Det fungerar också, men då är huvudfilens sökväg `vagvis-streamlit/streamlit_app.py` i Del 2.

Använder du git hellre än webbläsaren:

```bash
cd vagvis-streamlit
git init -b main
git add .
git commit -m "Vägvis 2.0.4 på Streamlit"
git remote add origin https://github.com/DITT-ANVÄNDARNAMN/vagvis.git
git push -u origin main
```

### Del 2. Publicera på Streamlit Community Cloud

1. Gå till [share.streamlit.io](https://share.streamlit.io) och välj **Continue with GitHub**.
   Godkänn att Streamlit får läsa dina arkiv. Ska ett privat arkiv användas måste du även godkänna
   åtkomst till privata arkiv.
2. Första gången fyller du i namn och e-post och skapar din arbetsyta.
3. Klicka **Create app** uppe till höger och välj **Yup, I have an app**.
4. Fyll i:
   - **Repository:** `DITT-ANVÄNDARNAMN/vagvis`
   - **Branch:** `main`
   - **Main file path:** `streamlit_app.py`
   - **App URL:** till exempel `vagvis-klimat`. Appen får då adressen
     `https://vagvis-klimat.streamlit.app`. Namnet måste vara ledigt.
5. Öppna **Advanced settings**. Välj **Python 3.12** (förvalet). Inga *Secrets* behövs. Klicka **Save**.
6. Klicka **Deploy**. Första gången tar det några minuter. Sedan visas Vägvis.
7. Kopiera länken: klicka **Share** uppe till höger i appen och välj **Copy link**.

### Del 3. Vem får se appen?

- Appen ärver synligheten från GitHub-arkivet. Publikt arkiv ger publik app, privat arkiv ger privat app.
- Du får ha **en** privat app i taget. Till en privat app bjuder du in läsare med e-post via **Share**.
- För att göra appen publik: **Share** → **Make this app public**, eller appens **Settings** →
  **Sharing** → *This app is public and searchable*.
- Ett publikt GitHub-arkiv kan alla läsa och ladda ner, oavsett appens inställning.

> **Kontrollera spridningen innan du gör appen publik.** Bilmodell v7 är märkt *Intern version, inte
> för spridning*, och Vägvis modell B bygger på dess data. Ska modellen inte spridas ännu, använd ett
> privat arkiv och en privat app med inbjudna läsare.

### Del 4. Gå live med en ny version

Appen på Streamlit visar alltid det som ligger på grenen `main` i GitHub-arkivet. En ny version går
live när den hamnar på `main`: Streamlit märker det och uppdaterar appen inom någon minut. Det finns
tre sätt att få dit den.

**A. Ladda upp en uppdatering (zip-fil)**

1. Packa upp zip-filen, till exempel `vagvis-uppdatering-2.0.7.zip`. Du får en mapp med till exempel
   `app`, `dokument`, `kallkod` och `README.md`.
2. Öppna arkivet på GitHub och klicka **Add file** → **Upload files**.
3. Öppna den uppackade mappen, markera **allt innehåll i mappen** (inte själva mappen) och dra det till
   webbläsarfönstret. En fil med samma namn i samma mapp ersätts; övriga filer påverkas inte.
4. Vänta tills alla filer syns i listan. Skriv ett meddelande, till exempel `Vägvis 2.0.7`, låt
   **Commit directly to the main branch** vara valt och klicka **Commit changes**.

**B. Godkänn en pull request**

Om Claude har tillgång till arkivet läggs en ny version upp som en *pull request*: ett förslag på en
egen gren, som inte syns i appen än.

1. Öppna arkivet på GitHub och klicka **Pull requests**. Öppna förslaget.
2. Under **Files changed** ser du vilka filer som ändras.
3. Klicka **Merge pull request** och **Confirm merge**. Då hamnar ändringen på `main` och går live.
   Vill du inte ha ändringen klickar du **Close pull request** i stället.

**C. Bygg själv** (kräver Node.js och git): ändra i `kallkod/`, kör `node kallkod/bygg_appen.cjs`,
kontrollera enligt `kallkod/README.md` och lägg in `kallkod/`, `app/` och `dokument/` på `main`.

**Kontrollera att den nya versionen är live**

1. Vänta en minut efter att ändringen hamnat på `main` och ladda om appen. Versionen står längst ned
   i Vägvis, till exempel *Vägvis 2.0.7 · ton per kalenderår*.
2. Visas fortfarande den gamla versionen: klicka **Manage app** nere till höger och välj **Reboot app**.
   Ändras `requirements.txt` startar Streamlit om appen själv, vilket tar några minuter.

Från version 2.0.5 läser appen om en ny `app/Vagvis.html` direkt, utan omstart.

Vill du pröva en version innan den går live kan du skapa en andra app i Streamlit från grenen i
pull requesten (**Create app**, samma arkiv, grenens namn). Ett privat arkiv ger en privat app, och
gratiskontot tillåter bara en privat app i taget.

Bra att veta om GitHub:

- **Historik:** varje *Commit changes* sparas. Klicka på **Commits** (klocksymbolen ovanför fillistan) för att se
  tidigare versioner. Öppna en äldre version av en fil och ladda ner den om du vill gå tillbaka.
- **Ta bort en fil:** öppna filen, klicka **…** uppe till höger och välj **Delete file**, sedan
  **Commit changes**.
- **Ändra en textfil direkt:** öppna filen och klicka på pennan (**Edit this file**). Använd det för
  små ändringar, till exempel i den här README-filen, inte för `app/Vagvis.html` (11 MB).
- **Storlek:** GitHub tar emot högst 100 filer och 25 MB per fil åt gången i webbläsaren. En uppdatering
  med hela `kallkod/` är cirka 80 filer.

- **Ångra:** öppna en pull request som slagits ihop och klicka **Revert**. GitHub skapar då en ny
  pull request som tar tillbaka den förra versionen; slå ihop den för att gå tillbaka.

### Del 5. Bra att veta

- **Viloläge:** en app utan besökare på 12 timmar somnar. Nästa besökare klickar
  *Yes, get this app back up!* och väntar en kort stund.
- **Beräkningstid:** en ny beräkning i modell A tar 1–3 minuter i besökarens webbläsare. Modell B tar
  några sekunder. Startresultatet visas direkt. Områdesscenariots förhandsvisning räknas direkt.
- **Nedladdningar:** CSV, projektfiler och egen HTML-kopia fungerar som i den fristående versionen.
  I en egen kopia sparad från Streamlit pekar länken till Bilmodell v7 på Streamlit-appen.
- **Bakgrundskarta:** OpenStreetMap visas när besökaren har internet. Områdeskartan fungerar ändå.
- **Inga data sparas på servern.** Projekt som besökare sparar hamnar på deras egen dator.

---

## Testa på din egen dator (valfritt)

Kräver Python 3.10 eller senare.

```bash
cd vagvis-streamlit
python -m pip install -r requirements.txt
streamlit run streamlit_app.py
```

Appen öppnas på `http://localhost:8501`. Kontrollerna körs med:

```bash
python -m pip install pytest
python -m pytest tests
```

## Felsökning

Klicka **Manage app** nere till höger i appen för att se loggen.

| Meddelande | Orsak och åtgärd |
|---|---|
| `ModuleNotFoundError: vagvis_sidor` | `vagvis_sidor.py` saknas bredvid `streamlit_app.py`. Ladda upp den. |
| `FileNotFoundError: ... app/Vagvis.html` | Mappen `app` saknas eller ligger på fel ställe. |
| Appen hittar ingen huvudfil | Kontrollera *Main file path* i Del 2, steg 4. |
| Långsam första laddning | `.streamlit/config.toml` saknas. Skapa den via **Add file → Create new file**, skriv namnet `.streamlit/config.toml` och klistra in innehållet från paketet. |

## Licenser

Vägvis källkod: MIT (se `LICENSE.txt`). Vägnät: © OpenStreetMap-bidragsgivare, ODbL.
DeSO: SCB. Leaflet: BSD 2-Clause (`app/Bilmodell_v7/lib/leaflet/LICENSE.txt`).
Typsnittet Barlow: SIL Open Font License (`app/Bilmodell_v7/fonts/OFL-Barlow.txt`).

Källor för stegen: Streamlits dokumentation om att
[publicera en app](https://docs.streamlit.io/deploy/streamlit-community-cloud/deploy-your-app/deploy),
[dela en app](https://docs.streamlit.io/deploy/streamlit-community-cloud/share-your-app),
[hantera en app](https://docs.streamlit.io/deploy/streamlit-community-cloud/manage-your-app),
[statiska filer](https://docs.streamlit.io/develop/concepts/configuration/serving-static-files) och
[`st.iframe`](https://docs.streamlit.io/develop/api-reference/text/st.iframe) (oktober 2026).
