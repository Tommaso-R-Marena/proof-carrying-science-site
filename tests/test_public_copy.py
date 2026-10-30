"""Keep editorial improvements from changing source-bound historical evidence."""
import ast
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_copy', ROOT/'scripts/check_public_copy.py')
copy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy)


class PublicCopyTests(unittest.TestCase):
    def test_ordinary_prose_is_checked_without_flagging_empty_results_or_code(self):
        self.assertEqual(copy.review_copy('example.html', b'<p>Result: \xe2\x80\x94</p><code>left\xe2\x80\x94right</code>')['issues'], [])
        result = copy.review_copy('example.html', '<p>One claim—not another. Delve into it.</p>'.encode())
        self.assertEqual({i['rule'] for i in result['issues']}, {'prose_em_dash', 'canned_phrase'})

    def test_exact_qualified_page_discloses_its_retained_parenthetical(self):
        name = 'public/calibration-lab.html'
        result = copy.review_copy(name, (ROOT/name).read_bytes())
        self.assertEqual(result['issues'], [])
        self.assertEqual(len(result['preserved_qualified_findings']), 1)

    def test_editing_the_qualified_page_cannot_reuse_the_editorial_exception(self):
        name = 'public/calibration-lab.html'
        for raw in [(ROOT/name).read_bytes()+b' ', b'<p>Rewritten.</p>']:
            result = copy.review_copy(name, raw)
            self.assertIn('qualified_source_changed', {x['rule'] for x in result['issues']})
            self.assertEqual(result['preserved_qualified_findings'], [])

    def test_live_health_html_markers_match_the_actual_shipped_pages(self):
        tree = ast.parse((ROOT/'scripts/check_live_site.py').read_text())
        checks = next(ast.literal_eval(node.value) for node in tree.body
                      if isinstance(node, ast.Assign) and
                      any(isinstance(t, ast.Name) and t.id == 'CHECKS' for t in node.targets))
        for url, content_type, marker in checks:
            if content_type != 'text/html':
                continue
            source = ROOT/'public'/(urlsplit(url).path.lstrip('/') or 'index.html')
            with self.subTest(page=url):
                self.assertTrue(marker in source.read_text(), f'{url}: live health marker is stale')

    def test_every_existing_local_qualification_binding_still_matches(self):
        # The complete hosted gate separately binds these to the independent core.
        # This makes the existing exact local-source check run in the quick gate too.
        for name in ['d1-present-state-baseline-v1/clone-boundary-qualification.json',
                     'website-research-sync-v1/calibration-browser.json']:
            receipt = json.loads((ROOT/'docs/evidence'/name).read_text())
            for source, expected in receipt['source_sha256'].items():
                with self.subTest(source=source):
                    self.assertEqual(hashlib.sha256((ROOT/source).read_bytes()).hexdigest(), expected)


if __name__ == '__main__':
    unittest.main()
