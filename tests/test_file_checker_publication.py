"""Public availability metadata tests, not positive Lean authorization tests."""
import copy
import ast
import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('publication', Path(__file__).resolve().parents[1] / 'scripts/check_file_checker_publication.py')
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)


def metadata():
    tag = 'pcs-files-v2.0.0'
    assets = [{'name': name, 'state': 'uploaded', 'size': 1,
               'browser_download_url': f'https://github.com/{publication.REPO}/releases/download/{tag}/{name}'}
              for platform in ['linux-x64', 'windows-x64', 'macos-arm64', 'macos-x64']
              for name in [f'PCS-File-Checker-{platform}.zip', f'PCS-File-Checker-{platform}.zip.sha256']]
    return {'tag_name': tag, 'draft': False, 'prerelease': False, 'published_at': 'example', 'assets': assets}


class PublicationTests(unittest.TestCase):
    def test_builder_server_and_release_gate_require_the_same_public_assets(self):
        # Independent consumers used to disagree when new reading assets were added.
        root = Path(__file__).resolve().parents[1]
        builder = ast.parse((root/'scripts/build_file_checker.py').read_text())
        packaged = next(ast.literal_eval(n.value) for n in ast.walk(builder)
                        if isinstance(n, ast.Assign) and any(
                            isinstance(t, ast.Name) and t.id == 'public' for t in n.targets))
        server = ast.parse((root/'desktop/app.py').read_text())
        served = next(ast.literal_eval(n.value) for n in server.body
                      if isinstance(n, ast.Assign) and any(
                          isinstance(t, ast.Name) and t.id == 'PUBLIC_FILES' for t in n.targets))
        gate_spec = importlib.util.spec_from_file_location('release_gate', root/'scripts/check_file_checker_release.py')
        gate = importlib.util.module_from_spec(gate_spec)
        gate_spec.loader.exec_module(gate)
        required = {p.removeprefix('public/') for p in gate.SOURCE_FILES if p.startswith('public/')}
        self.assertEqual(len(packaged), len(set(packaged)), 'Duplicate package source')
        self.assertEqual(set(packaged), served)
        self.assertEqual(required, served)
        self.assertTrue({'page-help.mjs', 'page-help-core.mjs', 'page-help.css'} <= required)

    def test_shipped_links_match_the_version_file(self):
        self.assertRegex(publication.advertised_version(), r'^[0-9]+\.[0-9]+\.[0-9]+$')

    def test_staged_build_never_advertises_an_unpublished_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root/'desktop').mkdir()
            (root/'public').mkdir()
            (root/'desktop/VERSION').write_text('2.1.0\n')
            (root/'desktop/PUBLISHED_VERSION').write_text('2.0.0\n')
            for name in ['check-my-files.html', 'review-changes.html']:
                (root/'public'/name).write_text('/releases/download/pcs-files-v2.0.0/example.zip')
            with patch.object(publication, 'ROOT', root):
                self.assertEqual(publication.advertised_version(), '2.0.0')
                (root/'desktop/PUBLISHED_VERSION').write_text('2.1.0\n')
                with self.assertRaises(ValueError):
                    publication.advertised_version()
                for name in ['check-my-files.html', 'review-changes.html']:
                    (root/'public'/name).write_text('/releases/download/pcs-files-v2.1.0/example.zip')
                self.assertEqual(publication.advertised_version(), '2.1.0')
                # Merely editing links/marker cannot satisfy public availability.
                with self.assertRaises(ValueError):
                    publication.validate_release(metadata(), '2.1.0')

    def test_metadata_contract_does_not_claim_archive_verification(self):
        r = publication.validate_release(metadata(), '2.0.0')
        self.assertEqual(r['required_downloads'], 8)
        self.assertFalse(r['archive_contents_or_signatures_verified_by_this_check'])

    def test_each_missing_platform_or_checksum_blocks(self):
        for i in range(8):
            r = metadata()
            del r['assets'][i]
            with self.assertRaises(ValueError):
                publication.validate_release(r, '2.0.0')

    def test_unpublished_or_wrong_version_blocks(self):
        for key, value in [('draft', True), ('prerelease', True), ('published_at', None), ('tag_name', 'pcs-files-v1.0.0')]:
            r = metadata()
            r[key] = value
            with self.assertRaises(ValueError):
                publication.validate_release(r, '2.0.0')

    def test_upload_failures_and_foreign_urls_block(self):
        for key, value in [('state', 'new'), ('size', 0), ('size', True), ('browser_download_url', 'https://other.invalid/package.zip')]:
            r = metadata()
            r['assets'][0][key] = value
            with self.assertRaises(ValueError):
                publication.validate_release(r, '2.0.0')

    def test_duplicates_and_malformed_metadata_block(self):
        r = metadata()
        r['assets'].append(copy.deepcopy(r['assets'][0]))
        for bad in [r, {}, [], None]:
            with self.assertRaises(ValueError):
                publication.validate_release(bad, '2.0.0')

    def test_version_is_not_a_caller_selected_url(self):
        for version in ['../main', '2.0.0?url=other', 'latest', '2.0', '2.0.0\n']:
            with self.assertRaises(ValueError):
                publication.validate_release(metadata(), version)


if __name__ == '__main__':
    unittest.main()
