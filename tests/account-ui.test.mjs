import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/account.js", import.meta.url), "utf8");

test("account request action lists use multi-element selectors", () => {
  assert.match(
    source,
    /\$\$\("\[data-my-git-checks\]",target\)\.forEach/,
    "GitHub CI refresh controls must bind through the querySelectorAll helper"
  );
  assert.match(
    source,
    /\$\$\("\[data-submit-work\]",target\)\.forEach/,
    "work submission controls must bind through the querySelectorAll helper"
  );
});

test("account request renderer never calls forEach on a single-element selector", () => {
  const unsafe = source.match(/(^|[^$])\$\([^\n;]*\)\.forEach/g) || [];
  assert.deepEqual(
    unsafe,
    [],
    "Calling .forEach on $() can dereference null when no matching control exists"
  );
});
