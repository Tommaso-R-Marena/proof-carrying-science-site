import {makeWorld, checkPrediction, witnessFor, proofFor, readWitness, MAX_WITNESS_BYTES}
  from './first-investigation-core.mjs';

const $ = id => document.getElementById(id);
let used = false, authorized = false, checked = null, understood = false, readerEpoch = 0;
const world = () => makeWorld(used, authorized);

function render() {
  // Controls stay disabled in the initial HTML until every listener is wired.
  for (const id of ['fiUsed', 'fiPermission', 'fiPrediction', 'fiReset', 'fiFile']) $(id).disabled = false;
  $('firstInvestigation').dataset.ready = 'true';
  $('fiLoadNote').hidden = true;
  $('fiUsed').textContent = 'Tool used: ' + (used ? 'yes' : 'no');
  $('fiPermission').textContent = 'Permission granted: ' + (authorized ? 'yes' : 'no');
  $('fiUsed').setAttribute('aria-pressed', String(used));
  $('fiPermission').setAttribute('aria-pressed', String(authorized));
  $('fiCheck').disabled = !$('fiPrediction').value;
  $('fiScope').disabled = !checked?.counterexample;
  $('fiUnderstand').disabled = !checked?.counterexample || !$('fiScope').value;
  $('fiWitness').disabled = !checked?.counterexample || !understood;
  $('fiProof').disabled = !checked?.counterexample || !understood;
  $('fiMeaningPanel').hidden = !checked?.counterexample;
  $('fiCarryPanel').hidden = !understood;
  $('fiNext').hidden = !understood;
  const progress = understood ? 3 : checked?.counterexample ? 2 : 1;
  for (const el of document.querySelectorAll('[data-fi-step]')) {
    const active = Number(el.dataset.fiStep) === progress;
    el.classList.toggle('current', active);
    if (active) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current');
  }
  $('fiProgressText').textContent = understood ? 'Investigation complete · local learning activity' :
    `Step ${progress} of 3 · ${progress === 1 ? 'build and predict' : 'explain what you found'}`;
}

function invalidate() {
  checked = null; understood = false;
  $('fiPrediction').value = ''; $('fiScope').value = '';
  $('fiResult').textContent = 'Facts changed. Make a prediction and check this example again.';
  $('fiResult').dataset.state = 'pending';
  $('fiIntended').textContent = 'Not checked'; $('fiProposal').textContent = 'Not checked';
  $('fiScopeFeedback').textContent = '';
  render();
}

$('fiUsed').addEventListener('click', () => { used = !used; invalidate(); });
$('fiPermission').addEventListener('click', () => { authorized = !authorized; invalidate(); });
$('fiPrediction').addEventListener('change', () => {
  checked = null; understood = false; $('fiScope').value = '';
  $('fiIntended').textContent = 'Not checked'; $('fiProposal').textContent = 'Not checked';
  $('fiResult').textContent = 'Prediction ready. Select Check this example to calculate the result.';
  $('fiResult').dataset.state = 'pending'; $('fiScopeFeedback').textContent = ''; render();
});
$('fiCheck').addEventListener('click', () => {
  if (!$('fiPrediction').value) return;
  checked = checkPrediction(world(), $('fiPrediction').value); understood = false;
  $('fiScope').value = ''; $('fiScopeFeedback').textContent = '';
  $('fiIntended').textContent = checked.left ? 'Allows this example' : 'Rejects this example';
  $('fiProposal').textContent = checked.right ? 'Allows this example' : 'Rejects this example';
  const explanation = used && !authorized ?
    'The tool was used without permission. Your intended rule rejects that; the reversed rule allows it because no permission was granted.' :
    !used && authorized ? 'Permission was granted without using the tool. Your intended rule allows that; the reversed rule rejects it.' :
    'Both rules agree here. Try a case where only one fact is yes. Agreement on one example does not show that the rules mean the same thing.';
  $('fiResult').textContent = (checked.counterexample ? 'Difference found. ' : 'No difference in this example. ') + explanation +
    (checked.prediction_correct ? ' Your prediction matched the calculation.' : ' The calculation differs from your prediction; use the two rule cards to see why.');
  $('fiResult').dataset.state = checked.counterexample ? 'found' : 'same';
  render();
});
$('fiScope').addEventListener('change', () => { understood = false; $('fiScopeFeedback').textContent = ''; render(); });
$('fiUnderstand').addEventListener('click', () => {
  if (!checked?.counterexample) return;
  understood = $('fiScope').value === 'meaning';
  $('fiScopeFeedback').textContent = understood ?
    'Exactly. You found a concrete example where the rules disagree. You can now carry these facts to another checker. This does not establish the behavior of a real AI.' :
    'Look again: you checked one fictional tool call and two statements. The evidence establishes a difference in meaning; it does not establish what a real AI will do.';
  render();
});

function download(name, raw, type) {
  const url = URL.createObjectURL(new Blob([raw], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$('fiWitness').addEventListener('click', () => {
  if (!checked?.counterexample || !understood) return;
  download('pcs-first-witness.json', JSON.stringify(witnessFor(world()), null, 2) + '\n', 'application/json');
});
$('fiProof').addEventListener('click', () => {
  if (!checked?.counterexample || !understood) return;
  const proof = proofFor(world()); download(proof.file_name, proof.lean_source, 'text/plain');
});
$('fiReset').addEventListener('click', () => {
  readerEpoch++; $('fiFile').value = '';
  $('fiReaderResult').textContent = 'No file has been checked.';
  $('fiReaderResult').dataset.state = 'pending';
  used = false; authorized = false; invalidate(); $('fiUsed').focus();
});

$('fiFile').addEventListener('change', async () => {
  const epoch = ++readerEpoch;
  $('fiReaderResult').textContent = 'No current file has been checked.';
  $('fiReaderResult').dataset.state = 'pending';
  const file = $('fiFile').files[0]; if (!file) return;
  try {
    if (file.size > MAX_WITNESS_BYTES) throw Error('Choose a witness smaller than 4 KiB.');
    const bytes = await file.arrayBuffer();
    if (epoch !== readerEpoch) return;
    const {world: w, result} = readWitness(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    $('fiReaderResult').textContent = `Checked again from the file's facts: tool used ${w.P[0] ? 'yes' : 'no'}, permission ${w.Q[0] ? 'yes' : 'no'}. ` +
      `The intended rule ${result.left ? 'allows' : 'rejects'} this example; the proposal ${result.right ? 'allows' : 'rejects'} it. Their meanings differ. ` +
      'This is a browser recheck of a finite example, not a signature check or a Lean kernel run.';
    $('fiReaderResult').dataset.state = 'found';
  } catch (error) {
    if (epoch !== readerEpoch) return;
    $('fiReaderResult').textContent = 'File not accepted: ' + error.message;
    $('fiReaderResult').dataset.state = 'error';
  }
});

function revealDeepLink() {
  document.getElementById(location.hash.slice(1))?.closest('details')?.setAttribute('open', '');
}
addEventListener('hashchange', revealDeepLink); revealDeepLink(); render();
