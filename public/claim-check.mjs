// ClaimCheck page: a private browser preview plus recorded, replayable Lean results.
// The browser never contacts a model provider and never claims a proof.  It (1) previews the
// exact arithmetic, (2) writes the Lean obligation for the user to check, and (3) shows recorded
// kernel results for published examples after re-deriving their obligation bytes locally.
import { Q, evaluate, obligationTail, parseTable, headerNames, unitFactor, describe, approx, halfUnit, REPORTED, UNIT_FAMILIES } from './claim-check-core.mjs';
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

// ------------------------------------------------------------------ data
async function setData(bytes, name) {
  if (bytes.length > MAX_BYTES) { say(`This file has ${bytes.length} bytes. The proof check is limited to ${MAX_BYTES} bytes; larger tables are not supported yet.`, true); return false; }
  const table = parseTable(bytes);
  if (!table) { say('This file is not a plain rectangular CSV. Check for a blank line, rows of different length, or a stray quotation mark. Semicolon or tab separated files must be saved as comma separated first.', true); return false; }
  const names = headerNames(table);
  if (names.some((n) => n === null)) { say('A column heading is not valid UTF-8 text.', true); return false; }
  Object.assign(state, { bytes, name, headers: names, sha: await sha256(bytes) });
  $('dataName').textContent = name;
  $('dataFacts').textContent = `${table.rows.length} data rows, ${names.length} columns. SHA-256 ${state.sha.slice(0, 16)}… identifies exactly these bytes.`;
  for (const id of ['column', 'xColumn']) {
    const s = $(id); s.replaceChildren(...names.filter((n) => n).map((n) => new Option(n, n))); s.disabled = false;
  }
  $('addFilter').disabled = false; $('filters').replaceChildren(); $('subFilters').replaceChildren();
  say(''); refresh(); return true;
}
$('dataFile').addEventListener('change', async (e) => { const f = e.target.files[0]; if (f) { state.example = null; $('recorded').hidden = true; await setData(new Uint8Array(await f.arrayBuffer()), f.name); } });

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
function refresh() {
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
  const results = c.variants.map((v) => ({ ...v, outcome: evaluate(state.bytes, v.claim, NA) }));
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
  const checks = linkChecks($('sentence').value, c.number, c.stat, first.claim, state.headers);
  const list = $('q2Checks'); list.replaceChildren();
  let allOk = true;
  for (const ch of checks) { const li = el('li', `${ch.ok ? '✓' : '✗'} ${ch.text}`); if (!ch.ok) { li.className = 'warn'; allOk = false; } list.append(li); }
  list.append(el('li', `✓ The data file is identified by its SHA-256 ${state.sha.slice(0, 16)}… No one has confirmed it is the file the authors analysed.`));
  badge($('q2Status'), allOk ? 'MECHANICAL CHECKS PASSED · MEANING UNREVIEWED' : 'A MECHANICAL CHECK FAILED', allOk ? 'neutral' : 'bad');
  const terms = interpretiveWords($('sentence').value);
  $('q3List').replaceChildren(
    el('li', 'Whether this file is the data the authors analysed, complete and unaltered.'),
    el('li', 'Whether sampling, measurement and exclusions make the statistic meaningful for the question asked.'),
    el('li', 'Whether any comparison, trend or causal reading drawn from the number is justified.'),
    ...(terms.length ? [el('li', `The sentence uses interpretive wording (${terms.join(', ')}). None of that was checked.`)] : []),
  );
  $('scope').textContent = preview === 'conditional'
    ? 'The number matches under one standard-deviation convention and not the other, and the sentence does not say which was used. No unconditional result is given.'
    : 'A match or mismatch here concerns this file and this reading only. It is not a statement about the paper until Lean has checked it and a person has confirmed the reading.';
  state.last = { c, results, checks, preview };
  $('proofText').textContent = 'The result above is a browser calculation. Lean has not checked it. Download the Lean file and run the proof checker to turn the preview into a proof or a refutation.';
  $('downloadLean').disabled = false; $('downloadDraft').disabled = false;
  $('result').hidden = false; $('result').focus();
}
$('check').addEventListener('click', runCheck);

let checkerText = null;
async function checker() {
  if (checkerText === null) { const r = await fetch('claim-check/ClaimCheck.lean'); if (!r.ok) throw new Error('checker unavailable'); checkerText = await r.text(); }
  return checkerText;
}
$('downloadLean').addEventListener('click', async () => {
  try {
    const { results } = state.last;
    download('ClaimCheck-obligation.lean', (await checker()) + obligationTail(state.bytes, results.map((r) => ({ claim: r.claim, outcome: r.outcome })), NA));
  } catch { say('The checker file could not be loaded. Reload the page and try again.', true); }
});
$('downloadDraft').addEventListener('click', () => {
  const { c, results, checks, preview } = state.last;
  download('claimcheck-browser-result.json', JSON.stringify({
    format: 'pcs-claimcheck-browser-draft-v1', authority: 'NONE: browser calculation, not a Lean result', kernel_checked: false,
    data: { name: state.name, sha256: state.sha, bytes: state.bytes.length }, sentence: $('sentence').value, printed_number: c.number,
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
}
function renderBenchmark(b) {
  if (!b) { $('benchmarkText').textContent = 'No evaluation summary is published yet.'; return; }
  $('benchmarkText').textContent = b.summary;
  const rows = $('benchmarkRows'); rows.replaceChildren();
  for (const a of b.arms) { const tr = document.createElement('tr'); [a.complete === false ? `${a.label} — incomplete: ${a.model_errors} of ${a.model_calls} model calls failed` : a.label, a.correct_verification, a.correct_refutation, a.unsupported_positive, a.unsupported_refutation, a.abstained].forEach((x) => tr.append(el('td', String(x)))); rows.append(tr); }
  $('benchmarkTable').hidden = false; $('benchmarkNotes').textContent = b.notes;
}
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
$('loadExample').addEventListener('click', async () => {
  const meta = state.catalog.examples.find((x) => x.id === $('exampleSelect').value);
  const loader = meta && EXAMPLE_LOADERS[meta.id]; if (!loader) return;
  try {
    const response = await loader(); if (!response.ok) throw new Error('unavailable');
    const ex = await response.json();
    const bytes = fromBase64(ex.data_base64);
    if (ex.id !== meta.id || await sha256(bytes) !== meta.data_sha256) throw new Error('data digest mismatch');
    if (!(await setData(bytes, ex.data_name))) return;
    state.example = ex;
    const receipts = ex.receipts;
    const rows = $('recordedRows'); rows.replaceChildren();
    for (const r of receipts) {
      const tr = document.createElement('tr');
      const v = (r.q1_mathematics?.variants || [])[0]?.predicted_outcome;
      const value = v?.defined ? Number(v.approximate_in_reported_units).toPrecision(8).replace(/\.?0+$/, '') : '';
      const cond = r.reason === 'ambiguous_convention' ? ' (conditional)' : '';
      tr.append(el('td', r.result + cond, `badge ${r.result === 'PROVED' ? 'ok' : r.result === 'REFUTED' ? 'bad' : 'neutral'}`), el('td', r.q2_correspondence?.sentence?.text || r.q2_correspondence?.quote?.text || ''), el('td', r.claim ? `${r.claim.reading} ${r.result === 'UNKNOWN' ? r.message : ''}` : r.message), el('td', value));
      rows.append(tr);
    }
    $('recordedNote').textContent = `${ex.citation} Article licence: ${ex.article_license}. Data licence: ${ex.data_license}. These rows are recorded results of the real Lean proof checker, not a calculation by this page. Readings were proposed by ${ex.proposed_by}; a proposer has no authority. A REFUTED row means this file does not give the printed number under this reading. It does not mean the paper is wrong.`;
    $('recordedSource').textContent = `Article DOI ${ex.article_doi}. Data: ${ex.data_origin}.`;
    // Re-derive the obligation bytes locally: the recorded proof is about exactly this data and these readings.
    const items = [];
    for (const r of receipts) for (const v of (r.q1_mathematics?.variants || [])) if (v.lean?.kernel_accepted) items[v.lean.index] = { r, v };
    let bound = false; let text = '';
    try {
      const tail = obligationTail(bytes, items.map(({ r, v }) => {
        const po = v.predicted_outcome; const spec = r.claim.spec;
        const dataUnit = v.stat === 'share' ? 'fraction' : (ex.column_units?.[spec.column] ?? null);
        const claim = { ...spec, stat: v.stat, scale: unitFactor(dataUnit, spec.reported_unit) };
        const outcome = po.defined ? { defined: true, verdict: po.verdict, kind: po.value_kind === 'rational' ? 'rat' : 'sqrt', sign: po.sign, value: new Q(BigInt(po.exact.numerator), BigInt(po.exact.denominator)), used: po.rows_used, missing: po.rows_skipped_as_missing } : { defined: false, reason: po.reason };
        return { claim, outcome };
      }), ex.na_tokens || NA);
      text = (await checker()) + tail;
      bound = await sha256(new TextEncoder().encode(text)) === ex.obligation_sha256;
    } catch { bound = false; }
    $('recordedBinding').textContent = bound
      ? 'This page rebuilt the Lean file from the data and the recorded readings and got exactly the recorded file (same SHA-256). The proofs are about this data and these readings. The proof itself was run earlier; download the file and run Lean to check it again.'
      : 'This page could not rebuild the recorded Lean file from the data and readings. Treat the recorded results as unconfirmed.';
    $('recordedLean').disabled = !bound;
    $('recordedLean').onclick = () => download(`${ex.id}-obligations.lean`, text);
    $('recordedReceipts').onclick = () => download(`${ex.id}-receipts.json`, JSON.stringify(receipts, null, 1), 'application/json');
    $('recordedData').onclick = () => download(ex.data_name, bytes, 'text/csv');
    $('recorded').hidden = false;
    const firstDecided = receipts.find((r) => r.result !== 'UNKNOWN' && r.q2_correspondence?.sentence);
    if (firstDecided) { $('sentence').value = firstDecided.q2_correspondence.sentence.text.trim(); readSentence(); }
    say(`Opened “${meta.title}”. The table below shows recorded Lean results. Use steps 2 to 4 to try a reading yourself.`);
  } catch { say('This example could not be opened or did not match its recorded identity.', true); }
});

loadCatalog(); refresh();
