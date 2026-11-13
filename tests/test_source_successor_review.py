"""Executable real-Git negative controls for the untrusted source review dossier."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from source_successor_review import review,validate_dossier

def git(repo,*args):
    proc=subprocess.run(["git","-C",str(repo),*args],check=True,
                        stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    return proc.stdout.strip()

class SourceDossierTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="pcs-review-fixture-")
        self.root=Path(self.temp.name)
        git(self.root,"init","-q","-b","main")
        git(self.root,"config","user.name","PCS Fixture")
        git(self.root,"config","user.email","fixture@pcs.invalid")
        (self.root/"src").mkdir()
        (self.root/"public").mkdir()
        (self.root/"scripts").mkdir()
        (self.root/"src"/"worker.js").write_text("export const version=1;\n")
        (self.root/"public"/"_headers").write_text("X-Content-Type-Options: nosniff\n")
        (self.root/"scripts"/"check_reconciled_prs.py").write_text("REQUIRED=True\n")
        git(self.root,"add",".")
        git(self.root,"commit","-q","-m","protected baseline")
        self.base=git(self.root,"rev-parse","HEAD")

    def tearDown(self):
        self.temp.cleanup()

    def commit(self,path,contents):
        target=self.root/path
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(contents)
        git(self.root,"add","--",path)
        git(self.root,"commit","-q","-m","candidate change")
        return git(self.root,"rev-parse","HEAD")

    def test_exact_git_blob_and_sha256_of_candidate(self):
        candidate=self.commit("src/worker.js","export const version=2;\n")
        dossier=review(self.root,self.base,candidate)
        self.assertTrue(validate_dossier(dossier))
        self.assertEqual(dossier["baseline_commit"],self.base)
        self.assertEqual(dossier["candidate_commit"],candidate)
        self.assertEqual(dossier["change_count"],1)
        row=dossier["changed_files"][0]
        self.assertEqual(row["path"],"src/worker.js")
        self.assertEqual(row["review_class"],"IMPLEMENTATION_REVIEW")
        self.assertEqual(row["candidate_sha256"],
                         hashlib.sha256(b"export const version=2;\n").hexdigest())
        self.assertFalse(dossier["qualified"])
        self.assertFalse(dossier["owner_approved"])
        self.assertFalse(dossier["is_release_authorization"])

    def test_public_and_policy_paths_get_protected_review_flags(self):
        (self.root/"public"/"_headers").write_text("Cache-Control: max-age=60\n")
        (self.root/"scripts"/"check_reconciled_prs.py").write_text("REQUIRED=False\n")
        git(self.root,"add",".")
        git(self.root,"commit","-q","-m","unreviewed policy rewrite")
        d=review(self.root,self.base,git(self.root,"rev-parse","HEAD"))
        self.assertEqual({x["review_class"] for x in d["changed_files"]},{"PROTECTED_REVIEW"})
        self.assertFalse(d["qualified"])

    def test_unqualified_extra_file_is_not_silently_ignored(self):
        candidate=self.commit("src/new_authority.js","export default true\n")
        d=review(self.root,self.base,candidate)
        self.assertEqual(d["change_count"],1)
        self.assertEqual(d["changed_files"][0]["operation"],"added")
        self.assertEqual(d["changed_files"][0]["path"],"src/new_authority.js")

    def test_mode_change_and_symlink_are_flagged_for_review(self):
        target=self.root/"src"/"worker.js"
        target.chmod(0o755)
        git(self.root,"add","src/worker.js")
        git(self.root,"commit","-q","-m","change execute bit")
        d=review(self.root,self.base,git(self.root,"rev-parse","HEAD"))
        self.assertEqual(d["changed_files"][0]["operation"],"mode_changed")
        self.assertEqual(d["changed_files"][0]["review_class"],"IMPLEMENTATION_REVIEW")
        link=self.root/"src"/"alias.js"
        link.symlink_to("worker.js")
        git(self.root,"add","src/alias.js")
        git(self.root,"commit","-q","-m","add symlink")
        d=review(self.root,self.base,git(self.root,"rev-parse","HEAD"))
        found=next(x for x in d["changed_files"] if x["path"]=="src/alias.js")
        self.assertEqual(found["candidate_mode"],"120000")
        self.assertEqual(found["review_class"],"EXCEPTION_REVIEW")

    def test_commit_identity_must_be_full_sha_not_branch_or_prefix(self):
        candidate=self.commit("src/worker.js","NEW\n")
        for invalid in ("HEAD",candidate[:12],"main",candidate.upper(),"../main"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    review(self.root,self.base,invalid)

    def test_unrelated_commit_fails_ancestry(self):
        git(self.root,"checkout","--orphan","unrelated")
        git(self.root,"rm","-q","-r","--cached",".")
        (self.root/"new.txt").write_text("forged\n")
        git(self.root,"add","new.txt")
        git(self.root,"commit","-q","-m","unrelated unrelated")
        candidate=git(self.root,"rev-parse","HEAD")
        with self.assertRaisesRegex(ValueError,"descend"):
            review(self.root,self.base,candidate)

    def test_dossier_cannot_be_rewritten_into_approval(self):
        candidate=self.commit("src/worker.js","NEW\n")
        doc=review(self.root,self.base,candidate)
        for key in ("qualified","owner_approved","is_release_authorization"):
            variant={**doc,key:True}
            with self.assertRaises(ValueError):
                validate_dossier(variant)

    def test_mutated_digest_and_changed_census_rejected(self):
        candidate=self.commit("src/worker.js","NEW\n")
        doc=review(self.root,self.base,candidate)
        bad={**doc,"change_count":0}
        with self.assertRaises(ValueError):validate_dossier(bad)
        bad={**doc,"dossier_sha256":"0"*64}
        with self.assertRaises(ValueError):validate_dossier(bad)

if __name__=="__main__":
    unittest.main()
