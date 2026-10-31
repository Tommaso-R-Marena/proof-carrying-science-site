"""Negative protocol tests never stand in for real Lean authorization tests."""
import base64
import hashlib
import http.client
import json
from pathlib import Path
import sys
import threading
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'desktop'))
from file_check import parse_csv,analyze,extracted_csv,canonical,strict_json,LocalChecker


class CSVTests(unittest.TestCase):
    def test_exact_identifiers_and_physical_lines(self):
        a=parse_csv(b'id,note\r\n"a,b","one\r\ntwo"\r\n001,x\r\n')
        b=parse_csv(b'other\n001\n"a,b"\n')
        self.assertEqual(a['lines'],[2,4])
        result=analyze(a,b,[0,0]);self.assertEqual(result['summary']['shared_ids'],2)
        self.assertEqual(extracted_csv(a,0),b'id\n612c62\n303031\n')

    def test_malformed_files_fail_closed(self):
        for raw in [b'',b'id\n',b'id,id\na,b',b'id\nx,y',b'id\n"x',b'id\n"x"z',b'id\nx"y',b'id\ra',b'id\na\0',b'id\n"a\rb"',b'\xff']:
            with self.subTest(raw=raw),self.assertRaises((ValueError,UnicodeError)):
                analyze(parse_csv(raw),parse_csv(b'id\na'),[0,0])

    def test_blank_bool_and_long_identifier_refused(self):
        for raw,column in [(b'id\n" "\n',0),(b'id\na\n',True),(('id\n'+'é'*129).encode(),0)]:
            with self.subTest(raw=raw),self.assertRaises(ValueError):
                analyze(parse_csv(raw),parse_csv(b'id\na'),[column,0])

    def test_duplicate_json_fields_nonfinite_and_noncanonical_requests_refused(self):
        for raw in [b'{"x":1,"x":1}',b'{"x":NaN}',b'{ "x":1}']:
            with self.subTest(raw=raw),self.assertRaises(ValueError):strict_json(raw)
        self.assertEqual(strict_json(canonical({'columns':[0,0]})),{'columns':[0,0]})

    def test_no_requester_selected_checker_interface(self):
        self.assertNotIn('verifier',LocalChecker.verify.__code__.co_varnames)
        # Interface shape rejection executes before touching a real checker.
        checker=object.__new__(LocalChecker)
        for request in [{},{'files':[],'columns':[],'verifier':'/attacker'}, {'files':[],'columns':[]}]:
            with self.assertRaises(ValueError):checker.verify(request)


if __name__=='__main__':unittest.main()
