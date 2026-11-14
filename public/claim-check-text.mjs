// Sentence-level helpers for the ClaimCheck page.  These are deterministic text checks that help a
// person see whether a reading is at least mentioned by the sentence.  They prove nothing.
const NUMBER = /(?<![0-9A-Za-z.,])[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?(?![0-9])|(?<![0-9A-Za-z.])(?:[0-9]+(?:\.[0-9]+)?)(?![0-9]|\.[0-9])/g;

// Printed numbers as maximal tokens.  "3,750" is read as 3750; a minus sign counts only when it is
// not a range dash ("10-20").
export function locateNumbers(text) {
  const out = [];
  for (const m of text.matchAll(NUMBER)) {
    let start = m.index; let printed = m[0];
    const plain = /^[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?$/.test(printed) ? printed.replaceAll(',', '') : printed;
    const before = text[start - 1], before2 = text[start - 2];
    const minus = start > 0 && (before === '-' || before === '−') && !(start > 1 && /[0-9A-Za-z)\]]/.test(before2));
    if (minus) { start -= 1; printed = text.slice(start, m.index + m[0].length); }
    out.push({ start, end: m.index + m[0].length, printed, literal: (minus ? '-' : '') + plain });
  }
  return out;
}

const RANGE = String.raw`[0-9]\s?[–—-]\s?[0-9]|\b(?:rang(?:e|es|ed|ing)|between|minimum|maximum|min\.?|max\.?|smallest|largest|lowest|highest|shortest|longest|up to|at least|at most)\b`;
const CUES = {
  mean: [String.raw`\b(?:means?|averag(?:e|es|ed|ing))\b`, 'i'], median: [String.raw`\bmedians?\b`, 'i'],
  sum: [String.raw`\b(?:total(?:s|led|ling)?|sum(?:s|med)?|altogether|combined|overall)\b`, 'i'], min: [RANGE, 'i'], max: [RANGE, 'i'],
  sd: [String.raw`±|\+\/-|\bSDs?\b|\bs\.d\.|\bstandard deviations?\b`, ''], var_sample: [String.raw`\bvariances?\b`, 'i'],
  sem: [String.raw`±|\+\/-|\bSEM?s?\b|\bs\.e\.(?:m\.)?|\bstandard errors?\b`, ''],
  pearson: [String.raw`\bcorrelat\w*|\bPearson\b|\br\s?=|\bρ`, 'i'], ols_slope: [String.raw`\bslopes?\b|\bregress\w*|\bper\b|\by\s?=`, 'i'],
  ols_intercept: [String.raw`\bintercepts?\b|\bregress\w*|\by\s?=`, 'i'],
};
const UNIT_AFTER = /^\s{0,2}(%|percent\b|kg\b|mg\b|µg\b|ug\b|g\b|km\b|cm\b|mm\b|µm\b|um\b|m\b|ms\b|min\b|h\b|s\b|d\b|mL\b|ml\b|µL\b|ul\b|L\b|l\b)/;

function aliases(name) {
  const words = name.replace(/[_\-.]+/g, ' ').trim();
  const stripped = words.replace(/\s+(mm|cm|m|g|kg|mg|pct|percent|years?|yrs?|days?|s|sec|min)$/i, '');
  return [...new Set([name, words, stripped].filter((a) => a && a.length >= 2))];
}
const mentions = (sentence, phrases) => phrases.find((a) => new RegExp(`(?<![A-Za-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![0-9])`, 'i').test(sentence)) || null;

// Each check: {ok, text}.  They mirror the deterministic gates of the reference pipeline, with the
// column name itself as the only accepted wording (the reference pipeline also accepts aliases
// declared by the dataset's manifest).
export function linkChecks(sentence, number, stat, claim) {
  const out = [{ ok: true, text: `The number ${number.printed} is printed in the sentence you pasted.` }];
  const unit = UNIT_AFTER.exec(sentence.slice(number.end, number.end + 12));
  const printed = unit ? (unit[1] === 'percent' ? '%' : unit[1]) : null;
  if (claim.reported_unit && printed !== claim.reported_unit) out.push({ ok: false, text: `You said the number is in ${claim.reported_unit}, but that unit is not printed right after it.` });
  else if (stat === 'share' && printed === '%' && claim.reported_unit !== '%') out.push({ ok: false, text: 'The sentence prints a percentage. Choose % as the printed unit.' });
  else out.push({ ok: true, text: printed ? `The unit printed after the number (${printed}) agrees with your reading.` : 'No unit is printed right after the number.' });
  for (const [label, col] of [['column', claim.column], ['second column', claim.x_column]]) {
    if (!col) continue;
    const hit = mentions(sentence, aliases(col));
    out.push(hit ? { ok: true, text: `The sentence names the ${label} “${col}” (as “${hit}”).` } : { ok: false, text: `The sentence does not contain the words of the ${label} name “${col}”. Check that you chose the right column.` });
  }
  for (const c of [...(claim.filter || []), ...(claim.sub_filter || [])]) {
    const hit = mentions(sentence, [c.value]);
    out.push(hit ? { ok: true, text: `The sentence mentions “${c.value}”.` } : { ok: false, text: `The sentence does not mention “${c.value}”, which your reading uses to select rows.` });
  }
  const cue = CUES[stat];
  if (cue) {
    const m = new RegExp(cue[0], cue[1]).exec(sentence);
    out.push(m ? { ok: true, text: `The sentence names the statistic (“${m[0]}”).` } : { ok: false, text: 'The sentence has no wording that names this statistic, such as mean, median, SD or range.' });
  }
  return out;
}

const INTERPRETIVE = /\b(suggest\w*|indicat\w*|demonstrat\w*|caus\w*|due to|because|therefore|thus|hence|impl(?:y|ies|ied)|significan\w*|confirm\w*|prov(?:e|es|ed|ing)|support\w*|effect\w*|leads? to|result(?:s|ed)? in|predict\w*|associated with|driven by|explain\w*)\b/gi;
export const interpretiveWords = (sentence) => [...new Set([...sentence.matchAll(INTERPRETIVE)].map((m) => m[0].toLowerCase()))].sort();
