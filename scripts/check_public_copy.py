#!/usr/bin/env python3
"""Check authored HTML prose, without rewriting source or historical evidence.

This catches a few specific editorial regressions. It cannot determine who wrote
text or establish that real people understand it. Code, mathematical displays and
empty result placeholders are not prose.
"""
from __future__ import annotations

import argparse
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


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="Emit the complete audit")
    args = parser.parse_args()
    rows = []
    for path in sorted((ROOT / 'public').rglob('*.html')):
        reader = CopyReader()
        reader.feed(path.read_text(encoding='utf-8'))
        rows.append({'file': str(path.relative_to(ROOT)), 'issues': reader.problems,
                     'placeholder_dashes': reader.placeholder_dashes})
    report = {'format': 'pcs-public-copy-audit-v1', 'html_pages': len(rows),
              'issues': sum(len(row['issues']) for row in rows), 'pages': rows,
              'human_comprehension_tested': False, 'authorship_detection': False}
    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Public copy: {report['html_pages']} HTML pages, {report['issues']} issues; no human comprehension claim")
        for row in rows:
            for issue in row["issues"]:
                print(f"{row['file']}:{issue['line']}: {issue['rule']}: {issue['text']}")
    return int(bool(report['issues']))


if __name__ == '__main__':
    raise SystemExit(main())
