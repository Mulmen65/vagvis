"""Offline checks of primary-data validation, geography and the delivered package."""
import ast
from collections import Counter
import copy
import csv
import io
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import shutil
import subprocess
import tempfile
import unittest
import urllib.error
import urllib.parse
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from vagvis_sidor import PAGES, page_html
from verktyg import bygg_underlag as builder
from verktyg import hamta_underlag as fetcher
from verktyg import importera_scb_bilar as cars


from verktyg.paket import read_json, unpack_project


def read(name):
    value = read_json(ROOT / name)
    if name.endswith(("/project.json", "/household-project.json")):
        value = unpack_project(value)
    return value


class PrimaryDataTests(unittest.TestCase):
    def test_activation_rejects_missing_duplicate_and_wrong_year_rows(self):
        rows = [{"kod": "1280C1000", "hh": 10, "bef": 20, "bil": 8},
                {"kod": "1280C1010", "hh": 20, "bef": 30, "bil": 15}]
        value = {"schema": "vagvis-observed-deso-2024-1", "dataYear": 2024,
                 "desoVersion": "2025", "status": "validated_official_data", "rows": rows,
                 "sourceReceipts": [{"url": "https://example.org/fiktivt-testunderlag"}]}
        expected = {row["kod"] for row in rows}
        actual = builder.validate_observations(value, expected)
        self.assertEqual(actual["1280C1000"]["bil"], 8)
        bad_values = []
        missing = copy.deepcopy(value)
        missing["rows"][0]["bil"] = None
        bad_values.append(missing)
        duplicate = copy.deepcopy(value)
        duplicate["rows"][1] = copy.deepcopy(duplicate["rows"][0])
        bad_values.append(duplicate)
        short = copy.deepcopy(value)
        short["rows"].pop()
        bad_values.append(short)
        wrong_year = copy.deepcopy(value)
        wrong_year["dataYear"] = 2023
        bad_values.append(wrong_year)
        no_receipt = copy.deepcopy(value)
        no_receipt["sourceReceipts"] = []
        bad_values.append(no_receipt)
        for bad in bad_values:
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    builder.validate_observations(bad, expected)
        self.assertIsNone(missing["rows"][0]["bil"])

    def test_scb_selection_uses_total_or_disjoint_parts_without_double_counting(self):
        dim = lambda label, labels: {"label": label, "category": {"index": {code: i for i, code in enumerate(labels)}, "label": labels}}
        metadata = {"class": "dataset", "id": ["Region", "Tid", "Status", "Kon", "Typ"],
                    "role": {"time": ["Tid"]}, "dimension": {
            "Region": dim("Region", {"1280C1000": "A", "1280C1010": "B", "0180C1000": "C"}),
            "Tid": dim("År", {"2023": "2023", "2024": "2024"}),
            "Status": dim("Status", {"IT": "i trafik", "AV": "avställda"}),
            "Kon": dim("Kön", {"KV": "kvinnor", "M": "män"}),
            "Typ": dim("Typ", {"T": "Totalt", "1": "del 1", "2": "del 2"})}}
        regions = ["1280C1000", "1280C1010"]
        selected = fetcher.selection(metadata, {"status": "i trafik"}, regions)
        self.assertEqual(selected, {"Region": regions, "Tid": ["2024"], "Status": ["IT"], "Kon": ["KV", "M"], "Typ": ["T"]})
        url = fetcher.query_url({"id": "TEST"}, selected)
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        self.assertEqual(query["valueCodes[Region]"], [",".join(regions)])
        self.assertEqual(query["valueCodes[Status]"], ["IT"])
        with self.assertRaises(ValueError):
            fetcher.selection(metadata, {"status": "i trafik"}, ["9999C0000"])
        ambiguous = dim("Okänd kategori", {"1": "del 1", "2": "del 2"})
        with self.assertRaises(ValueError):
            fetcher.total_codes(ambiguous)

    def test_scb_flatten_checks_dimension_order_cell_status_and_missing_values(self):
        dim = lambda labels: {"category": {"index": {code: i for i, code in enumerate(labels)}, "label": labels}}
        selected = {"Region": ["1280C1000", "1280C1010"], "Tid": ["2024"], "Kon": ["KV", "M"]}
        data = {"class": "dataset", "id": ["Tid", "Region", "Kon"], "size": [1, 2, 2],
                "dimension": {"Tid": dim({"2024": "2024"}), "Region": dim({"1280C1000": "A", "1280C1010": "B"}), "Kon": dim({"KV": "Kvinnor", "M": "Män"})},
                "value": [10, 20, 30, 40]}
        rows = fetcher.flatten(data, selected)
        self.assertEqual([(row["Region"], row["Kon"], row["value"]) for row in rows],
                         [("1280C1000", "KV", 10), ("1280C1000", "M", 20), ("1280C1010", "KV", 30), ("1280C1010", "M", 40)])
        for change in (None, float("nan"), True, -1):
            bad = copy.deepcopy(data)
            bad["value"][0] = change
            with self.assertRaises(ValueError):
                fetcher.flatten(bad, selected)
        truncated = copy.deepcopy(data)
        truncated["value"].pop()
        with self.assertRaises(ValueError):
            fetcher.flatten(truncated, selected)
        protected = copy.deepcopy(data)
        protected["status"] = {"0": ":"}
        with self.assertRaises(ValueError):
            fetcher.flatten(protected, selected)
        self.assertEqual(data["value"], [10, 20, 30, 40])

    def test_failed_download_writes_failure_receipt_and_does_not_activate(self):
        def denied(url):
            raise urllib.error.HTTPError(url, 403, "Forbidden", None, None)
        with tempfile.TemporaryDirectory() as directory:
            current = Path(directory) / "existing.json"
            current.write_text('{"keep":42}', encoding="utf-8")
            run = fetcher.Run(Path(directory) / "run", fetch=denied)
            self.assertIsNone(run.collect("blocked", "https://example.org/fiktivt-test"))
            receipt = run.finish()
            self.assertFalse(receipt["complete"])
            self.assertFalse(receipt["activatedInApp"])
            self.assertEqual(receipt["failed"], 1)
            self.assertIn("403", receipt["entries"][0]["error"])
            self.assertEqual(current.read_text(), '{"keep":42}')

    def test_active_areas_are_same_2025_geography_with_primary_regso_membership(self):
        a = read("kallkod/data/project.json")
        b = read("kallkod/data/household-project.json")
        desos = [row for row in a["areas"] if row["level"] == "deso"]
        districts = [row for row in a["areas"] if row["level"] == "district"]
        self.assertEqual(Counter(row["city"] for row in desos), {"1280": 209, "1283": 84, "2180": 55})
        self.assertEqual(Counter(row["city"] for row in districts), {"1280": 91, "1283": 31, "2180": 22})
        self.assertTrue(all(row["version"] == "2025" for row in a["areas"]))
        key = lambda row: (row["city"], row["level"], row["id"])
        self.assertEqual(sorted(map(key, a["areas"])), sorted(map(key, b["areas"])))
        raw = read("underlag/raw/scb_deso_2025.geojson.gz")
        expected = {feature["properties"]["id"]: feature["properties"]["regso"] for feature in raw["features"]}
        actual = {}
        for district in districts:
            for code in district["members"]:
                self.assertNotIn(code, actual)
                actual[code] = district["id"]
        self.assertEqual(expected, actual)
        self.assertEqual({row["kod"] for row in b["d"]}, set(expected))

    def test_source_receipt_and_hashes_match_actual_bytes(self):
        receipt = read("underlag/datakvitto.json")
        self.assertEqual(receipt["modelVersion"], "2.2.6")
        self.assertEqual(receipt["dataYear"], 2024)
        self.assertEqual(receipt["desoVersion"], "2025")
        for entry in receipt["dataFiles"] + receipt["builtFiles"]:
            file = ROOT / entry["file"]
            self.assertTrue(file.is_file(), entry["file"])
            raw = file.read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), entry["sha256"], entry["file"])
            self.assertEqual(len(raw), entry["bytes"])
        for filename, expected in read("underlag/SHA256.json").items():
            self.assertEqual(hashlib.sha256((ROOT / filename).read_bytes()).hexdigest(), expected, filename)

    def test_estimated_households_and_population_are_not_relabelled_as_observed_cars(self):
        b = read("kallkod/data/household-project.json")
        if b["metadata"]["dataStatus"] == "observed_register":
            # SCB:s DeSO-tabeller är inlästa: alla tre fält ska vara registerdata och stämma med kvittot.
            active = read("underlag/raw/active_scb_2024.json")
            values = {row["kod"]: row for row in active["rows"]}
            for row in b["d"]:
                for field in ("hh", "bef", "bil"):
                    self.assertEqual(row[field], values[row["kod"]][field])
                    self.assertEqual(row[field+"Status"], "observed_register")
            return
        self.assertEqual(b["metadata"]["dataStatus"], "register_cars_partial")
        baseline = read("underlag/raw/municipal_baseline_2024.json")
        active = read("underlag/raw/scb/active_cars_2024.json")
        self.assertIsNotNone(b["metadata"]["spatialProxy"])
        for city, totals in baseline["cities"].items():
            rows = [row for row in b["d"] if row["kk"] == city]
            for field in ("hh", "bef"):
                self.assertAlmostEqual(sum(row[field] for row in rows), totals[field], places=6)
            self.assertEqual(sum(row["bil"] for row in rows), active["cityTotals"][city])
            self.assertAlmostEqual(sum(row["proxyWeight"] for row in rows), 1)
        for row in b["d"]:
            self.assertEqual(row["bil"], active["byDeSO"][row["kod"]])
            self.assertEqual(row["bilStatus"], "observed_register")
            self.assertEqual(row["hhStatus"], "spatial_model_assumption")
            self.assertEqual(row["befStatus"], "spatial_model_assumption")
        row = next(row for row in b["d"] if row["kod"] == "1280C2850")
        self.assertEqual(row["hh"], 0)
        self.assertEqual(row["bil"], 545)
        self.assertIsNone(row["bph"])
        self.assertIsNone(row["bphR"])


class RegsoNameTests(unittest.TestCase):
    def test_every_regso_gets_one_official_name_from_tab6589(self):
        sys.path.insert(0, str(ROOT / "verktyg"))
        import bygg_underlag
        geo = read("underlag/raw/scb_deso_2025.geojson.gz")
        deso2reg = {f["properties"]["id"]: f["properties"]["regso"] for f in geo["features"]}
        names = bygg_underlag.regso_names(deso2reg)
        self.assertEqual(set(names), set(deso2reg.values()))
        self.assertEqual(len(names), 144)
        self.assertEqual(names["1280R081"], "Västra hamnen sydöst")
        self.assertFalse(any(n.startswith("RegSO-") for n in names.values()))
        omraden = read("kallkod/data/omraden.json")
        packed = {d[0]["id"]: d[0]["name"] for d in omraden["districts"]}
        self.assertEqual(packed, names)


class UploadedCarRegisterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.zip_path = ROOT / "underlag/raw/scb/TAB6589_sv.zip"
        cls.archive = cls.zip_path.read_bytes()
        with zipfile.ZipFile(io.BytesIO(cls.archive)) as archive:
            cls.csv_bytes = archive.read("TAB6589_sv.csv")
        cls.text = cls.csv_bytes.decode("cp1252")
        reader = csv.DictReader(io.StringIO(cls.text, newline=""))
        cls.headers = reader.fieldnames
        cls.rows = list(reader)
        cls.value_column = "Personbilar i trafik registrerade på folkbokförda personer 31 december, antal"
        geography = read("underlag/raw/scb_deso_2025.geojson.gz")
        cls.codes = {feature["properties"]["id"] for feature in geography["features"]}

    def test_actual_cp1252_zip_mixed_grain_is_filtered_and_reconciled_independently(self):
        self.assertEqual(len(self.rows), 59010)
        self.assertEqual({row["år"] for row in self.rows}, {"2024", "2025"})
        self.assertEqual({row["status"] for row in self.rows}, {"i trafik", "avställda", "totalt"})
        with self.assertRaises(UnicodeDecodeError):
            self.csv_bytes.decode("utf-8")
        selected = [row for row in self.rows if row["region"] in self.codes and row["år"] == "2024" and row["status"] == "i trafik"]
        self.assertEqual(len(selected), 348)
        independent = {row["region"]: int(row[self.value_column]) for row in selected}
        self.assertEqual(set(independent), self.codes)
        parsed = cars.parse_zip(self.zip_path)
        self.assertEqual(parsed["byDeSO"], independent)
        self.assertEqual(parsed["cityTotals"], {"1280": 100524, "1283": 58000, "2180": 43311})
        for city, name, expected in (("1280", "Malmö", 100524), ("1283", "Helsingborg", 58000), ("2180", "Gävle", 43311)):
            municipal = [row for row in self.rows if row["region"] == city + " " + name and row["år"] == "2024" and row["status"] == "i trafik"]
            self.assertEqual(len(municipal), 1)
            self.assertEqual(sum(value for code, value in independent.items() if code.startswith(city)), expected)
            self.assertEqual(int(municipal[0][self.value_column]), expected)
            # Named RegSO/municipal rows are present in the source; including
            # them would double count the same cars already assigned to DeSO.
            mixed_sum = sum(int(row[self.value_column]) for row in self.rows if (row["region"] in independent and row["region"].startswith(city) or row["region"].startswith(name + " (") or row["region"] == city + " " + name) and row["år"] == "2024" and row["status"] == "i trafik")
            self.assertGreater(mixed_sum, expected)
        receipt = parsed["sourceReceipt"]
        self.assertEqual(receipt["zip"]["sha256"], hashlib.sha256(self.archive).hexdigest())
        self.assertEqual(receipt["csv"]["sha256"], hashlib.sha256(self.csv_bytes).hexdigest())
        self.assertEqual(receipt["csv"]["encoding"], "cp1252")
        self.assertEqual(receipt["selectedRows"], 348)
        self.assertEqual(receipt["filters"]["status"], "i trafik")
        self.assertEqual(receipt["filters"]["year"], "2024")

    def test_invalid_car_import_preserves_original_zip_and_active_baseline(self):
        def write_zip(path, rows):
            content = io.StringIO(newline="")
            writer = csv.DictWriter(content, fieldnames=self.headers)
            writer.writeheader()
            writer.writerows(rows)
            with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("TAB6589_sv.csv", content.getvalue().encode("cp1252"))

        with tempfile.TemporaryDirectory() as temporary:
            temporary = Path(temporary)
            destination = temporary / "active"
            cars.import_zip(self.zip_path, destination=destination)
            initial = {path.name: path.read_bytes() for path in destination.iterdir()}
            target = next(i for i, row in enumerate(self.rows) if row["region"] == "1280C2850" and row["år"] == "2024" and row["status"] == "i trafik")
            damaged = []
            missing = list(self.rows)
            missing.pop(target)
            damaged.append(missing)
            damaged.append(self.rows + [dict(self.rows[target])])
            for value in ("..", "-1", "546"):
                changed = list(self.rows)
                changed[target] = {**changed[target], self.value_column: value}
                damaged.append(changed)
            for i, rows in enumerate(damaged):
                source = temporary / f"invalid_{i}.zip"
                write_zip(source, rows)
                with self.assertRaises(ValueError):
                    cars.import_zip(source, destination=destination)
                self.assertEqual({path.name: path.read_bytes() for path in destination.iterdir()}, initial)
            with self.assertRaises(ValueError):
                cars.import_zip(self.zip_path, year=2025, destination=destination)
            self.assertEqual({path.name: path.read_bytes() for path in destination.iterdir()}, initial)

    def _offline_rebuild(self, keep_household_register, extra=None):
        # Run the real CLI in an isolated copy, keeping the delivered inputs
        # untouched while other checks read them.
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        project = Path(temporary.name) / "project"
        shutil.copytree(ROOT / "verktyg", project / "verktyg", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / "underlag/raw", project / "underlag/raw")
        shutil.copytree(ROOT / "underlag/trafik", project / "underlag/trafik")
        (project / "kallkod/source").mkdir(parents=True)
        (project / "kallkod/data").mkdir(parents=True)
        shutil.copy2(ROOT / "kallkod/source/core.js", project / "kallkod/source/core.js")
        shutil.copy2(ROOT / "kallkod/data/config.json", project / "kallkod/data/config.json")
        shutil.copy2(ROOT / "kallkod/source/households.js", project / "kallkod/source/households.js")
        if not keep_household_register:
            (project / "underlag/raw/active_scb_2024.json").unlink(missing_ok=True)
        for name, value in (extra or {}).items():
            (project / "underlag/raw" / name).write_text(json.dumps(value, ensure_ascii=False))
        # Corrupt only a derived temporary cache; the original ZIP is the
        # authority and must replace this stale number on a normal rebuild.
        active_path = project / "underlag/raw/scb/active_cars_2024.json"
        active = json.loads(active_path.read_text())
        active["byDeSO"]["1280C2850"] = 999999
        active_path.write_text(json.dumps(active))
        result = subprocess.run([sys.executable, str(project / "verktyg/bygg_underlag.py")], cwd=project, capture_output=True, text=True, timeout=120)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((project / "underlag/raw/scb/TAB6589_sv.zip").read_bytes(), self.archive)
        return json.loads((project / "kallkod/data/household-project.json").read_text())

    def test_default_offline_rebuild_preserves_registered_counts_instead_of_one_car_per_household(self):
        rebuilt = self._offline_rebuild(keep_household_register=False)
        self.assertEqual(rebuilt["metadata"]["dataStatus"], "register_cars_partial")
        for city, expected in (("1280", 100524), ("1283", 58000), ("2180", 43311)):
            self.assertEqual(sum(row["bil"] for row in rebuilt["d"] if row["kk"] == city), expected)
        row = next(row for row in rebuilt["d"] if row["kod"] == "1280C2850")
        self.assertEqual(row["bil"], 545)
        self.assertEqual(row["hh"], 0)
        self.assertIsNone(row["bph"])

    def test_offline_rebuild_with_household_register_uses_scb_tables_and_original_car_zip(self):
        if not (ROOT / "underlag/raw/active_scb_2024.json").exists():
            self.skipTest("SCB TAB6568/TAB6574 är inte inlästa i detta paket.")
        rebuilt = self._offline_rebuild(keep_household_register=True)
        self.assertEqual(rebuilt["metadata"]["dataStatus"], "observed_register")
        register = {row["kod"]: row for row in read("underlag/raw/active_scb_2024.json")["rows"]}
        for row in rebuilt["d"]:
            for field in ("hh", "bef", "bil"):
                self.assertEqual(row[field], register[row["kod"]][field])
                self.assertEqual(row[field + "Status"], "observed_register")
            self.assertNotIn("proxyWeight", row)
        for city, totals in rebuilt["metadata"]["cityBaselines"].items():
            self.assertEqual(totals["bil"], sum(row["bil"] for row in rebuilt["d"] if row["kk"] == city))
        row = next(row for row in rebuilt["d"] if row["kod"] == "1280C2850")
        self.assertEqual(row["bil"], 545)
        self.assertGreater(row["hh"], 0)
        self.assertAlmostEqual(row["bph"], row["bil"] / row["hh"])
        self.assertIsNone(rebuilt["metadata"]["spatialProxy"])


    def test_offline_rebuild_uses_measured_mileage_per_deso_before_municipal_values(self):
        cars = json.loads((ROOT / "underlag/raw/scb/active_cars_2024.json").read_text())["byDeSO"]
        codes = sorted(cars)
        kommun = {"schema": "vagvis-korstracka-kommun-1", "dataYear": 2024, "status": "validated_official_data",
                  "cities": {"1280": {"kmPerCar": 11893}, "1283": {"kmPerCar": 12965}, "2180": {"kmPerCar": 13300}}}
        rows = [{"kod": k, "km": 9000.0, "status": "observed_register", "cars": cars[k], "totalKm": cars[k] * 9000.0} for k in codes]
        rows[0]["status"] = "suppressed"
        deso = {"schema": "vagvis-korstracka-deso-1", "dataYear": 2024, "status": "validated_official_data", "rows": rows}
        rebuilt = self._offline_rebuild(keep_household_register=True,
                                        extra={"korstracka_kommun_2024.json": kommun, "korstracka_deso_2024.json": deso})
        by = {r["kod"]: r for r in rebuilt["d"]}
        self.assertEqual(by[codes[1]]["km"], 9000.0)
        self.assertEqual(by[codes[1]]["kmStatus"], "observed_register")
        self.assertEqual(by[codes[0]]["kmStatus"], "derived_official")
        self.assertEqual(by[codes[0]]["km"], kommun["cities"][codes[0][:4]]["kmPerCar"])
        self.assertEqual(rebuilt["metadata"]["annualKm"]["level"], "blandad")
        self.assertEqual(rebuilt["config"]["household"]["kmMode"], "local")


class PackageTests(unittest.TestCase):
    def test_html_routes_are_allowlisted_and_method_button_is_retained(self):
        self.assertEqual(set(PAGES), {"vagvis", "metod", "trafikdata"})
        for name in PAGES:
            text = page_html(name)
            self.assertIn("<html", text.lower())
            self.assertNotRegex(text, r"\{\{[^}]+\}\}")
        self.assertIn("method-footer", page_html("vagvis"))
        self.assertIn("Beräkningsbeskrivning och källor", page_html("vagvis"))
        with self.assertRaises(ValueError):
            page_html("../../etc/passwd")

    def test_runtime_assembly_matches_offline_build(self):
        from vagvis_sidor import assemble
        built = ROOT / "app/Vagvis.html"
        if not built.exists():
            self.skipTest("app/Vagvis.html byggs av node kallkod/bygg_appen.cjs")
        self.assertEqual(assemble(), built.read_text(encoding="utf-8"))

    def test_repository_fits_github_web_upload(self):
        skip = {".git", "testresultat", "node_modules", "__pycache__", ".pytest_cache"}
        files = [p for p in ROOT.rglob("*") if p.is_file() and not skip & set(p.relative_to(ROOT).parts)
                 and p.relative_to(ROOT).as_posix() != "app/Vagvis.html"]
        sizes = {p.relative_to(ROOT).as_posix(): p.stat().st_size for p in files}
        self.assertLess(len(sizes), 100, "GitHub tar emot högst 100 filer per uppladdning i webbläsaren")
        self.assertLess(max(sizes.values()), 10 * 1024 * 1024, max(sizes, key=sizes.get))
        self.assertLess(sum(sizes.values()), 25 * 1024 * 1024)

    def test_streamlit_wrapper_has_no_runtime_api_fetch_or_extra_model_page(self):
        for file in ("streamlit_app.py", "vagvis_sidor.py"):
            text = (ROOT / file).read_text(encoding="utf-8")
            tree = ast.parse(text)
            modules = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    modules.extend(alias.name for alias in node.names)
                elif isinstance(node, ast.ImportFrom):
                    modules.append(node.module or "")
            self.assertFalse(any(module.startswith(("requests", "urllib", "httpx")) for module in modules))
            self.assertNotIn("urlopen", text)
        self.assertIn('page_title="Vägvis 2.2.6"', (ROOT / "streamlit_app.py").read_text())

    def test_evidence_has_unique_parameters_sources_and_no_orphan_references(self):
        registry = read("underlag/evidensregister.json")
        self.assertEqual(registry["version"], "2.2.6")
        for group in ("parameters", "sources"):
            ids = [row["id"] for row in registry[group]]
            self.assertEqual(len(ids), len(set(ids)), group)
        source_ids = {row["id"] for row in registry["sources"]}
        for parameter in registry["parameters"]:
            self.assertTrue(parameter.get("status"), parameter["id"])
            for source in parameter.get("sources", []):
                self.assertIn(source, source_ids, parameter["id"])
        for source in registry["sources"]:
            self.assertTrue(source.get("title"))
            if source.get("url"):
                self.assertRegex(source["url"], r"^https://")

    def test_third_party_license_and_runtime_pin_are_packaged(self):
        self.assertIn("BSD 2-Clause", (ROOT / "licenser/Leaflet.txt").read_text())
        self.assertIn("streamlit==1.50.0", (ROOT / "requirements.txt").read_text())
        self.assertTrue((ROOT / ".github/workflows/kontroller.yml").is_file())
        self.assertTrue((ROOT / ".streamlit/config.toml").is_file())



class LandAreaTests(unittest.TestCase):
    """Landmask och yta utan hav (verktyg/bygg_landmask.py) används för kartan och nyckeltalet per hektar."""

    def test_land_data_is_consistent(self):
        receipt = json.loads((ROOT/"underlag/raw/coast_receipt.json").read_text(encoding="utf-8"))
        ytor = json.loads((ROOT/"kallkod/data/ytor.json").read_text(encoding="utf-8"))["A"]
        built = json.loads((ROOT/"kallkod/data/land.json").read_text(encoding="utf-8"))
        land_file = ROOT/"underlag/raw/land_area_2026.json"
        if all(c.get("status") == "unavailable" for c in receipt["cities"].values()):
            # Utan godkänd landmask: ingen mask i kartan och ingen yta utan hav. (En kvarglömd grov
            # mask från 2.2.5 i underlag/raw tas bort av Stada repo och används inte av appen.)
            self.assertEqual(built, {})
            self.assertTrue(all(row["landHa"] is None for row in ytor.values()))
            self.assertTrue(all(c["status"] == "unavailable" for c in receipt["cities"].values()))
            return
        land = json.loads(land_file.read_text(encoding="utf-8"))
        self.assertEqual(land["sha256"], receipt["sha256"])
        areas = land["areas"]
        for key, row in ytor.items():
            parts = key.split("|")
            level, city, code = parts[0], parts[1], parts[-1]
            if level == "city":
                self.assertAlmostEqual(row["landHa"], areas["city|"+city], places=1)
                self.assertAlmostEqual(row["landHa"], receipt["cities"][city]["landHa"], places=1)
                continue
            self.assertIn(code, areas, key)
            self.assertAlmostEqual(row["landHa"], areas[code], places=2)
            self.assertLessEqual(row["landHa"], row["ha"]*1.001+0.05, key)
        for city in ("1280", "1283", "2180"):
            self.assertEqual(receipt["cities"][city]["status"], "osm_land_polygons")
            self.assertIsNotNone(receipt["cities"][city]["roadCheck"]["outsidePercent"])
            deso = sum(v for k, v in areas.items() if k[:5] in (city+"A", city+"B", city+"C"))
            regso = sum(v for k, v in areas.items() if k.startswith(city+"R"))
            self.assertAlmostEqual(deso, areas["city|"+city], delta=1)
            self.assertAlmostEqual(regso, areas["city|"+city], delta=1)
        self.assertEqual(sorted(built), ["1280", "1283", "2180"])


@unittest.skipUnless(importlib.util.find_spec("shapely") and importlib.util.find_spec("shapefile"),
                     "kräver shapely och pyshp")
class LandmaskToolTests(unittest.TestCase):
    """bygg_landmask.py med syntetiska landpolygoner i samma format som osmdata (zippad shapefil)."""

    @staticmethod
    def _zip(path, geoms):
        import shapefile
        from shapely.geometry.polygon import orient
        stem = Path(path).with_suffix("")
        w = shapefile.Writer(str(stem), shapeType=shapefile.POLYGON)
        w.field("FID", "N")
        for i, g in enumerate(geoms):
            for poly in getattr(g, "geoms", [g]):
                poly = orient(poly, sign=-1.0)  # yttre ring medurs enligt shapefilformatet
                w.poly([list(poly.exterior.coords)]+[list(r.coords) for r in poly.interiors])
                w.record(i)
        w.close()
        with zipfile.ZipFile(path, "w") as z:
            for ext in (".shp", ".shx", ".dbf"):
                z.write(str(stem)+ext, "land-polygons-split-4326/land_polygons"+ext)

    def _load(self):
        spec = importlib.util.spec_from_file_location("bygg_landmask", ROOT/"verktyg/bygg_landmask.py")
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod

    def _cities(self):
        from shapely.geometry import shape
        from shapely.ops import unary_union
        deso = read("underlag/raw/scb_deso_2025.geojson.gz")["features"]
        return {c: unary_union([shape(f["geometry"]).buffer(0) for f in deso if f["properties"]["city"] == c])
                for c in ("1280", "1283", "2180")}

    def test_accepts_detailed_land_and_writes_consistent_files(self):
        mod = self._load()
        cities = self._cities()
        land = [u.buffer(0.003).simplify(0.0005) for u in cities.values()]
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp)/"land-polygons-split-4326.zip"
            self._zip(src, land)
            out = Path(tmp)/"ut"
            result = mod.main([str(src)], out_dir=out)
            self.assertEqual(sorted(result), ["1280", "1283", "2180"])
            areas = json.loads((out/"land_area_2026.json").read_text(encoding="utf-8"))["areas"]
            receipt = json.loads((out/"coast_receipt.json").read_text(encoding="utf-8"))
            masks = json.loads((out/"coast_display_2026.json").read_text(encoding="utf-8"))
            self.assertEqual(receipt["source"], mod.OSMDATA)
            for c, r in result.items():
                self.assertEqual(r["status"], "osm_land_polygons")
                self.assertLessEqual(r["roadCheck"]["outsidePercent"], 0.1)
                # Hela kommunen ligger på "land": ytan utan hav är lika med hela ytan.
                self.assertAlmostEqual(r["landHa"], r["totalHa"], delta=r["totalHa"]*0.002)
                self.assertEqual(masks[c]["type"], "FeatureCollection")
                self.assertAlmostEqual(areas["city|"+c], r["landHa"], places=1)

    def test_rejects_coarse_land_without_writing(self):
        from shapely.geometry import box
        mod = self._load()
        cities = self._cities()
        land = []
        for u in cities.values():
            x0, y0, x1, y1 = u.bounds
            land.append(u.buffer(0.003).difference(box(x0, y0, (x0+x1)/2, (y0+y1)/2)))  # en fjärdedel "hav"
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp)/"grov.zip"
            self._zip(src, land)
            out = Path(tmp)/"ut"
            with self.assertRaises(SystemExit) as err:
                mod.main([str(src)], out_dir=out)
            self.assertIn("avvisades", str(err.exception))
            self.assertFalse(out.exists())

if __name__ == "__main__":
    unittest.main()
