// ClaimCheck page: a private browser preview plus recorded, replayable Lean results.
// The browser never contacts a model provider and never claims a proof.  It (1) previews the
// exact arithmetic, (2) writes the Lean obligation for the user to check, and (3) shows recorded
// kernel results for published examples after re-deriving their obligation bytes locally.
import { Q, evaluate, proofFile, parseTable, headerNames, unitFactor, describe, approx, halfUnit, REPORTED, UNIT_FAMILIES, kernelRunRefusal, kernelRunFacts } from './claim-check-core.mjs';
import { locateNumbers, linkChecks, interpretiveWords } from './claim-check-text.mjs';
import { EXAMPLE_LOADERS } from './claim-check-examples.mjs';

const $ = (id) => document.getElementById(id);
const MAX_BYTES = 64000;
const NA = ['', 'NA'];
const state = { bytes: null, name: '', sha: '', headers: [], numbers: [], last: null, example: null, catalog: null };

const say = (text, bad = false) => { const s = $('status'); s.textContent = text; s.className = bad ? 'notice error' : text ? 'notice' : ''; };
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
async function sha256(bytes) { return hex(await crypto.subtle.digest('SHA-256', bytes)); }
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// A file name as displayed: control, format (including direction-changing) and separator characters replaced.
const shownName = (name) => String(name).replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '\uFFFD');
class Refusal extends Error {}

// ------------------------------------------------------------------ outdated results
// A result belongs to the inputs at the moment Check was pressed.  Any change to the data, the example,
// the sentence, the number, the statistic, a column, a condition or a unit clears it, removes an opened
// kernel-run report and disables the downloads; downloads and report checks use only the snapshot.
function clearResult() {
  state.last = null;
  $('result').hidden = true;
  for (const id of ['reading', 'q1Status', 'q1Text', 'q1Assumptions', 'q2Status', 'q2Checks', 'q3List', 'scope']) $(id).replaceChildren();
  $('downloadLean').disabled = true; $('downloadDraft').disabled = true;
  const box = $('kernelRunStatus'); box.hidden = true; box.replaceChildren(); $('kernelRun').value = '';
}

// ------------------------------------------------------------------ data
function unloadData() {
  Object.assign(state, { bytes: null, name: '', sha: '', headers: [] });
  $('dataName').textContent = 'No file chosen';
  $('dataFacts').textContent = 'Comma-separated, one header row, up to 64 KB. Empty cells and NA count as missing values.';
  for (const id of ['column', 'xColumn']) { const s = $(id); s.replaceChildren(); s.disabled = true; }
  $('addFilter').disabled = true; $('filters').replaceChildren(); $('subFilters').replaceChildren();
  refresh();
}
async function setData(bytes, name) {
  clearResult();
  const refuse = (text) => { unloadData(); say(text, true); return false; };
  if (bytes.length > MAX_BYTES) return refuse(`This file has ${bytes.length} bytes. The proof check is limited to ${MAX_BYTES} bytes; larger tables are not supported yet.`);
  const table = parseTable(bytes);
  if (!table) return refuse('This file is not a plain rectangular CSV. Check for a blank line, rows of different length, or a stray quotation mark. Semicolon or tab separated files must be saved as comma separated first.');
  const names = headerNames(table);
  if (names.some((n) => n === null)) return refuse('A column heading is not valid UTF-8 text.');
  Object.assign(state, { bytes, name, headers: names, sha: await sha256(bytes) });
  $('dataName').textContent = shownName(name);
  $('dataFacts').textContent = `${table.rows.length} data rows, ${names.length} columns. SHA-256 ${state.sha.slice(0, 16)}… identifies exactly these bytes.`;
  for (const id of ['column', 'xColumn']) {
    const s = $(id); s.replaceChildren(...names.filter((n) => n).map((n) => new Option(n, n))); s.disabled = false;
  }
  $('addFilter').disabled = false; $('filters').replaceChildren(); $('subFilters').replaceChildren();
  say(''); refresh(); return true;
}
$('dataFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { clearResult(); state.example = null; $('recorded').hidden = true; await setData(new Uint8Array(await f.arrayBuffer()), f.name); } });

// ------------------------------------------------------------------ sentence and number
function readSentence() {
  state.numbers = locateNumbers($('sentence').value);
  const s = $('numberSelect'); const keep = s.value;
  s.replaceChildren(...(state.numbers.length ? state.numbers.map((n, i) => new Option(`${n.printed}   (…${$('sentence').value.slice(Math.max(0, n.start - 18), n.end + 12).trim()}…)`, String(i))) : [new Option('No number found in the sentence', '')]));
  s.disabled = !state.numbers.length; if (keep && s.querySelector(`option[value="${keep}"]`)) s.value = keep;
  refresh();
}
$('sentence').addEventListener('input', readSentence);

// ------------------------------------------------------------------ reading
function conditionRow(box) {
  const row = el('div', null, 'cond');
  const col = document.createElement('select'); col.append(...state.headers.filter((n) => n).map((n) => new Option(n, n))); col.setAttribute('aria-label', 'Column');
  const op = document.createElement('select'); op.setAttribute('aria-label', 'Comparison');
  op.append(new Option('is exactly', 'text_eq'), new Option('is not', 'text_ne'), new Option('= (number)', 'eq'), new Option('≠ (number)', 'ne'), new Option('<', 'lt'), new Option('≤', 'le'), new Option('>', 'gt'), new Option('≥', 'ge'));
  const val = document.createElement('input'); val.type = 'text'; val.maxLength = 120; val.setAttribute('aria-label', 'Value');
  const del = el('button', 'Remove'); del.type = 'button'; del.addEventListener('click', () => { row.remove(); refresh(); });
  row.append(col, op, val, del); box.append(row); [col, op, val].forEach((x) => x.addEventListener('input', refresh));
  return { col, op, val };
}
const readConds = (box) => [...box.querySelectorAll('.cond')].map((r) => {
  const [col, op, val] = r.querySelectorAll('select,input');
  return op.value.startsWith('text') ? { kind: op.value, column: col.value, value: val.value.trim() } : { kind: 'num', column: col.value, cmp: op.value, value: val.value.trim() };
});
$('addFilter').addEventListener('click', () => { conditionRow($('filters')); refresh(); });
$('addSub').addEventListener('click', () => { conditionRow($('subFilters')); refresh(); });
for (const fam of UNIT_FAMILIES) for (const u of Object.keys(fam)) { if (u === 'fraction') continue; $('dataUnit').append(new Option(u, u)); $('reportedUnit').append(new Option(u, u)); }

function currentClaims() {
  const n = state.numbers[Number($('numberSelect').value)];
  if (!state.bytes || !n) return null;
  const stat = $('stat').value;
  const base = { reported: n.literal, filter: readConds($('filters')), sub_filter: stat === 'share' ? readConds($('subFilters')) : [],
    column: stat === 'count' || stat === 'share' ? null : $('column').value || null,
    x_column: ['pearson', 'ols_slope', 'ols_intercept'].includes(stat) ? $('xColumn').value : null,
    reported_unit: $('reportedUnit').value || null };
  const dataUnit = stat === 'share' ? 'fraction' : ($('dataUnit').value || null);
  const scale = unitFactor(dataUnit, base.reported_unit);
  const variants = stat === 'sd' ? [['sd_sample', 'the standard deviation uses denominator n − 1'], ['sd_pop', 'the standard deviation uses denominator n']] : [[stat, null]];
  return { number: n, stat, scale, dataUnit, variants: variants.map(([s, assumption]) => ({ assumption, claim: { ...base, stat: s, scale } })) };
}
function problems(c) {
  const out = [];
  if (!c) return ['Choose a file, paste a sentence and pick a number.'];
  if (!REPORTED.test(c.number.literal)) out.push('The printed number is not a plain decimal.');
  if (c.scale === null) out.push('These two units cannot be converted exactly into each other.');
  for (const cond of [...c.variants[0].claim.filter, ...c.variants[0].claim.sub_filter]) {
    if (cond.kind === 'num' && !REPORTED.test(cond.value)) out.push(`“${cond.value}” is not a number.`);
    if (cond.kind !== 'num' && /[\u0000-\u001f]/.test(cond.value)) out.push('A condition value contains a control character.');
  }
  if (c.stat === 'share' && !c.variants[0].claim.sub_filter.length) out.push('Add at least one condition that defines the counted rows.');
  if (['pearson', 'ols_slope', 'ols_intercept'].includes(c.stat) && c.variants[0].claim.column === c.variants[0].claim.x_column) out.push('Choose two different columns.');
  return out;
}
// Every change to the inputs ends here, so every change clears the outdated result.
function refresh() {
  clearResult();
  const stat = $('stat').value;
  $('columnBox').hidden = stat === 'count' || stat === 'share';
  $('xColumnBox').hidden = !['pearson', 'ols_slope', 'ols_intercept'].includes(stat);
  $('subBox').hidden = stat !== 'share';
  const p = problems(currentClaims());
  $('check').disabled = p.length > 0; $('readyHint').textContent = p[0] || 'Ready. The check runs on this device.';
}
['stat', 'column', 'xColumn', 'numberSelect', 'dataUnit', 'reportedUnit'].forEach((id) => $(id).addEventListener('input', refresh));

// ------------------------------------------------------------------ check
const UNDEFINED = {
  csvMalformed: 'The file is not a plain rectangular CSV.', columnNotFound: 'A column named in the reading is missing from the header, or appears more than once.',
  nonNumericCell: 'A cell needed for the calculation is neither a number nor a missing value (empty or NA).', emptySelection: 'The selected rows hold too few usable values for this statistic.',
  degenerate: 'The statistic divides by a variance that is exactly zero on the selected rows.', badReportedLiteral: 'The printed number is not a plain decimal.',
  badScale: 'The unit factor is not positive.', missingColumn: 'This statistic needs a column.',
};
function badge(node, text, kind) { node.textContent = text; node.className = `badge ${kind}`; }
function runCheck() {
  const c = currentClaims(); if (!c || problems(c).length) return;
  clearResult();
  // The snapshot: this result, the downloads and any report check use only these bytes, digest and text.
  const snap = { c, bytes: state.bytes.slice(), sha: state.sha, name: state.name, headers: state.headers, sentence: $('sentence').value };
  const results = c.variants.map((v) => ({ ...v, outcome: evaluate(snap.bytes, v.claim, NA) }));
  const first = results[0];
  const shown = { ...first.claim, stat: c.stat === 'sd' ? 'sd_sample' : c.stat };
  $('reading').textContent = `Reading that is checked: ${describe(shown).replace('standard deviation (denominator n − 1)', c.stat === 'sd' ? 'standard deviation' : 'standard deviation (denominator n − 1)')}`;
  const verdicts = results.map((r) => (r.outcome.defined ? r.outcome.verdict : 'undefined'));
  const q1 = $('q1Text'); q1.replaceChildren();
  let preview;
  if (verdicts.every((v) => v === 'consistent')) preview = 'match';
  else if (verdicts.every((v) => v === 'inconsistent')) preview = 'mismatch';
  else if (verdicts.includes('undefined')) preview = 'undefined';
  else preview = 'conditional';
  const words = { match: ['PREVIEW: THE NUMBER MATCHES', 'ok'], mismatch: ['PREVIEW: THE NUMBER DOES NOT MATCH', 'bad'], undefined: ['CANNOT BE COMPUTED', 'neutral'], conditional: ['PREVIEW: DEPENDS ON A CONVENTION', 'neutral'] }[preview];
  badge($('q1Status'), words[0], words[1]);
  for (const r of results) {
    const o = r.outcome;
    const line = o.defined
      ? `${r.assumption ? `If ${r.assumption}: ` : ''}exact value ${approx(o)}${c.scale && !c.scale.eq(new Q(1n)) ? ` in file units (printed value is ${c.scale} times that)` : ''}, from ${o.used} rows${o.missing ? `, ${o.missing} skipped as missing` : ''}. The printed ${c.number.literal} ${o.verdict === 'consistent' ? 'is' : 'is not'} this value rounded to the printed digits.`
      : UNDEFINED[o.reason];
    q1.append(el('span', line), document.createElement('br'));
  }
  q1.append(el('strong', 'Status until Lean checks it: UNKNOWN.'));
  const half = halfUnit(c.number.literal);
  $('q1Assumptions').replaceChildren(
    el('li', `Rounding: ${c.number.literal} stands for any exact value within ±${half} of it.`),
    el('li', 'Missing values: empty cells and NA are excluded. No other cell is skipped.'),
    ...(c.scale && !c.scale.eq(new Q(1n)) ? [el('li', `Units: printed value = ${c.scale} × value in file units (${c.dataUnit} to ${first.claim.reported_unit}).`)] : []),
  );
  // question 2: mechanical link checks (hints for the person; they gate nothing here)
  const checks = linkChecks(snap.sentence, c.number, c.stat, first.claim, snap.headers);
  const list = $('q2Checks'); list.replaceChildren();
  let allOk = true;
  for (const ch of checks) { const li = el('li', `${ch.ok ? '✓' : '✗'} ${ch.text}`); if (!ch.ok) { li.className = 'warn'; allOk = false; } list.append(li); }
  list.append(el('li', `✓ The data file is identified by its SHA-256 ${snap.sha.slice(0, 16)}… No one has confirmed it is the file the authors analysed.`));
  badge($('q2Status'), allOk ? 'MECHANICAL CHECKS PASSED · MEANING UNREVIEWED' : 'A MECHANICAL CHECK FAILED', allOk ? 'neutral' : 'bad');
  const terms = interpretiveWords(snap.sentence);
  $('q3List').replaceChildren(
    el('li', 'Whether this file is the data the authors analysed, complete and unaltered.'),
    el('li', 'Whether sampling, measurement and exclusions make the statistic meaningful for the question asked.'),
    el('li', 'Whether any comparison, trend or causal reading drawn from the number is justified.'),
    ...(terms.length ? [el('li', `The sentence uses interpretive wording (${terms.join(', ')}). None of that was checked.`)] : []),
  );
  $('scope').textContent = preview === 'conditional'
    ? 'The number matches under one standard-deviation convention and not the other, and the sentence does not say which was used. No unconditional result is given.'
    : 'A match or mismatch here concerns this file and this reading only. You chose this reading, so under the v1.1 rules the answer about the paper is “a person must review the reading” until the full check has run (the command-line tool also examines every other reading the sentence allows). It is not a statement about the paper.';
  Object.assign(snap, { results, checks, preview });
  snap.proof = buildProof(snap); snap.proof.catch(() => {});
  state.last = snap;
  $('proofText').textContent = `The result above is a browser calculation about the data file “${shownName(snap.name)}” as it was when you pressed Check. Lean has not checked it. Download the Lean file and run the proof checker to turn the preview into a proof or a refutation.`;
  $('downloadLean').disabled = false; $('downloadDraft').disabled = false;
  $('result').hidden = false; $('result').focus();
}
$('check').addEventListener('click', runCheck);

// The checker is used only if its bytes have the reviewed digest pinned by the catalog; otherwise no
// proof file is built at all.  The recorded examples are rebuilt from the same verified bytes.
const CHECKER_REFUSALS = {
  catalog: 'The catalog with the reviewed checker digest could not be loaded, so this page builds no proof file. Reload the page and try again.',
  unavailable: 'The checker file could not be loaded, so this page builds no proof file. Reload the page and try again.',
  digest: 'The checker file this page loaded does not have the reviewed checker digest pinned by the catalog, so this page builds no proof file. Reload the page; if this persists, do not use proof files from this site.',
};
let reviewedCheckerBytes = null;
async function reviewedChecker() {
  if (reviewedCheckerBytes) return reviewedCheckerBytes;
  await catalogReady;
  const pinned = state.catalog?.checker_sha256;
  if (!/^[0-9a-f]{64}$/.test(String(pinned))) throw new Refusal(CHECKER_REFUSALS.catalog);
  let raw;
  try { const r = await fetch('claim-check/ClaimCheck.lean'); if (!r.ok) throw new Error(); raw = new Uint8Array(await r.arrayBuffer()); } catch { throw new Refusal(CHECKER_REFUSALS.unavailable); }
  if (await sha256(raw) !== pinned) throw new Refusal(CHECKER_REFUSALS.digest);
  reviewedCheckerBytes = raw;
  return raw;
}
// The proof file of one snapshot, built once: its download and every report check use these bytes.
async function buildProof(snap) {
  const checkerBytes = await reviewedChecker();
  if (await sha256(snap.bytes) !== snap.sha) throw new Refusal('The data changed while the proof file was being built. Check the number again.');
  const bytes = proofFile(checkerBytes, snap.bytes, snap.results.map((r) => ({ claim: r.claim, outcome: r.outcome })), NA);
  return { bytes, sha256: await sha256(bytes) };
}
$('downloadLean').addEventListener('click', async () => {
  const snap = state.last; if (!snap) return;
  try {
    const { bytes } = await snap.proof;
    if (state.last === snap) download('ClaimCheck-obligation.lean', bytes);
  } catch (e) { if (state.last === snap) say(e instanceof Refusal ? e.message : 'The proof file could not be built. Reload the page and try again.', true); }
});
// A kernel-run file comes from the runner on the user's own computer.  This page cannot verify that
// Lean ran.  It only checks that the file is about exactly the proof file built when Check was pressed,
// this data and the reviewed checker, with every field a genuine report always gets right
// (kernelRunRefusal in claim-check-core.mjs).  Nothing written in the report is displayed: what is
// shown is worded by this page from its own results; only a Lean version line and a time of an exact
// form are repeated (kernelRunFacts).
function kernelWords(o) {
  if (!o.defined) return 'the statistic is undefined for this file under this typed statement';
  return o.verdict === 'consistent' ? 'the printed value MATCHES the statistic of this file under this typed statement'
    : 'the printed value DOES NOT MATCH the statistic of this file under this typed statement';
}
const aboutData = (snap) => `Checked here: the data file “${shownName(snap.name)}” (SHA-256 ${snap.sha.slice(0, 16)}…) as it was when you pressed Check.`;
$('kernelRun').addEventListener('change', async (event) => {
  const snap = state.last; const box = $('kernelRunStatus');
  const br = () => document.createElement('br');
  const show = (nodes) => { if (state.last !== snap) return; box.replaceChildren(...nodes); box.hidden = false; };
  const refuse = (text) => show([el('strong', 'Not shown. '), el('span', text), ...(snap ? [br(), el('span', aboutData(snap))] : [])]);
  try {
    const file = event.target.files[0]; if (!file || !snap) return refuse('Check a number first, then open the kernel-run file made for it.');
    if (file.size > 200000) return refuse('That file is too large to be a kernel-run file.');
    const run = JSON.parse(await file.text());
    const proof = await snap.proof.catch(() => null);
    const why = kernelRunRefusal(run, { proofSha256: proof?.sha256, dataSha256: snap.sha,
      checkerSha256: state.catalog?.checker_sha256, outcomes: snap.results.map((r) => r.outcome) });
    if (why) return refuse(why);
    const { lean, utc } = kernelRunFacts(run);
    const nodes = []; const line = (text, tag = 'span') => nodes.push(el(tag, text), br());
    line('REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE', 'strong');
    line(aboutData(snap));
    snap.results.forEach((r, i) => line(`pcs_claim_${i}${r.assumption ? ` (if ${r.assumption})` : ''}: Lean kernel accepted, as reported: ${kernelWords(r.outcome)}.`));
    line('What such a run verifies: the supplied mathematical obligation, that is, this typed statement about the reviewed checker holds for the exact bytes of this file.');
    line('What no kernel run verifies: that the obligation faithfully represents the sentence in the paper, that the printed number is the paper’s number, or that the file is the authors’ data. This is a result about the file and the typed statement, not about the paper.');
    if (lean || utc) line(`Reported run: ${[lean, utc && `${utc} (UTC)`].filter(Boolean).join(', ')}.`);
    nodes.push(el('span', 'This page checked only that the report is about exactly the proof file it built when you pressed Check, this data and the reviewed checker, and that its fields are those of a genuine report of the current runner; it cannot verify that Lean ran. To convince someone else, give them the proof file and the runner: the runner refuses a file whose generated part is not in the canonical form of the generator’s grammar, and Lean then checks the proof. That grammar also admits claim settings this page never writes; the runner’s report lists the settings of each claim and flags those.'));
    show(nodes);
  } catch { refuse('The file could not be read as a kernel-run file.'); }
});
$('downloadDraft').addEventListener('click', () => {
  const snap = state.last; if (!snap) return;
  const { c, results, checks, preview } = snap;
  download('claimcheck-browser-result.json', JSON.stringify({
    format: 'pcs-claimcheck-browser-draft-v1', authority: 'NONE: browser calculation, not a Lean result', kernel_checked: false,
    data: { name: snap.name, sha256: snap.sha, bytes: snap.bytes.length }, sentence: snap.sentence, printed_number: c.number,
    reading: results.map((r) => ({ assumption: r.assumption, claim: { ...r.claim, scale: String(r.claim.scale) }, description: describe(r.claim),
      browser_outcome: r.outcome.defined ? { verdict: r.outcome.verdict, exact_value: String(r.outcome.value), kind: r.outcome.kind, sign: r.outcome.sign ?? null, rows_used: r.outcome.used, rows_missing: r.outcome.missing } : { undefined: r.outcome.reason } })),
    browser_preview: preview, question_1_status: 'UNKNOWN until the Lean file is checked', question_2: { checks, semantic_reading: 'UNREVIEWED' }, question_3: 'NOT_ASSESSED',
  }, null, 1), 'application/json');
});

// ------------------------------------------------------------------ recorded published examples
async function loadCatalog() {
  try {
    const r = await fetch('claim-check/examples.json'); if (!r.ok) throw new Error();
    state.catalog = await r.json();
    for (const ex of state.catalog.examples) $('exampleSelect').append(new Option(ex.title, ex.id));
    $('exampleSelect').addEventListener('input', () => { $('loadExample').disabled = !$('exampleSelect').value; });
    $('exampleNote').textContent = `${state.catalog.examples.length} published articles with open data. Results were recorded with ${state.catalog.toolchain}; nothing is re-proved when you open one.`;
    renderBenchmark(state.catalog.benchmark);
  } catch { $('exampleNote').textContent = 'Recorded examples are unavailable right now. You can still check your own file.'; $('benchmarkText').textContent = 'The evaluation summary could not be loaded.'; }
  showRunnerDigest(state.catalog?.v1_1?.kernel_runner?.sha256);
}
// The runner's SHA-256 from the catalog, next to its download link: someone who receives a runner from
// somebody else can compare it before running it.
function showRunnerDigest(digest) {
  const p = $('runnerDigest');
  if (!/^[0-9a-f]{64}$/.test(String(digest))) { p.textContent = 'The runner’s published SHA-256 could not be loaded.'; return; }
  p.replaceChildren(el('span', 'SHA-256 of the runner, as published in this site’s catalog: '), el('code', digest),
    el('span', '. If you received the runner from someone else, compare its SHA-256 with this one before you run it (for example sha256sum claimcheck_kernel_runner.py, or shasum -a 256 on macOS).'));
}
function renderBenchmark(b) {
  if (!b) { $('benchmarkText').textContent = 'No evaluation summary is published yet.'; return; }
  $('benchmarkText').textContent = b.summary;
  const rows = $('benchmarkRows'); rows.replaceChildren();
  for (const a of b.arms) { const tr = document.createElement('tr'); [(a.complete === false ? `${a.label} — incomplete: ${a.model_errors} of ${a.model_calls} model calls failed` : a.label) + (a.document_copies ? ` · ${a.document_copies} of ${a.document_copies_total} copies` : ''), a.correct_verification, a.correct_refutation, a.unsupported_positive, a.unsupported_refutation, a.abstained].forEach((x) => tr.append(el('td', String(x)))); rows.append(tr); }
  $('benchmarkTable').hidden = false; $('benchmarkNotes').textContent = b.notes;
}
const OUTWARD = { CONFIRMATION: ['NUMBER REPRODUCED', 'ok'], DISCREPANCY_FOR_REVIEW: ['DISCREPANCY FOR A PERSON TO REVIEW', 'bad'], REQUIRE_HUMAN_REVIEW: ['A PERSON MUST REVIEW THE READING', 'neutral'], UNKNOWN: ['UNKNOWN', 'neutral'] };
const MATH = { MATCH_PROVED: 'Lean proved: the file gives the printed number under this statement.', MISMATCH_PROVED: 'Lean proved: the file does not give the printed number under this statement.', CONDITIONAL_ON_CONVENTION: 'Lean proved a match under one standard-deviation convention and a mismatch under the other.', UNDEFINED_PROVED: 'Lean proved: the statistic is undefined for this file.', NOT_ESTABLISHED: 'No Lean result.' };
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
$('loadExample').addEventListener('click', async () => {
  const meta = state.catalog.examples.find((x) => x.id === $('exampleSelect').value);
  const loader = meta && EXAMPLE_LOADERS[meta.id]; if (!loader) return;
  clearResult();
  try {
    const response = await loader(); if (!response.ok) throw new Error('unavailable');
    const ex = await response.json();
    const bytes = fromBase64(ex.data_base64);
    if (ex.id !== meta.id || await sha256(bytes) !== meta.data_sha256) throw new Error('data digest mismatch');
    if (!(await setData(bytes, ex.data_name))) return;
    state.example = ex;
    const receipts = ex.receipts;
    const rows = $('recordedRows'); rows.replaceChildren();
    const decided = new Map((ex.v1_1?.decisions || []).map((d) => [d.claim_id, d]));
    for (const r of receipts) {
      const tr = document.createElement('tr');
      const v = (r.q1_mathematics?.variants || [])[0]?.predicted_outcome;
      const value = v?.defined ? Number(v.approximate_in_reported_units).toPrecision(8).replace(/\.?0+$/, '') : '';
      const d = decided.get(r.claim_id);
      const outward = OUTWARD[d?.verdict] || OUTWARD.UNKNOWN;
      const first = el('td', outward[0], `badge ${outward[1]}`);
      const why = (d?.reasons || [])[0] || (d?.findings || []).find((f) => !f.passed)?.detail;
      const cell = document.createElement('td'); cell.append(first); if (why && d.verdict !== 'CONFIRMATION') cell.append(el('p', why, 'small'));
      if (d?.supported_by?.length) cell.append(el('p', `Supported by another number in the sentence: ${d.supported_by.join(', ')}.`, 'small'));
      const math = MATH[d?.mathematical_status] || MATH.NOT_ESTABLISHED;
      tr.append(cell, el('td', math), el('td', r.q2_correspondence?.sentence?.text || r.q2_correspondence?.quote?.text || ''), el('td', r.claim ? r.claim.reading : r.message), el('td', value));
      rows.append(tr);
    }
    $('recordedNote').textContent = `${ex.citation} Article licence: ${ex.article_license}. Data licence: ${ex.data_license}. These rows are recorded results of the real Lean proof checker, not a calculation by this page. Readings were proposed by ${ex.proposed_by}; a proposer has no authority. The first column applies the v1.1 reading rules to those recorded results; it is a mechanical judgement, not a person's. “A person must review the reading” keeps the arithmetic result and says nothing about the paper. A mismatch means this file does not give the printed number under this reading. It does not mean the paper is wrong.${ex.selection_note ? ' ' + ex.selection_note : ''}`;
    $('recordedSource').textContent = `Article DOI ${ex.article_doi}. Data: ${ex.data_origin}.`;
    // Re-derive the obligation bytes locally: the recorded proof is about exactly this data and these readings.
    const items = [];
    for (const r of receipts) for (const v of (r.q1_mathematics?.variants || [])) if (v.lean?.kernel_accepted) items[v.lean.index] = { r, v };
    let bound = false; let file = null;
    try {
      const recorded = items.map(({ r, v }) => {
        const po = v.predicted_outcome; const spec = r.claim.spec;
        const dataUnit = v.stat === 'share' ? 'fraction' : (ex.column_units?.[spec.column] ?? null);
        const claim = { ...spec, stat: v.stat, scale: unitFactor(dataUnit, spec.reported_unit) };
        const outcome = po.defined ? { defined: true, verdict: po.verdict, kind: po.value_kind === 'rational' ? 'rat' : 'sqrt', sign: po.sign, value: new Q(BigInt(po.exact.numerator), BigInt(po.exact.denominator)), used: po.rows_used, missing: po.rows_skipped_as_missing } : { defined: false, reason: po.reason };
        return { claim, outcome };
      });
      file = proofFile(await reviewedChecker(), bytes, recorded, ex.na_tokens || NA);
      bound = await sha256(file) === ex.obligation_sha256;
    } catch { bound = false; }
    $('recordedBinding').textContent = bound
      ? 'This page rebuilt the Lean file from the data and the recorded readings and got exactly the recorded file (same SHA-256). The proofs are about this data and these readings. The proof itself was run earlier; download the file and run Lean to check it again.'
      : 'This page could not rebuild the recorded Lean file from the data and readings. Treat the recorded results as unconfirmed.';
    $('recordedLean').disabled = !bound;
    $('recordedLean').onclick = () => download(`${ex.id}-obligations.lean`, file);
    $('recordedReceipts').onclick = () => download(`${ex.id}-receipts.json`, JSON.stringify(receipts, null, 1), 'application/json');
    $('recordedData').onclick = () => download(ex.data_name, bytes, 'text/csv');
    $('recorded').hidden = false;
    const firstDecided = receipts.find((r) => r.result !== 'UNKNOWN' && r.q2_correspondence?.sentence);
    if (firstDecided) { $('sentence').value = firstDecided.q2_correspondence.sentence.text.trim(); readSentence(); }
    say(`Opened “${meta.title}”. The table below shows recorded Lean results. Use steps 2 to 4 to try a reading yourself.`);
  } catch { say('This example could not be opened or did not match its recorded identity.', true); }
});

const catalogReady = loadCatalog(); refresh();
