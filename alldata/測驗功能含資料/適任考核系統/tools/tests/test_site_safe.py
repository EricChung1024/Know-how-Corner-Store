import base64, json, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import check_site_safe as cs  # noqa: E402


def jwt(role):
    b = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")
    return f"{b({'alg': 'HS256', 'typ': 'JWT'})}.{b({'role': role, 'iss': 'supabase'})}.c2lnbmF0dXJl"


def site(files):
    d = Path(tempfile.mkdtemp())
    for name, content in files.items():
        p = d / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8") if isinstance(content, str) else p.write_bytes(content)
    return str(d)


class SiteSafeTest(unittest.TestCase):
    def test_clean_site_passes(self):
        d = site({"index.html": "<html>ok</html>", "js/config.js": f"export const K = '{jwt('anon')}'; // anon key"})
        self.assertEqual(cs.scan(d), [])

    def test_publishable_key_is_allowed(self):
        self.assertEqual(cs.scan(site({"js/config.js": "export const K = 'sb_publishable_abc123';"})), [])

    def test_service_role_word_is_flagged(self):
        self.assertTrue(cs.scan(site({"js/a.js": "const k = 'service_role';"})))

    def test_service_role_jwt_is_flagged_even_without_the_word(self):
        out = cs.scan(site({"js/a.js": f"const k = '{jwt('service_role')}';"}))
        self.assertTrue(any("JWT" in x for x in out), out)

    def test_secret_key_prefix_is_flagged(self):
        self.assertTrue(cs.scan(site({"js/a.js": "const k = 'sb_secret_abcdef';"})))

    def test_answer_files_are_flagged(self):
        for name in ["questions.json", "seed.sql", "題庫.xlsx", "data/題庫總表.csv"]:
            self.assertTrue(cs.scan(site({name: "x", "index.html": "ok"})), name)

    def test_font_binary_is_not_misread(self):
        self.assertEqual(cs.scan(site({"fonts/a.woff2": bytes(range(256)) * 10})), [])

    def test_real_site_dir_is_clean(self):
        self.assertEqual(cs.scan(str(ROOT / "site")), [])


if __name__ == "__main__":
    unittest.main()
