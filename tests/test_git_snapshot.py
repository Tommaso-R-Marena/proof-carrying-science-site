"""Real Git-object snapshots must preserve bytes across checkout/archive policies."""
import hashlib
import importlib.util
import io
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('snapshot', Path(__file__).resolve().parents[1] / 'scripts/git_snapshot.py')
snapshot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot)


class GitSnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'core.autocrlf', 'false')
        (self.repo / 'public').mkdir()
        (self.repo / 'desktop').mkdir()
        (self.repo / 'desktop/VERSION').write_bytes(b'2.0.0\n')
        (self.repo / 'public/value.txt').write_bytes(b'line one\nline two\n')
        (self.repo / 'public/binary.bin').write_bytes(b'\0\n\r\n\xff')
        self.git('add', 'desktop', 'public')
        self.commit()

    def git(self, *args, **kwargs):
        return subprocess.check_output(['git', *args], cwd=self.repo, stderr=subprocess.PIPE, **kwargs)

    def commit(self):
        self.git('-c', 'user.name=PCS snapshot test', '-c', 'user.email=pcs@example.invalid', 'commit', '-q', '-m', 'Snapshot test')
        self.sha = self.git('rev-parse', 'HEAD').decode().strip()

    def materialize(self, name='snapshot', roots=None):
        out = self.base / name
        hashes = snapshot.materialize(self.repo, self.sha, roots or ['desktop', 'public'], out)
        return out, hashes

    def test_exact_text_binary_and_digests(self):
        out, hashes = self.materialize()
        for name in ['desktop/VERSION', 'public/value.txt', 'public/binary.bin']:
            raw = self.git('cat-file', 'blob', self.sha+':'+name)
            self.assertEqual((out / name).read_bytes(), raw)
            self.assertEqual(hashes[name], hashlib.sha256(raw).hexdigest())

    def test_reproduce_archive_eol_bug_then_preserve_raw_bytes(self):
        self.git('config', 'core.autocrlf', 'true')
        archive = self.git('archive', self.sha, 'desktop')
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            self.assertEqual(tar.extractfile('desktop/VERSION').read(), b'2.0.0\r\n')
        out, _ = self.materialize()
        self.assertEqual((out / 'desktop/VERSION').read_bytes(), b'2.0.0\n')

    def test_export_substitution_and_eol_attributes_do_not_change_blobs(self):
        (self.repo / '.gitattributes').write_bytes(b'public/value.txt export-subst\npublic/forced.txt eol=crlf\n')
        (self.repo / 'public/value.txt').write_bytes(b'$Format:%H$\n')
        (self.repo / 'public/forced.txt').write_bytes(b'fixed\n')
        self.git('add', '.gitattributes', 'public')
        self.commit()
        out, _ = self.materialize()
        self.assertEqual((out / 'public/value.txt').read_bytes(), b'$Format:%H$\n')
        self.assertEqual((out / 'public/forced.txt').read_bytes(), b'fixed\n')

    def test_changed_and_untracked_working_files_are_not_source(self):
        (self.repo / 'desktop/VERSION').write_bytes(b'forged\r\n')
        (self.repo / 'public/extra.txt').write_bytes(b'untracked')
        out, _ = self.materialize()
        self.assertEqual((out / 'desktop/VERSION').read_bytes(), b'2.0.0\n')
        self.assertFalse((out / 'public/extra.txt').exists())

    def test_source_links_and_submodules_reject(self):
        oid = self.git('hash-object', '-w', '--stdin', input=b'../outside').decode().strip()
        self.git('update-index', '--add', '--cacheinfo', f'120000,{oid},public/link')
        self.commit()
        with self.assertRaises(ValueError):
            self.materialize('link-snapshot')
        self.git('update-index', '--force-remove', 'public/link')
        self.git('update-index', '--add', '--cacheinfo', f'160000,{self.sha},public/submodule')
        self.commit()
        with self.assertRaises(ValueError):
            self.materialize('submodule-snapshot')

    def test_destination_is_never_overwritten(self):
        out = self.base / 'snapshot'
        out.mkdir()
        (out / 'owner-file').write_bytes(b'preserve')
        with self.assertRaises(FileExistsError):
            self.materialize()
        self.assertEqual((out / 'owner-file').read_bytes(), b'preserve')

    def test_missing_or_unsafe_roots_and_nonexact_commit_reject(self):
        for roots in [['missing'], ['../public'], ['public', 'public'], ['--all']]:
            with self.assertRaises(ValueError):
                self.materialize(roots=roots)
        for commit in ['HEAD', '--all', self.sha+'\n']:
            with self.assertRaises(ValueError):
                snapshot.materialize(self.repo, commit, ['public'], self.base / 'bad')

    def test_windows_drive_paths_reject_on_every_host(self):
        oid = self.git('hash-object', '-w', '--stdin', input=b'value').decode().strip()
        # Write Git tree objects directly; no platform filesystem path is opened.
        tree = self.git('hash-object', '-w', '-t', 'tree', '--literally', '--stdin',
                        input=b'100644 C:outside\0'+bytes.fromhex(oid)).decode().strip()
        root = self.git('hash-object', '-w', '-t', 'tree', '--literally', '--stdin',
                        input=b'40000 public\0'+bytes.fromhex(tree)).decode().strip()
        commit = self.git('-c', 'user.name=PCS snapshot test', '-c', 'user.email=pcs@example.invalid',
                          'commit-tree', root, '-m', 'Unsafe path test').decode().strip()
        with self.assertRaises(ValueError):
            snapshot.materialize(self.repo, commit, ['public'], self.base / 'unsafe')



if __name__ == '__main__':
    unittest.main()
