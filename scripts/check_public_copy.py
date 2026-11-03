#!/usr/bin/env python3
"""Check authored HTML prose, without rewriting source or historical evidence.

This catches a few specific editorial regressions. It cannot determine who wrote
text or establish that real people understand it. Code, mathematical displays and
empty result placeholders are not prose.
"""
from __future__ import annotations

import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
CANNED = re.compile(
    r"\b(?:delve into|seamlessly|game[ -]changing|unlock (?:the |your )?potential|"
    r"in today['’]s (?:fast[ -]paced|rapidly evolving)|leverage the power|"
    r"a testament to|revolutionize your)\b", re.I,
)
PROSE_DASH = re.compile(r"\w\s*—\s*\w", re.UNICODE)


# The current calibration UI has a fresh browser qualification. The previous
# record and exact prior HTML remain in docs/evidence/site-clarity-v1/. Keep this
# source identity guard even though its old prose em dash has been removed.
# Full mathematical/data-source continuity is checked by verify_browser_ui_sources.
QUALIFIED_COPY = {
    'public/calibration-lab.html': 'a2b9af9d5a00477e96aa0c57251c7bb47387532a65b78f91b6b243c6290a458b',
}


class CopyReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.excluded = []
        self.problems = []
        self.placeholder_dashes = 0

    def check(self, text):
        for rule, pattern in [('prose_em_dash', PROSE_DASH), ('canned_phrase', CANNED)]:
            if pattern.search(text):
                self.problems.append({'line': self.getpos()[0], 'rule': rule,
                                      'text': text.strip()[:240]})
        self.placeholder_dashes += text.count('—') if not PROSE_DASH.search(text) else 0

    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'code', 'pre', 'svg', 'math'}:
            self.excluded.append(tag)
        if not self.excluded:
            for name, value in attrs:
                if name in {'alt', 'title', 'aria-label'} and value:
                    self.check(value)
            attrs = dict(attrs)
            if tag == 'meta' and (attrs.get('name') == 'description' or
                                  attrs.get('property', '').endswith(':description')):
                self.check(attrs.get('content', ''))

    def handle_endtag(self, tag):
        if self.excluded and self.excluded[-1] == tag:
            self.excluded.pop()

    def handle_data(self, data):
        if not self.excluded:
            self.check(data)


def review_copy(name, raw):
    reader = CopyReader()
    reader.feed(raw.decode('utf-8'))
    issues, preserved = list(reader.problems), []
    if name in QUALIFIED_COPY:
        if hashlib.sha256(raw).hexdigest() != QUALIFIED_COPY[name]:
            issues.append({'line': 1, 'rule': 'qualified_source_changed',
                           'text': 'Restore the exact source-bound page; do not rewrite its historical receipt.'})
        else:
            preserved, issues = issues, []
    return {'file': name, 'issues': issues, 'preserved_qualified_findings': preserved,
            'placeholder_dashes': reader.placeholder_dashes}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit the complete audit")
    args = parser.parse_args()
    rows = []
    for path in sorted((ROOT / 'public').rglob('*.html')):
        rows.append(review_copy(str(path.relative_to(ROOT)), path.read_bytes()))
    report = {'format': 'pcs-public-copy-audit-v1', 'html_pages': len(rows),
              'issues': sum(len(row['issues']) for row in rows),
              'preserved_qualified_findings': sum(len(row['preserved_qualified_findings']) for row in rows),
              'pages': rows,
              'human_comprehension_tested': False, 'authorship_detection': False}
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Public copy: {report['html_pages']} HTML pages, {report['issues']} issues, {report['preserved_qualified_findings']} disclosed qualified-source finding; no human comprehension claim")
        for row in rows:
            for finding in row['preserved_qualified_findings']:
                print(f"Preserved exact qualified source: {row['file']}:{finding['line']}: {finding['rule']}")
            for issue in row["issues"]:
                print(f"{row['file']}:{issue['line']}: {issue['rule']}: {issue['text']}")
    return int(bool(report['issues']))


if __name__ == '__main__':
    raise SystemExit(main())
