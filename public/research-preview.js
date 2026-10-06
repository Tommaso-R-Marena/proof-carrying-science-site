import {evaluateTrace, evaluateModel, examples} from "./research-preview-engine.mjs";
const byId = id => document.getElementById(id);
const editor = byId("previewInput");
const selector = byId("previewMode");
const answer = byId("previewResult");
const summary = byId("previewSummary");
const verdict = byId("previewVerdict");
const checked = byId("previewChecked");
const boundary = byId("previewBoundary");
const rows = byId("previewRows");
const download = byId("previewDownload");
let lastResult = null;
const clone = value => JSON.parse(JSON.stringify(value));
const names = {trace:"trace_pass",model:"model_pass"};
const format = obj => JSON.stringify(obj, null, 2);
function resetResult() {
  lastResult = null;
  answer.hidden = true;
  download.disabled = true;
  byId("previewError").hidden = true;
}
function loadFixture(key) {
  editor.value = format(clone(examples[key]));
  resetResult();
}
selector.addEventListener("change", () => {
  const mode = selector.value;
  if (!Object.hasOwn(names, mode)) return;
  loadFixture(names[mode]);
  byId("previewTraceExplain").hidden = mode !== "trace";
  byId("previewModelExplain").hidden = mode !== "model";
});
byId("previewValid").addEventListener("click", () => loadFixture(selector.value === "trace" ? "trace_pass" : "model_pass"));
byId("previewInvalid").addEventListener("click", () => loadFixture(selector.value === "trace" ? "trace_fail" : "model_fail"));
editor.addEventListener("input", resetResult);
byId("previewRun").addEventListener("click", () => {
  resetResult();
  try {
    if (editor.value.length > 16000) throw new Error("Input is too large; use 16,000 characters or fewer.");
    const supplied = JSON.parse(editor.value);
    const result = selector.value === "trace" ? evaluateTrace(supplied) : evaluateModel(supplied);
    lastResult = {format:"pcs-browser-research-preview-v1",source:"in-browser-math-only",signed:false,lean_checked:false,independently_replayed:false, result};
    verdict.textContent = result.verdict === "PASS" ? "LOCAL CHECK PASSED" : "LOCAL CHECK FAILED";
    verdict.className = "preview-verdict " + (result.verdict === "PASS" ? "passed" : "failed");
    summary.textContent = result.conclusion;
    checked.textContent = result.checked;
    boundary.textContent = result.limits;
    rows.replaceChildren();
    for (const entry of result.steps) {
      const item = document.createElement("li");
      if (result.kind === "trace") {
        item.textContent = "Step " + entry.step + ": action " + entry.action + ", risk +" + entry.increment + ", cumulative risk " + entry.cumulative_risk + " — " + (entry.passed ? "OK" : "VIOLATION");
      } else {
        item.textContent = "t=" + entry.time_h + " h: supplied " + entry.observed.toPrecision(7) + ", model " + entry.predicted.toPrecision(7) + " mg/L — " + (entry.passed ? "OK" : "MISMATCH");
      }
      rows.appendChild(item);
    }
    answer.hidden = false;
    download.disabled = false;
    answer.scrollIntoView({behavior: "smooth", block: "nearest"});
  } catch (error) {
    const message = byId("previewError");
    message.textContent = "Cannot evaluate this input: " + (error instanceof Error ? error.message : "unsupported input");
    message.hidden = false;
  }
});
download.addEventListener("click", () => {
  if (!lastResult) return;
  const blob = new Blob([format(lastResult) + "\n"], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pcs-browser-preview-assessment.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
loadFixture("trace_pass");
