"""Public availability metadata tests, not positive Lean authorization tests."""
import copy
import importlib.util
from pathlib import Path
import unittest

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
    def test_shipped_links_match_the_version_file(self):
        self.assertRegex(publication.advertised_version(), r'^[0-9]+\.[0-9]+\.[0-9]+$')

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
