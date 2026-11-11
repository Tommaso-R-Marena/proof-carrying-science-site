// ClaimCheck browser core: exact rational recomputation of a reported statistic from CSV bytes.
//
// This is a third, independent implementation of the semantics fixed by
// research/claimcheck_v1/formal/ClaimCheck.lean in the PCS core repository (the other two are the
// Lean checker itself and the Python oracle).  It is NOT a proof and has no authority: its only
// jobs are to preview a result and to write the Lean obligation that the real kernel then checks.
// Everything is BigInt arithmetic; no floating point takes part in a verdict.


// ---------------------------------------------------------------- rationals
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
export class Q {
  constructor(n, d = 1n) {
    if (d === 0n) throw new RangeError('zero denominator');
    if (d < 0n) { n = -n; d = -d; }
    const g = gcd(n, d) || 1n;
    this.n = n / g; this.d = d / g;
  }
  static of(x) { return x instanceof Q ? x : new Q(BigInt(x)); }
  add(o) { return new Q(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o) { return new Q(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o) { return new Q(this.n * o.n, this.d * o.d); }
  div(o) { if (o.n === 0n) throw new RangeError('division by zero'); return new Q(this.n * o.d, this.d * o.n); }
  cmp(o) { const l = this.n * o.d, r = o.n * this.d; return l < r ? -1 : l > r ? 1 : 0; }
  eq(o) { return this.n === o.n && this.d === o.d; }
  sign() { return this.n > 0n ? 1 : this.n < 0n ? -1 : 0; }
  toString() { return this.d === 1n ? `${this.n}` : `${this.n}/${this.d}`; }
  // decimal rendering for display only
  toDecimal(digits = 10) {
    const neg = this.n < 0n; const n = neg ? -this.n : this.n;
    const scaled = (n * 10n ** BigInt(digits) * 2n + this.d) / (this.d * 2n);
    const s = scaled.toString().padStart(digits + 1, '0');
    const out = `${s.slice(0, -digits)}.${s.slice(-digits)}`.replace(/\.?0+$/, '');
    return (neg && out !== '0' ? '-' : '') + out;
  }
}
const ZERO = new Q(0n), ONE = new Q(1n);
const sum = (xs) => xs.reduce((a, b) => a.add(b), ZERO);

// ---------------------------------------------------------------- decimals
const CELL = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
export const REPORTED = /^[+-]?(?:\d{1,18}(?:\.\d{0,12})?|\.\d{1,12})(?:[eE][+-]?\d{1,3})?$/;
function decimalParts(text) {
  const m = /^([+-]?)([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]+))?$/.exec(text);
  const exp = m[4] === undefined ? 0n : BigInt(m[4]);
  return { neg: m[1] === '-', digits: (m[2] || '') + (m[3] || ''), frac: BigInt((m[3] || '').length), exp };
}
export function parseDecimal(text) {
  if (!CELL.test(text)) return null;
  const p = decimalParts(text);
  if (p.exp > 400n || p.exp < -400n) return null;
  const mant = BigInt(p.digits) * (p.neg ? -1n : 1n);
  const shift = p.exp - p.frac;
  return shift >= 0n ? new Q(mant * 10n ** shift) : new Q(mant, 10n ** (-shift));
}
export function halfUnit(text) {
  const p = decimalParts(text);
  const shift = p.exp - p.frac;
  return (shift >= 0n ? new Q(10n ** shift) : new Q(1n, 10n ** (-shift))).div(new Q(2n));
}

// ---------------------------------------------------------------- strict CSV (same language as csvGo after normEol)
export function parseCsv(bytes) {
  let b = bytes;
  if (b.length >= 3 && b[0] === 239 && b[1] === 187 && b[2] === 191) b = b.subarray(3);
  const norm = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 13) { norm.push(10); if (b[i + 1] === 10) i++; } else norm.push(b[i]);
  }
  const rows = []; let row = []; let fld = []; let mode = 0;
  const endRow = () => { row.push(Uint8Array.from(fld)); rows.push(row); row = []; fld = []; };
  for (const x of norm) {
    if (mode === 0) {
      if (x === 34) mode = 2;
      else if (x === 44) row.push(new Uint8Array(0));
      else if (x === 10) { if (!row.length) return null; endRow(); }
      else { fld.push(x); mode = 1; }
    } else if (mode === 1) {
      if (x === 44) { row.push(Uint8Array.from(fld)); fld = []; mode = 0; }
      else if (x === 10) { endRow(); mode = 0; }
      else if (x === 34) return null;
      else fld.push(x);
    } else if (mode === 2) {
      if (x === 34) mode = 3; else fld.push(x);
    } else {
      if (x === 34) { fld.push(34); mode = 2; }
      else if (x === 44) { row.push(Uint8Array.from(fld)); fld = []; mode = 0; }
      else if (x === 10) { endRow(); mode = 0; }
      else return null;
    }
  }
  if (mode === 0) { if (row.length) endRow(); }
  else if (mode === 2) return null;
  else endRow();
  return rows;
}
const dec = new TextDecoder('utf-8', { fatal: true });
const enc = new TextEncoder();
const trimBytes = (u) => { let a = 0, z = u.length; while (a < z && (u[a] === 32 || u[a] === 9)) a++; while (z > a && (u[z - 1] === 32 || u[z - 1] === 9)) z--; return u.subarray(a, z); };
const same = (u, v) => u.length === v.length && u.every((x, i) => x === v[i]);
const ascii = (u) => { for (const x of u) if (x > 127) return null; return String.fromCharCode(...u); };

export function parseTable(bytes) {
  const rows = parseCsv(bytes);
  if (!rows || !rows.length) return null;
  const header = rows[0];
  if (rows.slice(1).some((r) => r.length !== header.length)) return null;
  return { header, rows: rows.slice(1) };
}
export function headerNames(table) {
  return table.header.map((h) => { try { return dec.decode(trimBytes(h)); } catch { return null; } });
}

// ---------------------------------------------------------------- claims
// claim = {stat, reported, column?, x_column?, filter:[cond], sub_filter:[cond], scale: Q}
// cond  = {kind:'text_eq'|'text_ne'|'num', column, value, cmp?}
class Undefined extends Error { constructor(reason) { super(reason); this.reason = reason; } }
function colIndex(table, name) {
  const want = enc.encode(name); const hits = [];
  table.header.forEach((h, i) => { if (same(trimBytes(h), want)) hits.push(i); });
  if (hits.length !== 1) throw new Undefined('columnNotFound');
  return hits[0];
}
const CMP = { eq: (c) => c === 0, ne: (c) => c !== 0, lt: (c) => c < 0, le: (c) => c <= 0, gt: (c) => c > 0, ge: (c) => c >= 0 };
function select(table, na, conds, rows) {
  const idx = conds.map((c) => colIndex(table, c.column));
  const out = []; let bad = false;
  for (const row of rows) {
    let keep = true;
    for (let k = 0; k < conds.length && keep; k++) {
      const c = conds[k]; const cell = trimBytes(row[idx[k]]);
      if (c.kind === 'text_eq') keep = same(cell, enc.encode(c.value));
      else if (c.kind === 'text_ne') keep = !same(cell, enc.encode(c.value));
      else if (na.some((t) => same(cell, t))) keep = false;
      else {
        const text = ascii(cell); const x = text === null ? null : parseDecimal(text);
        if (x === null) { bad = true; keep = false; } else keep = CMP[c.cmp](x.cmp(parseDecimal(c.value)));
      }
    }
    if (keep) out.push(row);
  }
  if (bad) throw new Undefined('nonNumericCell');
  return out;
}
function numeric(na, i, rows) {
  const xs = []; let missing = 0;
  for (const row of rows) {
    const cell = trimBytes(row[i]);
    if (na.some((t) => same(cell, t))) { missing++; continue; }
    const text = ascii(cell); const x = text === null ? null : parseDecimal(text);
    if (x === null) throw new Undefined('nonNumericCell');
    xs.push(x);
  }
  return { xs, missing };
}
const mean = (xs) => sum(xs).div(new Q(BigInt(xs.length)));
const ss = (xs) => { const m = mean(xs); return sum(xs.map((x) => x.sub(m).mul(x.sub(m)))); };

function statistic(table, na, rows, claim) {
  const n = (k) => new Q(BigInt(k));
  const { stat } = claim;
  if (stat === 'count') {
    if (claim.column == null) return { kind: 'rat', value: n(rows.length), used: rows.length, missing: 0 };
    const i = colIndex(table, claim.column);
    const present = rows.filter((r) => !na.some((t) => same(trimBytes(r[i]), t))).length;
    return { kind: 'rat', value: n(present), used: present, missing: rows.length - present };
  }
  if (stat === 'share') {
    if (!rows.length) throw new Undefined('emptySelection');
    const hit = select(table, na, claim.sub_filter, rows);
    return { kind: 'rat', value: n(hit.length).div(n(rows.length)), used: rows.length, missing: 0 };
  }
  if (stat === 'pearson' || stat === 'ols_slope' || stat === 'ols_intercept') {
    if (claim.column == null) throw new Undefined('missingColumn');
    const ix = colIndex(table, claim.x_column), iy = colIndex(table, claim.column);
    const pairs = []; let missing = 0;
    for (const row of rows) {
      const cx = trimBytes(row[ix]), cy = trimBytes(row[iy]);
      if (na.some((t) => same(cx, t)) || na.some((t) => same(cy, t))) { missing++; continue; }
      const tx = ascii(cx), ty = ascii(cy);
      const x = tx === null ? null : parseDecimal(tx), y = ty === null ? null : parseDecimal(ty);
      if (x === null || y === null) throw new Undefined('nonNumericCell');
      pairs.push([x, y]);
    }
    if (pairs.length < 2) throw new Undefined('emptySelection');
    const xs = pairs.map((p) => p[0]), ys = pairs.map((p) => p[1]);
    const mx = mean(xs), my = mean(ys), sxx = ss(xs), syy = ss(ys);
    const sxy = sum(pairs.map(([x, y]) => x.sub(mx).mul(y.sub(my))));
    if (sxx.n === 0n) throw new Undefined('degenerate');
    if (stat === 'pearson') {
      if (syy.n === 0n) throw new Undefined('degenerate');
      return { kind: 'sqrt', sign: sxy.sign(), value: sxy.mul(sxy).div(sxx.mul(syy)), used: pairs.length, missing };
    }
    if (stat === 'ols_slope') return { kind: 'rat', value: sxy.div(sxx), used: pairs.length, missing };
    return { kind: 'rat', value: my.sub(sxy.div(sxx).mul(mx)), used: pairs.length, missing };
  }
  if (claim.column == null) throw new Undefined('missingColumn');
  const { xs, missing } = numeric(na, colIndex(table, claim.column), rows);
  if (!xs.length) throw new Undefined('emptySelection');
  const k = xs.length; const R = (value) => ({ kind: 'rat', value, used: k, missing });
  const S = (value) => ({ kind: 'sqrt', sign: 1, value, used: k, missing });
  if (stat === 'sum') return R(sum(xs));
  if (stat === 'mean') return R(mean(xs));
  if (stat === 'median') {
    const s = [...xs].sort((a, b) => a.cmp(b));
    return R(k % 2 ? s[(k - 1) / 2] : s[k / 2 - 1].add(s[k / 2]).div(new Q(2n)));
  }
  if (stat === 'min') return R(xs.reduce((a, b) => (b.cmp(a) < 0 ? b : a)));
  if (stat === 'max') return R(xs.reduce((a, b) => (b.cmp(a) > 0 ? b : a)));
  if (stat === 'sd_pop') return S(ss(xs).div(n(k)));
  if (k < 2) throw new Undefined('emptySelection');
  if (stat === 'var_sample') return R(ss(xs).div(n(k - 1)));
  if (stat === 'sd_sample') return S(ss(xs).div(n(k - 1)));
  if (stat === 'sem') return S(ss(xs).div(n(k - 1)).div(n(k)));
  throw new Undefined('missingColumn');
}

export function sqrtInInterval(lo, hi, s, q) {
  if (s === 0 || q.n === 0n) return lo.cmp(ZERO) <= 0 && hi.cmp(ZERO) >= 0;
  if (s > 0) return (lo.cmp(ZERO) <= 0 || lo.mul(lo).cmp(q) <= 0) && (hi.cmp(ZERO) >= 0 && q.cmp(hi.mul(hi)) <= 0);
  return (lo.cmp(ZERO) <= 0 && q.cmp(lo.mul(lo)) <= 0) && (hi.cmp(ZERO) >= 0 || hi.mul(hi).cmp(q) <= 0);
}

// Predict PCS.ClaimCheck.run for these bytes and this claim.
export function evaluate(bytes, claim, naTokens = ['', 'NA']) {
  const table = parseTable(bytes);
  if (!table) return { defined: false, reason: 'csvMalformed' };
  if (!REPORTED.test(claim.reported)) return { defined: false, reason: 'badReportedLiteral' };
  const scale = claim.scale || ONE;
  if (scale.sign() <= 0) return { defined: false, reason: 'badScale' };
  const na = naTokens.map((t) => enc.encode(t));
  let st;
  try {
    const rows = select(table, na, claim.filter || [], table.rows);
    st = statistic(table, na, rows, claim);
  } catch (e) {
    if (e instanceof Undefined) return { defined: false, reason: e.reason };
    throw e;
  }
  const r = parseDecimal(claim.reported), h = halfUnit(claim.reported);
  const lo = r.sub(h), hi = r.add(h);
  const ok = st.kind === 'rat'
    ? lo.cmp(st.value.mul(scale)) <= 0 && st.value.mul(scale).cmp(hi) <= 0
    : sqrtInInterval(lo.div(scale), hi.div(scale), st.sign, st.value);
  return { defined: true, verdict: ok ? 'consistent' : 'inconsistent', ...st };
}

// ---------------------------------------------------------------- units (fixed table; never user- or model-supplied factors)
const F = (a, b = 1n) => new Q(BigInt(a), BigInt(b));
export const UNIT_FAMILIES = [
  { kg: F(1000), g: F(1), mg: F(1, 1000), 'µg': F(1, 1000000), ug: F(1, 1000000) },
  { km: F(1000), m: F(1), cm: F(1, 100), mm: F(1, 1000), 'µm': F(1, 1000000), um: F(1, 1000000) },
  { d: F(86400), h: F(3600), min: F(60), s: F(1), ms: F(1, 1000) },
  { L: F(1), l: F(1), mL: F(1, 1000), ml: F(1, 1000), 'µL': F(1, 1000000), ul: F(1, 1000000) },
  { fraction: F(1), '%': F(1, 100) },
];
export function unitFactor(dataUnit, reportedUnit) {
  if (reportedUnit == null || reportedUnit === dataUnit) return ONE;
  if (dataUnit == null) return null;
  for (const fam of UNIT_FAMILIES) if (dataUnit in fam && reportedUnit in fam) return fam[dataUnit].div(fam[reportedUnit]);
  return null;
}

// ---------------------------------------------------------------- Lean obligation text (same bytes as the Python generator)
const SAFE = /^[A-Za-z0-9 _.,:;()\[\]%\/+\-#=<>&*!?@^|~]*$/;
const lb = (t) => (SAFE.test(t) ? `b "${t}"` : `[${[...enc.encode(t)].join(', ')}]`);
const rat = (q) => `((${q.n} : Rat) / ${q.d})`;
const STAT = { count: '.count', sum: '.sum', mean: '.mean', median: '.median', min: '.min', max: '.max', var_sample: '.varSample', sd_sample: '.sdSample', sd_pop: '.sdPop', sem: '.sem' };
const cond = (c) => (c.kind === 'text_eq' ? `.textEq (${lb(c.column)}) (${lb(c.value)})`
  : c.kind === 'text_ne' ? `.textNe (${lb(c.column)}) (${lb(c.value)})`
    : `.num (${lb(c.column)}) .${c.cmp} ${rat(parseDecimal(c.value))}`);
const conds = (cs) => `[${(cs || []).map(cond).join(', ')}]`;
export function leanClaim(claim, naTokens) {
  const st = claim.stat === 'share' ? `.share ${conds(claim.sub_filter)}`
    : claim.stat === 'pearson' ? `.pearson (${lb(claim.x_column)})`
      : claim.stat === 'ols_slope' ? `.olsSlope (${lb(claim.x_column)})`
        : claim.stat === 'ols_intercept' ? `.olsIntercept (${lb(claim.x_column)})` : STAT[claim.stat];
  const column = claim.column == null ? 'none' : `some (${lb(claim.column)})`;
  return `{ column := ${column},\n    filter := ${conds(claim.filter)},\n    stat := ${st},\n    naTokens := [${naTokens.map(lb).join(', ')}],\n    scale := ${rat(claim.scale || ONE)},\n    reported := ${lb(claim.reported)} }`;
}
export function leanOutcome(o) {
  if (!o.defined) return `.undefined .${o.reason}`;
  const v = o.kind === 'rat' ? `(.rat ${rat(o.value)})` : `(.sqrt (${o.sign} : Int) ${rat(o.value)})`;
  return `.checked .${o.verdict} ${v} ${o.used} ${o.missing}`;
}
const hex = (bytes) => { let s = ''; for (const x of bytes) s += x.toString(16).padStart(2, '0'); return s || '0'; };
// items: [{claim, outcome}] about one data file; the result is appended to the checker text.
export function obligationTail(bytes, items, naTokens = ['', 'NA']) {
  let out = '\n-- ===== generated obligations (data numeral, claims, expected outcomes) =====\nopen PCS.ClaimCheck\n\n';
  out += `def pcs_src : Source := ⟨0x${hex(bytes)}, ${bytes.length}⟩\n\n`;
  items.forEach((it, i) => { out += `def pcs_c${i} : Claim :=\n  ${leanClaim(it.claim, naTokens)}\n\n`; });
  out += `theorem pcs_batch : runAll pcs_src [${items.map((_, i) => `pcs_c${i}`).join(', ')}] =\n    [${items.map((it) => leanOutcome(it.outcome)).join(',\n    ')}] := by decide +kernel\n\n`;
  items.forEach((it, i) => { out += `theorem pcs_claim_${i} : run pcs_src pcs_c${i} = ${leanOutcome(it.outcome)} :=\n  run_of_runAll pcs_batch ${i} rfl rfl\n#print axioms pcs_claim_${i}\n\n`; });
  return out;
}

// ---------------------------------------------------------------- plain-language reading
const WORDS = { count: 'number of rows', share: 'fraction of rows', sum: 'sum', mean: 'arithmetic mean', median: 'median', min: 'minimum', max: 'maximum', var_sample: 'sample variance (denominator n − 1)', sd_sample: 'standard deviation (denominator n − 1)', sd_pop: 'standard deviation (denominator n)', sem: 'standard error of the mean (sample SD / √n)', pearson: 'Pearson correlation coefficient', ols_slope: 'ordinary-least-squares slope', ols_intercept: 'ordinary-least-squares intercept' };
const condWords = (c) => (c.kind === 'text_eq' ? `${c.column} is “${c.value}”` : c.kind === 'text_ne' ? `${c.column} is not “${c.value}”` : `${c.column} ${{ eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥' }[c.cmp]} ${c.value}`);
export function describe(claim) {
  const where = (claim.filter || []).map(condWords).join(' and ');
  const rows = where ? `rows where ${where}` : 'all rows';
  const unit = claim.reported_unit ? ` ${claim.reported_unit}` : '';
  let subject;
  if (claim.stat === 'count') subject = `number of ${rows}${claim.column ? ` with a value in ${claim.column}` : ''}`;
  else if (claim.stat === 'share') subject = `fraction of ${rows} where ${(claim.sub_filter || []).map(condWords).join(' and ')}`;
  else if (['pearson', 'ols_slope', 'ols_intercept'].includes(claim.stat)) subject = `${WORDS[claim.stat]} of ${claim.column} against ${claim.x_column} over ${rows}`;
  else subject = `${WORDS[claim.stat]} of ${claim.column} over ${rows}`;
  return `The ${subject} equals ${claim.reported}${unit} when rounded to the printed precision.`;
}
export function approx(o) {
  if (!o.defined) return null;
  if (o.kind === 'rat') return o.value.toDecimal(10);
  const x = Math.sqrt(Number(o.value.n) / Number(o.value.d)) * o.sign;
  return Number.isFinite(x) ? x.toPrecision(10).replace(/\.?0+$/, '') : '≈ (too large to display)';
}
