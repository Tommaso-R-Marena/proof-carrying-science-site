(() => {
  "use strict";

  const CONTACT = "marenatommaso@gmail.com";
  const PROFILE_KEY = "pcs-commons-profile-v1";
  const REQUESTS_KEY = "pcs-commons-task-requests-v1";

  const LEVELS = [
    {level:0, name:"Learner", short:"L0", review:false, paid:false, description:"Orientation, structured annotation, reproduction walkthroughs."},
    {level:1, name:"Contributor", short:"L1", review:false, paid:"limited", description:"Evidence checks, literature extraction, usability reproduction."},
    {level:2, name:"Verified Contributor", short:"L2", review:false, paid:true, description:"Tests, simple checkers, adversarial cases, structured reviews."},
    {level:3, name:"Investigator", short:"L3", review:false, paid:true, description:"Claim decomposition, benchmarks, evaluator analysis."},
    {level:4, name:"Reviewer", short:"L4", review:true, paid:true, description:"Independent validation, adjudication, assurance-case review."},
    {level:5, name:"Specialist", short:"L5", review:true, paid:true, description:"Formal methods, security, ML evaluation, interpretability."},
    {level:6, name:"Research Lead", short:"L6", review:true, paid:true, description:"Own an assurance case, adapter, benchmark, or research program."}
  ];

  const TASKS = [
    {
      id:"AS-001", title:"Reproduce a bounded trace checker", level:0, hours:1, skill:"nontechnical",
      compensation:"volunteer", funding:"open", project:"AI Safety v0.1",
      impact:"Evaluation integrity", difficulty:"Easy",
      summary:"Follow a deterministic trace-checking walkthrough and independently confirm the declared forbidden-action count.",
      deliverable:"A short structured reproduction record: expected count, observed count, any ambiguity, and whether instructions were sufficient.",
      verification:"A second reviewer compares the submitted record against the frozen trace fixture."
    },
    {
      id:"AS-002", title:"Annotate agent actions against a policy rubric", level:0, hours:2, skill:"nontechnical",
      compensation:"volunteer", funding:"open", project:"AI Safety v0.1",
      impact:"Trace semantics", difficulty:"Easy",
      summary:"Classify a small set of synthetic agent actions as allowed, forbidden, or ambiguous under a supplied rubric.",
      deliverable:"Structured labels plus one-sentence justification for ambiguous cases.",
      verification:"Agreement against a hidden reference set and reviewer inspection of disagreements."
    },
    {
      id:"AS-003", title:"Audit claims against evidence in a safety report", level:1, hours:2, skill:"research",
      compensation:"volunteer", funding:"open", project:"AI Safety v0.1",
      impact:"Epistemic calibration", difficulty:"Easy",
      summary:"Check whether a bounded safety conclusion is stronger than the evidence actually shown.",
      deliverable:"A claim/evidence table marking supported, overstated, under-specified, or open statements.",
      verification:"Independent review using the same evidence rubric."
    },
    {
      id:"AS-004", title:"Write adversarial tool-permission cases", level:2, hours:3, skill:"python",
      compensation:"bounty", amount:"$150 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Authorization invariants", difficulty:"Moderate",
      summary:"Create cases intended to bypass a declared tool authorization policy without changing the policy itself.",
      deliverable:"Machine-readable test cases plus expected accept/reject outcomes and attack rationale.",
      verification:"Cases must execute deterministically and be reviewed for novelty and correctness."
    },
    {
      id:"AS-005", title:"Implement single-use authorization invariant checker", level:2, hours:4, skill:"python",
      compensation:"bounty", amount:"$250 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Resource / authority safety", difficulty:"Moderate",
      summary:"Implement a fail-closed checker that rejects reuse of a consumed authorization token.",
      deliverable:"Checker, unit tests, malformed-input tests, and a short trust-boundary note.",
      verification:"PCS maintainers rerun the tests and adversarially mutate the fixtures."
    },
    {
      id:"AS-006", title:"Independent evaluator-binding review", level:3, hours:5, skill:"ml",
      compensation:"bounty", amount:"$400 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Evaluation integrity", difficulty:"Advanced",
      summary:"Review whether model, evaluator, dataset, configuration, and result commitments are bound strongly enough to prevent substitution.",
      deliverable:"Threat model, missing-binding findings, and concrete regression tests.",
      verification:"Findings are reproduced by a second technical reviewer."
    },
    {
      id:"AS-007", title:"Decompose a bounded agent-safety claim", level:3, hours:5, skill:"research",
      compensation:"bounty", amount:"$350 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Claim IR / obligation graph", difficulty:"Advanced",
      summary:"Turn a high-level bounded safety claim into explicit leaves: formal, computational, empirical, and OPEN.",
      deliverable:"A proposed obligation DAG with dependency rationale and unresolved assumptions.",
      verification:"Accepted only after a separate reviewer checks completeness and non-circularity."
    },
    {
      id:"AS-008", title:"Review a contributor-built assurance graph", level:4, hours:3, skill:"review",
      compensation:"review", amount:"$300 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Independent review", difficulty:"Reviewer",
      summary:"Independently challenge a completed obligation graph and identify unsupported leaves, missing dependencies, or inappropriate closure.",
      deliverable:"Signed review record with accept/reject/open findings per node.",
      verification:"Reviewer eligibility is assigned by PCS; disagreement is escalated rather than silently averaged."
    },
    {
      id:"AS-009", title:"Formalize a trace-invariant preservation lemma", level:5, hours:8, skill:"lean",
      compensation:"contract", amount:"$1,200 proposed", funding:"planned", project:"AI Safety v0.1",
      impact:"Formal assurance", difficulty:"Specialist",
      summary:"Formalize a bounded transition invariant in Lean without introducing proof escapes.",
      deliverable:"Compiling Lean theorem, axiom audit, counterexample attempts, and explanation of assumptions.",
      verification:"Independent Lean review plus clean build and forbidden-escape audit."
    },
    {
      id:"AS-010", title:"Red-team contributor non-authority", level:5, hours:8, skill:"security",
      compensation:"contract", amount:"$1,500 proposed", funding:"planned", project:"Distributed assurance",
      impact:"Crowdsource work, not authority", difficulty:"Specialist",
      summary:"Attempt to manufacture a false accepted root through colluding contributors, stale evidence, wrong-leaf evidence, or ordering attacks.",
      deliverable:"Attack corpus, successful/failed exploits, and regression recommendations.",
      verification:"Every claimed exploit must be independently reproduced."
    },
    {
      id:"SCI-001", title:"Map a computational-biology claim into bounded obligations", level:3, hours:5, skill:"biology",
      compensation:"bounty", amount:"$350 proposed", funding:"planned", project:"Cross-domain pilot",
      impact:"Domain generality", difficulty:"Advanced",
      summary:"Propose a precise computational-biology assurance case whose truth is scoped to committed artifacts rather than external biology.",
      deliverable:"Claim specification, data-world boundary, leaf obligations, and explicit external-world assumptions.",
      verification:"Domain review plus PCS structural review."
    },
    {
      id:"OPS-001", title:"Test whether a new contributor can understand one task unaided", level:1, hours:1, skill:"nontechnical",
      compensation:"volunteer", funding:"open", project:"Contributor infrastructure",
      impact:"Usability / access", difficulty:"Easy",
      summary:"Use the task page without founder assistance and record every term, instruction, or acceptance condition that is unclear.",
      deliverable:"Structured usability notes and a yes/no answer: could you tell what useful result was expected?",
      verification:"Product maintainer triage and before/after copy comparison."
    }
  ];

  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
  }
  function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }
  function getRequests() {
    try { return JSON.parse(localStorage.getItem(REQUESTS_KEY) || "[]"); } catch { return []; }
  }
  function saveRequests(requests) {
    localStorage.setItem(REQUESTS_KEY, JSON.stringify(requests));
  }

  function compensationLabel(task) {
    if (task.compensation === "volunteer") return "Volunteer";
    if (task.compensation === "review") return task.amount || "Paid review";
    if (task.compensation === "contract") return task.amount || "Specialist contract";
    return task.amount || "Bounty";
  }

  function fundingLabel(task) {
    if (task.compensation === "volunteer") return "Open public-good task";
    if (task.funding === "funded") return "Funded now";
    return "Planned bounty · not yet funded";
  }

  function taskCard(task, requestedIds) {
    const requested = requestedIds.includes(task.id);
    const paid = task.compensation !== "volunteer";
    return `
      <article class="commons-task-card" data-level="${task.level}" data-comp="${task.compensation}" data-skill="${escapeHtml(task.skill)}" data-hours="${task.hours}">
        <div class="task-card-top">
          <div>
            <span class="commons-chip level">L${task.level}</span>
            <span class="commons-chip ${paid ? "paid" : "volunteer"}">${escapeHtml(compensationLabel(task))}</span>
            ${paid ? `<span class="commons-chip planned">${escapeHtml(fundingLabel(task))}</span>` : ""}
          </div>
          <code>${escapeHtml(task.id)}</code>
        </div>
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.summary)}</p>
        <div class="task-meta">
          <span><b>${task.hours}h</b> expected</span>
          <span><b>${escapeHtml(task.difficulty)}</b> difficulty</span>
          <span><b>${escapeHtml(task.skill)}</b> track</span>
          <span><b>${escapeHtml(task.impact)}</b> impact</span>
        </div>
        <details class="task-details">
          <summary>What counts as done?</summary>
          <p><strong>Deliverable:</strong> ${escapeHtml(task.deliverable)}</p>
          <p><strong>Verification:</strong> ${escapeHtml(task.verification)}</p>
          <p><strong>Project:</strong> ${escapeHtml(task.project)}</p>
        </details>
        <div class="task-actions">
          <button class="button ${requested ? "secondary" : "primary"}" type="button" data-task-request="${task.id}">
            ${requested ? "Request saved locally" : (task.funding === "planned" && paid ? "Express interest" : "Request this task")}
          </button>
          <a class="button secondary" href="projects.html#${encodeURIComponent(task.project.toLowerCase().replace(/[^a-z0-9]+/g,"-"))}">See impact path</a>
        </div>
      </article>`;
  }

  function renderTasks() {
    const container = $("#commonsTaskList");
    if (!container) return;
    const requestedIds = getRequests();
    const level = Number($("#taskLevel")?.value ?? 6);
    const comp = $("#taskComp")?.value || "all";
    const skill = $("#taskSkill")?.value || "all";
    const hours = Number($("#taskHours")?.value || 99);

    const shown = TASKS.filter((task) =>
      task.level <= level &&
      (comp === "all" || (comp === "paid" ? task.compensation !== "volunteer" : task.compensation === comp)) &&
      (skill === "all" || task.skill === skill) &&
      task.hours <= hours
    );

    container.innerHTML = shown.map((task) => taskCard(task, requestedIds)).join("") ||
      '<div class="commons-empty"><strong>No tasks match those filters.</strong><span>Increase the level or time limit, or choose another track.</span></div>';

    const count = $("#taskCount");
    if (count) count.textContent = `${shown.length} task${shown.length === 1 ? "" : "s"} shown`;

    $$("[data-task-request]", container).forEach((button) => {
      button.addEventListener("click", () => requestTask(button.dataset.taskRequest));
    });
  }

  function requestTask(id) {
    const task = TASKS.find((x) => x.id === id);
    if (!task) return;
    const requests = getRequests();
    if (!requests.includes(id)) {
      requests.push(id);
      saveRequests(requests);
    }
    renderTasks();
    renderLocalProfile();

    const profile = getProfile();
    const subject = encodeURIComponent(`PCS task interest: ${task.id} — ${task.title}`);
    const body = encodeURIComponent(
      [
        "Hello,",
        "",
        `I am interested in PCS task ${task.id}: ${task.title}.`,
        `Expected time: ${task.hours} hours.`,
        `Compensation status shown on site: ${fundingLabel(task)} / ${compensationLabel(task)}.`,
        "",
        profile ? `My local contributor profile: level L${profile.level}; availability ${profile.hours} hours/week; preference ${profile.compensation}.` : "I have not created a local contributor profile yet.",
        "",
        "I understand that saving/requesting a task in the browser does not assign the task. Please confirm scope, ownership/licensing terms, compensation (if any), and acceptance criteria before I begin productive work.",
        "",
        "Thank you."
      ].join("\n")
    );
    window.location.href = `mailto:${CONTACT}?subject=${subject}&body=${body}`;
  }

  function recommendTask(profile) {
    const preferredSkill = profile.track || "nontechnical";
    const candidates = TASKS.filter((task) =>
      task.level <= profile.level &&
      task.hours <= Math.max(1, Number(profile.hours || 1)) &&
      (profile.compensation !== "paid-only" || task.compensation !== "volunteer")
    );
    return candidates.find((task) => task.skill === preferredSkill) || candidates[0] || TASKS[0];
  }

  function renderRecommendation() {
    const target = $("#commonsRecommendation");
    if (!target) return;
    const profile = getProfile();
    if (!profile) {
      target.innerHTML = '<div class="commons-empty"><strong>Create your local contributor profile first.</strong><span>We will suggest a bounded task that fits your time, skills, and compensation preference.</span></div>';
      return;
    }
    const task = recommendTask(profile);
    target.innerHTML = `
      <div class="recommendation-card">
        <div><span class="commons-chip level">L${task.level}</span><span class="commons-chip ${task.compensation === "volunteer" ? "volunteer" : "paid"}">${escapeHtml(compensationLabel(task))}</span></div>
        <h3>${escapeHtml(task.title)}</h3>
        <p>${escapeHtml(task.summary)}</p>
        <div class="task-meta"><span><b>${task.hours}h</b> expected</span><span><b>${escapeHtml(task.impact)}</b> impact</span></div>
        <div class="actions"><a class="button primary" href="tasks.html">Open task marketplace</a></div>
      </div>`;
  }

  function renderLocalProfile() {
    const target = $("#localContributorProfile");
    if (!target) return;
    const profile = getProfile();
    const requested = getRequests();
    if (!profile) {
      target.innerHTML = '<p class="muted">No local profile yet. Complete the contributor form above. Nothing is sent to PCS until you choose to email a task request.</p>';
      return;
    }
    const level = LEVELS.find((x) => x.level === Number(profile.level)) || LEVELS[0];
    target.innerHTML = `
      <div class="local-profile-head"><span class="commons-level-badge">L${level.level}</span><div><strong>${escapeHtml(level.name)}</strong><small>Local planning profile · official level requires PCS review</small></div></div>
      <dl class="local-profile-grid">
        <div><dt>Time</dt><dd>${escapeHtml(profile.hours)} h/week</dd></div>
        <div><dt>Track</dt><dd>${escapeHtml(profile.track)}</dd></div>
        <div><dt>Work preference</dt><dd>${escapeHtml(profile.compensation)}</dd></div>
        <div><dt>Task requests saved</dt><dd>${requested.length}</dd></div>
      </dl>
      <p class="tiny"><strong>Paid marketplace:</strong> general eligibility begins at L2 after verified work. <strong>Review authority:</strong> begins at L4 and is assigned separately from compensation.</p>`;
  }

  function initContributorForm() {
    const form = $("#contributorProfileForm");
    if (!form) return;
    const existing = getProfile();
    if (existing) {
      ["hours","track","compensation","level"].forEach((key) => {
        const field = form.elements.namedItem(key);
        if (field) field.value = existing[key];
      });
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const profile = {
        hours: Number(data.get("hours") || 1),
        track: String(data.get("track") || "nontechnical"),
        compensation: String(data.get("compensation") || "either"),
        level: Number(data.get("level") || 0)
      };
      saveProfile(profile);
      renderLocalProfile();
      renderRecommendation();
      const saved = $("#profileSaved");
      if (saved) {
        saved.hidden = false;
        window.setTimeout(() => { saved.hidden = true; }, 3000);
      }
    });
  }

  function renderLevelTable() {
    const target = $("#commonsLevels");
    if (!target) return;
    target.innerHTML = LEVELS.map((item) => `
      <article class="level-card">
        <div class="level-number">L${item.level}</div>
        <div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p>
        <div class="level-access">
          <span>${item.paid === true ? "Paid tasks eligible" : item.paid === "limited" ? "Occasional micro-bounties" : "Training / volunteer"}</span>
          <span>${item.review ? "Reviewer authority eligible" : "No review authority"}</span>
        </div></div>
      </article>`).join("");
  }

  function renderImpactFromProfile() {
    const target = $("#personalImpact");
    if (!target) return;
    const requests = getRequests();
    if (!requests.length) {
      target.innerHTML = '<p class="muted">Your requested tasks will appear here as a local planning view. The public impact record should eventually come only from accepted, auditable contributions.</p>';
      return;
    }
    target.innerHTML = requests.map((id) => {
      const task = TASKS.find((x) => x.id === id);
      if (!task) return "";
      return `<div class="impact-request"><code>${escapeHtml(task.id)}</code><div><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.impact)} → ${escapeHtml(task.project)}</span></div><b>REQUESTED</b></div>`;
    }).join("");
  }

  function initTaskFilters() {
    ["taskLevel","taskComp","taskSkill","taskHours"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("input", renderTasks);
      if (el) el.addEventListener("change", renderTasks);
    });
    renderTasks();
  }

  document.addEventListener("DOMContentLoaded", () => {
    initContributorForm();
    initTaskFilters();
    renderLevelTable();
    renderLocalProfile();
    renderRecommendation();
    renderImpactFromProfile();

    $$(".commons-disclosure").forEach((node) => {
      node.addEventListener("toggle", () => {
        if (node.open) $$(".commons-disclosure").filter((x) => x !== node).forEach((x) => { x.open = false; });
      });
    });
  });
})();
