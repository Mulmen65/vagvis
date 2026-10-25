"""Kontroller av importverktygen för uppmätta trafikflöden, SCB-hushåll och koordinater (syntetiska filer)."""
import csv
import hashlib
import io
import json
from pathlib import Path
import sqlite3
import struct
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "verktyg"))
import geodesi  # noqa: E402
import importera_nvdb_adt as nvdb  # noqa: E402
import importera_scb_hushall as hushall  # noqa: E402
import stada_repo  # noqa: E402
import importera_korstracka as korstracka  # noqa: E402
import importera_trafikmatningar as matningar  # noqa: E402
import vagdata  # noqa: E402
from paket import read_json  # noqa: E402
import bygg_underlag  # noqa: E402


def offset(points, metres):
    """Flytta (lon, lat)-punkter norrut några meter för att simulera en annan digitalisering."""
    return [(x, y + metres / 110574.0) for x, y in points]


class GeodesyTests(unittest.TestCase):
    def test_roundtrip_and_published_malmo_geometry(self):
        for lat, lon in [(55.6, 13.0), (60.67, 17.14), (56.05, 12.69)]:
            for epsg in (3006, 3008):
                n, e = geodesi.wgs84_to_sweref(lat, lon, epsg)
                la, lo = geodesi.sweref_to_wgs84(n, e, epsg)
                self.assertAlmostEqual(la, lat, places=9)
                self.assertAlmostEqual(lo, lon, places=9)
        # Västligaste punkten i SCB:s DeSO-fil för Malmö (SWEREF 99 TM) mot paketets WGS84-geometri.
        shp = zipfile.ZipFile(ROOT / "underlag/raw/gis/DESO_2025_Malmo.zip").read("DESO_2025_Malmo/DESO_2025_Malmo.shp")
        pos, points = 100, []
        while pos < len(shp):
            _, length = struct.unpack(">2i", shp[pos:pos + 8])
            rec = shp[pos + 8:pos + 8 + length * 2]
            pos += 8 + length * 2
            if struct.unpack("<i", rec[:4])[0] in (5, 15):
                parts, count = struct.unpack("<2i", rec[36:44])
                off = 44 + 4 * parts
                points += [struct.unpack("<2d", rec[off + 16 * k:off + 16 * k + 16]) for k in range(count)]
        west = min(points)
        lon, lat = geodesi.to_wgs84(west[0], west[1], 3006)
        geo = read_json(ROOT / "underlag/raw/scb_deso_2025.geojson.gz")
        pts = [c for f in geo["features"] if f["properties"]["city"] == "1280"
               for poly in ([f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"])
               for ring in poly for c in ring]
        target = min(pts)
        self.assertAlmostEqual(lon, target[0], places=7)
        self.assertAlmostEqual(lat, target[1], places=7)


class NvdbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.roads = vagdata.load_roads("1280")
        cls.road = next(r for r in cls.roads if r["id"] == "OSM-148500437")  # E20, enkelriktad körbana

    def feature(self):
        line = offset([tuple(c) for c in self.road["geometry"]["coordinates"]], 6)
        sweref = [geodesi.wgs84_to_sweref(y, x) for x, y in line]
        return {"type": "Feature", "properties": {"ADT": 52000, "TUNGA": 6240, "MATAR": 2022},
                "geometry": {"type": "LineString", "coordinates": [[e, n] for n, e in sweref]}}

    def check(self, records):
        rec = next(r for r in records if r["osmId"] == self.road["id"])
        self.assertAlmostEqual(rec["flowBothDirections"], 52000)
        self.assertEqual(rec["directionShare"], 0.5)
        self.assertAlmostEqual(rec["heavyShare"], 0.12 - 0.004)
        self.assertEqual(rec["measurementYear"], 2022)
        self.assertAlmostEqual(rec["yearFactorCV"], 0.06)
        self.assertGreaterEqual(rec["matchCoverage"], 0.95)

    def test_geojson_in_sweref_is_matched_to_osm(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nvdb.geojson"
            path.write_text(json.dumps({"type": "FeatureCollection", "crs": {"type": "name", "properties": {"name": "EPSG:3006"}},
                                        "features": [self.feature()]}))
            features = vagdata.read_lines(path)
            records = nvdb.build_records(self.roads, features, "ADT", "TUNGA", "MATAR")
            self.check(records)
            # Parallell väg på andra sidan (motsatt körbana) ska inte få flödet om den ligger längre bort än 20 m.
            self.assertLess(len(records), 6)

    def test_geopackage_reader(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nvdb.gpkg"
            coords = self.feature()["geometry"]["coordinates"]
            wkb = struct.pack("<BII", 1, 2, len(coords)) + b"".join(struct.pack("<2d", *c) for c in coords)
            blob = b"GP" + bytes([0, 0]) + struct.pack("<i", 3006) + wkb
            con = sqlite3.connect(path)
            con.execute("create table gpkg_geometry_columns (table_name text, column_name text, geometry_type_name text, srs_id int, z int, m int)")
            con.execute("insert into gpkg_geometry_columns values ('trafik','geom','LINESTRING',3006,0,0)")
            con.execute("create table trafik (fid integer primary key, geom blob, ADT real, TUNGA real, MATAR int)")
            con.execute("insert into trafik (geom, ADT, TUNGA, MATAR) values (?,?,?,?)", (blob, 52000, 6240, 2022))
            con.commit()
            con.close()
            self.check(nvdb.build_records(self.roads, vagdata.read_lines(path), "ADT", "TUNGA", "MATAR"))


class CountTests(unittest.TestCase):
    def test_mvd_conversion_uses_trafikverket_indices(self):
        f = matningar.mvd_to_aadt_factor("nar", 0.0, None)
        self.assertAlmostEqual(f, 1 / ((102.3 + 103.0 + 104.0 + 107.2 + 112.4) / 5 / 100))
        f3 = matningar.mvd_to_aadt_factor("nar", 0.1, 3)
        expected = 0.9 / (1.0578 * 0.981) + 0.1 / (1.2378 * 0.98)
        self.assertAlmostEqual(f3, expected, places=4)

    def test_point_count_is_matched_and_converted(self):
        roads = vagdata.load_roads("1280")
        road = next(r for r in roads if r["roadClass"] == "tertiary" and not r.get("oneway"))
        a, b = road["geometry"]["coordinates"][:2]
        mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "matningar.csv"
            path.write_text("id;lat;lon;flode;matt;manad;ar;riktning;tung_andel;kalla\n"
                            f"P1;{mid[1]};{mid[0]};8000;MVD;10;2023;both;0,05;Testkommun\n", encoding="utf-8")
            points = matningar.parse_csv(path)
            records = matningar.build_records(roads, points)
        rec = next(r for r in records if r["osmId"] == road["id"])
        factor = matningar.mvd_to_aadt_factor("nar", 0.05, 10)
        self.assertAlmostEqual(rec["flowBothDirections"], round(8000 * factor, 1))
        self.assertEqual(rec["directionShare"], 1.0)
        self.assertEqual(rec["conversion"]["cv"], 0.10)
        self.assertAlmostEqual(rec["yearFactorCV"], 0.03)

    def test_invalid_rows_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "fel.csv"
            path.write_text("id,lat,lon,flode,matt,ar\nX,55.6,13.0,100,PCU,2024\n", encoding="utf-8")
            with self.assertRaises(ValueError):
                matningar.parse_csv(path)


class MeasuredRoadBuildTests(unittest.TestCase):
    def test_imported_records_become_measured_with_audit(self):
        roads = [{"id": "R1", "city": "1280", "roadClass": "primary", "aadt": None, "oneway": True, "year": 2026,
                  "quality": "assumed", "source": "OSM", "countBasis": "geometry",
                  "geometry": {"type": "LineString", "coordinates": [[13.0, 55.6], [13.001, 55.6]]}}]
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nvdb_adt_2024.json"
            vagdata.write_measured(path, [{"osmId": "R1", "flowMetric": "AADT", "flowBothDirections": 20000, "directionShare": 0.5,
                                           "directionCV": 0.05, "aadtCV": 0.1, "measurementYear": 2022, "yearFactor": 1.0,
                                           "yearFactorCV": 0.06, "yearFactorSource": "test", "heavyShare": 0.08, "source": "Test"}], {})
            old = bygg_underlag.MEASURED_ROADS
            bygg_underlag.MEASURED_ROADS = [path]
            try:
                used, files = bygg_underlag.apply_measured_roads(roads, set())
            finally:
                bygg_underlag.MEASURED_ROADS = old
        self.assertEqual(used, ["R1"])
        r = roads[0]
        self.assertEqual(r["aadt"], 10000)
        self.assertEqual(r["quality"], "measured")
        self.assertEqual({f["name"] for f in r["flowAudit"]["factors"]}, {"Årskorrigering", "Riktningsandel"})
        self.assertEqual(r["flowUncertainty"]["Riktningsandel"]["cv"], 0.05)


class HouseholdImportTests(unittest.TestCase):
    def make_zip(self, path, table, header, rows):
        buf = io.StringIO()
        w = csv.writer(buf, quoting=csv.QUOTE_NONNUMERIC)
        w.writerow(header)
        for r in rows:
            w.writerow(r)
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(table + "_sv.csv", buf.getvalue().encode("cp1252"))

    def fixtures(self, tmp, scale=1.0):
        codes = sorted(hushall.expected_codes())
        base = read_json(ROOT / "underlag/raw/municipal_baseline_2024.json")["cities"]
        hh_rows, bef_rows = [], []
        for city, name in hushall.CITIES.items():
            mine = [c for c in codes if c.startswith(city)]
            pop = base[city]["bef"]
            per = [pop // len(mine)] * len(mine)
            per[0] += pop - sum(per)
            for code, p in zip(mine, per):
                hh = max(1, p // 2)
                hh_rows += [[code, "ensamstående", "2024", hh // 2], [code, "sammanboende", "2024", hh - hh // 2], [code, "ensamstående", "2023", 1]]
                bef_rows += [[code, "totalt ålder", "män", "2024", p // 2], [code, "totalt ålder", "kvinnor", "2024", p - p // 2], [code, "0 år", "män", "2024", 1]]
            hh_total = sum(r[3] for r in hh_rows if r[0].startswith(city) and r[2] == "2024")
            hh_rows += [[city + " " + name, "ensamstående", "2024", hh_total]]
            bef_rows += [[city + " " + name, "totalt ålder", "män", "2024", int(pop * scale)]]
        a, b = Path(tmp) / "TAB6568_sv.zip", Path(tmp) / "TAB6574_sv.zip"
        self.make_zip(a, "TAB6568", ["region", "hushållstyp", "år", "Antal hushåll"], hh_rows)
        self.make_zip(b, "TAB6574", ["region", "ålder", "kön", "år", "Folkmängd"], bef_rows)
        return a, b

    def test_complete_files_are_validated_and_reconciled(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = self.fixtures(tmp)
            value = hushall.import_files(a, b, write=False)
        self.assertEqual(len(value["rows"]), 348)
        self.assertEqual(value["schema"], "vagvis-observed-deso-2024-1")
        malmo = sum(r["bef"] for r in value["rows"] if r["kod"].startswith("1280"))
        self.assertEqual(malmo, 365644)
        self.assertEqual(value["sourceReceipts"][1]["filters"]["ålder"], "totalt ålder")
        self.assertEqual(value["sourceReceipts"][0]["filters"]["hushållstyp"], "summa av samtliga kategorier")

    def test_unpacked_csv_and_macos_zip_give_same_result(self):
        # SCB:s bulkfiler kan levereras uppackade, eller packas om på macOS med en __MACOSX-post.
        with tempfile.TemporaryDirectory() as tmp:
            a, b = self.fixtures(tmp)
            reference = hushall.import_files(a, b, write=False)
            with zipfile.ZipFile(a) as z:
                csv_a = Path(tmp) / "TAB6568_sv.csv"
                csv_a.write_bytes(z.read("TAB6568_sv.csv"))
            mac_b = Path(tmp) / "TAB6574_sv_csv_1.zip"
            with zipfile.ZipFile(b) as z, zipfile.ZipFile(mac_b, "w") as out:
                out.writestr("TAB6574_sv.csv", z.read("TAB6574_sv.csv"))
                out.writestr("__MACOSX/._TAB6574_sv.csv", b"\x00\x05\x16\x07")
            value = hushall.import_files(csv_a, mac_b, write=False)
        self.assertEqual(value["rows"], reference["rows"])
        self.assertEqual(value["sourceReceipts"][0]["zip"]["format"], "csv")
        self.assertEqual(value["sourceReceipts"][1]["zip"]["format"], "zip")

    def test_mismatch_against_municipal_population_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = self.fixtures(tmp, scale=1.1)
            with self.assertRaises(ValueError):
                hushall.import_files(a, b, write=False)


class StadaRepoTests(unittest.TestCase):
    def test_old_model_files_and_unknown_code_are_removed_but_data_is_kept(self):
        files = ["README.md", "MANIFEST_SHA256.json", "app/aldre_sida.html", "kallkod/source/v7-berakning.js",
                 "pages/2_aldre_modell.py", "app/Vagvis.html", "dokument/Vagvis_manual_2.1.1.docx",
                 "underlag/raw/osm_roads_2026.geojson", "underlag/trafik/nvdb_adt_2024.json", "dokument/egna_anteckningar.docx"]
        remove, review = stada_repo.classify(files, {"README.md"})
        self.assertEqual(set(remove), {"app/aldre_sida.html", "kallkod/source/v7-berakning.js", "pages/2_aldre_modell.py",
                                       "app/Vagvis.html", "dokument/Vagvis_manual_2.1.1.docx", "underlag/raw/osm_roads_2026.geojson"})
        self.assertEqual(set(review), {"underlag/trafik/nvdb_adt_2024.json", "dokument/egna_anteckningar.docx"})


class KorstrackaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cars = read_json(ROOT / "underlag/raw/scb/active_cars_2024.json")["byDeSO"]

    def test_kommun_values_are_transferred_with_ratio_to_national(self):
        value = korstracka.build_kommun({"1280": 1064, "1283": 1141, "2180": 1200}, 1141, 2024, {"entry": "test"})
        self.assertEqual(value["cities"]["1283"]["kmPerCar"], 12753)
        self.assertEqual(value["cities"]["1280"]["kmPerCar"], round(12753 * 1064 / 1141))
        with self.assertRaises(ValueError):
            korstracka.build_kommun({"1280": 1064, "1283": 1141}, 1141, 2024, {})
        with self.assertRaises(ValueError):
            korstracka.build_kommun({"1280": 106400, "1283": 1141, "2180": 1200}, 1141, 2024, {})

    def test_rus_excel_is_read_from_year_column(self):
        try:
            import openpyxl
        except ImportError:
            self.skipTest("openpyxl saknas")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Tabell-2.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Mil per invånare"
            ws.append(["Kommun", 2023, 2024])
            ws.append(["1280 Malmö", 450, 451])
            bil = wb.create_sheet("Mil per bil")
            bil.append(["Körsträcka per personbil i trafik"])
            bil.append(["Kommun", "2023", "2024"])
            for row in (["Riket", 1130, 1141], ["1280 Malmö", 1062, 1064], ["1283 Helsingborg", 1150, 1160], ["2180 Gävle", 1180, 1190]):
                bil.append(row)
            wb.save(path)
            values, riket, sheet = korstracka.rus_from_excel(path, 2024)
        self.assertEqual(sheet, "Mil per bil")
        self.assertEqual(values, {"1280": 1064, "1283": 1160, "2180": 1190})
        self.assertEqual(riket, 1141)

    def test_rus_layout_with_paired_year_columns_and_codes(self):
        # Samma uppställning som RUS tabell 2: "År 1999" … med kolumnerna per bil / per invånare,
        # kod i första kolumnen och region som "1280MALMÖ". Ett datavärde lika med en kommunkod
        # (1280 mil) får inte tolkas som kommunens rad.
        try:
            import openpyxl
        except ImportError:
            self.skipTest("openpyxl saknas")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "Tabell-2-Korstracka.xlsx"
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = "Tabell 2"
            ws.append(["Källa: SCB"])
            ws.append([None, None, "År 1999", None, "År 2024", None])
            ws.append(["Kod", "Region", "Körsträcka per bil", "Körsträcka per invånare", "Körsträcka per bil", "Körsträcka per invånare"])
            ws.append([0, "0 RIKET\u00a0", 1297, 640, 1141.5, 624.8])
            ws.append([580, "0580LINKÖPING      ", 1280, 571, 1126.2, 524.3])
            ws.append([1280, "1280MALMÖ          ", 1209, 466, 1064.4, 450.7])
            ws.append([1283, "1283HELSINGBORG    ", 1225, 578, 1156.1, 558.3])
            ws.append([2180, "2180GÄVLE          ", 1203, 560, 1120.7, 566.0])
            wb.save(path)
            values, riket, _ = korstracka.rus_from_excel(path, 2024)
        self.assertEqual(values, {"1280": 1064.4, "1283": 1156.1, "2180": 1120.7})
        self.assertEqual(riket, 1141.5)

    def test_packaged_municipal_mileage_matches_stored_rus_table(self):
        active = ROOT / "underlag/raw/korstracka_kommun_2024.json"
        if not active.exists():
            self.skipTest("Ingen körsträcka per kommun inläst.")
        try:
            import openpyxl  # noqa: F401
        except ImportError:
            self.skipTest("openpyxl saknas")
        value = read_json(active)
        source = ROOT / value["source"]["file"]
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), value["source"]["sha256"])
        values, riket, _ = korstracka.rus_from_excel(source, 2024)
        self.assertEqual(value["national"]["rusMilPerCar"], riket)
        for code, mil in values.items():
            self.assertEqual(value["cities"][code]["rusMilPerCar"], mil)
            self.assertEqual(value["cities"][code]["kmPerCar"], round(12753 * mil / riket))

    def _csv(self, tmp, rows):
        path = Path(tmp) / "korstracka_deso_2024.csv"
        path.write_text("deso;ar;antal_bilar_31dec;korstracka_km\n" + "\n".join(";".join(map(str, r)) for r in rows) + "\n", encoding="utf-8")
        return path

    def test_deso_delivery_gives_km_per_car_and_falls_back_for_protected_cells(self):
        codes = sorted(self.cars)
        rows = [[k, 2024, self.cars[k], self.cars[k] * (9000 + i)] for i, k in enumerate(codes)]
        rows[0] = [codes[0], 2024, "..", ".."]
        with tempfile.TemporaryDirectory() as tmp:
            value = korstracka.build_deso(self._csv(tmp, rows), 2024, {"1280": {"kmPerCar": 11893}})
        by = {r["kod"]: r for r in value["rows"]}
        self.assertEqual(len(by), 348)
        self.assertEqual(by[codes[0]]["status"], "suppressed")
        self.assertEqual(by[codes[0]]["km"], 11893 if codes[0].startswith("1280") else 12753)
        self.assertAlmostEqual(by[codes[5]]["km"], 9005, places=1)
        self.assertEqual(sum(r["status"] == "observed_register" for r in value["rows"]), 347)

    def test_deso_delivery_with_wrong_population_or_missing_areas_is_rejected(self):
        codes = sorted(self.cars)
        good = [[k, 2024, self.cars[k], self.cars[k] * 10000] for k in codes]
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                korstracka.build_deso(self._csv(tmp, good[:-1]), 2024)
            wrong = [list(r) for r in good]
            big = max(range(len(wrong)), key=lambda i: wrong[i][2])
            wrong[big][2] = int(wrong[big][2] * 1.5)
            with self.assertRaises(ValueError):
                korstracka.build_deso(self._csv(tmp, wrong), 2024)
            odd = [list(r) for r in good]
            odd[3][3] = odd[3][2] * 200
            with self.assertRaises(ValueError):
                korstracka.build_deso(self._csv(tmp, odd), 2024)


if __name__ == "__main__":
    unittest.main()
