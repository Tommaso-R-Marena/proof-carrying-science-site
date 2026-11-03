// Authored page-by-page reading guidance. No verification or authority decisions.
export const PAGE_HELP = Object.freeze({
  "404.html": {
    "title": "Page not found.",
    "purpose": "The link may be old or incomplete. Return to Start here to choose a tool.",
    "first_step": "Open Start here from the link below.",
    "scope": "No evidence or result was checked on this page.",
    "kind": "navigation"
  },
  "account.html": {
    "title": "Sign in or create an account.",
    "purpose": "You can use the local tools and games without an account. An account lets you contribute work and manage your optional research donations.",
    "first_step": "Choose sign in or create an account. New contributors begin at level 0.",
    "scope": "Contributor levels and skills need review. Creating an account does not grant permission to approve scientific claims.",
    "kind": "account"
  },
  "admin-login.html": {
    "title": "Admin sign in",
    "purpose": "This is a separate administrative session from your contributor account session. Only accounts explicitly granted administrator authority can enter the Admin Center.",
    "first_step": "Sign in with an account that already has administrator permission.",
    "scope": "An ordinary contributor session cannot authorize administrative actions.",
    "kind": "administration"
  },
  "admin.html": {
    "title": "Manage contributions and review decisions.",
    "purpose": "This dashboard is for authorized administrators. Review requests, manage permissions, and inspect the history of administrative actions.",
    "first_step": "Sign in to the separate administrator session, then choose the section you need.",
    "scope": "Administrative approval and scientific verification are separate decisions. Server permissions control every action.",
    "kind": "administration"
  },
  "architecture.html": {
    "title": "How PCS checks a scientific result.",
    "purpose": "PCS keeps the claim, its files, the checks, and the reviewer’s decision separate. This page explains how those parts fit together.",
    "first_step": "Follow the workflow diagram, then read the trust boundary for the component you use.",
    "scope": "A checked package does not by itself establish that its scientific assumptions or real-world interpretation are correct.",
    "kind": "technical reference"
  },
  "arena-countermodel.html": {
    "title": "Find an example where the rules disagree.",
    "purpose": "Turn facts on or off, then compare the two results.",
    "first_step": "Turn one fact on or off, then check whether the two rules give different answers.",
    "scope": "A counterexample is one example where the rules disagree. This checks a small fictional world, not a deployed AI.",
    "kind": "reasoning game"
  },
  "arena-proof-quest.html": {
    "title": "Put the steps in order.",
    "purpose": "Practise putting evidence before a conclusion. Start with building a bridge: each step must have what it needs.",
    "first_step": "Tap a step card to add it to your path, then check the completed order.",
    "scope": "A working card order practises prerequisites. It is not a mathematical proof.",
    "kind": "reasoning game"
  },
  "arena-safety-forge.html": {
    "title": "Find the bot’s mistake. Fix its rules.",
    "purpose": "Practise finding a loophole, then fixing it without stopping the job. Your challenge is to protect a fictional bot’s mission.",
    "first_step": "Try an action, look for a failure, then switch to fixing the rules.",
    "scope": "A repair must prevent failures and still allow the fictional mission. Passing this game does not establish real AI safety.",
    "kind": "simulation game"
  },
  "arena.html": {
    "title": "Learn to spot a mistake.",
    "purpose": "PCS checks claims instead of taking their word for it. These games let you practise: try an idea, see why it works or fails, then improve it. No account or coding needed.",
    "first_step": "Start with World Builder. Choose the other games when you want a different kind of puzzle.",
    "scope": "The games practise finding mistakes and checking ideas. Playing does not automatically share your moves or train a model.",
    "kind": "game chooser"
  },
  "assurance-fold.html": {
    "title": "Sort the cards. Cool the board.",
    "purpose": "Sort statements by what their evidence actually supports. The board gets cooler as you put cards in the right places.",
    "first_step": "Choose a card and a category, or drag the card onto the board.",
    "scope": "A completed board checks the game categories. It is not scientific approval or a new Lean proof.",
    "kind": "reasoning game"
  },
  "bridge-builder.html": {
    "title": "Connect the facts to the goal.",
    "purpose": "Choose a useful step and watch your bridge grow.",
    "first_step": "Start the easy tutorial, then choose step cards that connect the facts to the goal.",
    "scope": "The board uses recorded proof steps. A fresh remote Lean check requires a separate request and publication consent.",
    "kind": "proof game"
  },
  "calibration-lab.html": {
    "title": "How reliable is a prediction?",
    "purpose": "Explore real yacht measurements. Compare predictions with observations that were kept out of the fitting step, then see how the prediction depends on an assumed measurement-error limit.",
    "first_step": "Choose a hull, meaning one boat shape. Compare the dots and predictions before changing the error assumption.",
    "scope": "The browser calculates exact numerical checks. The Lean proofs are recorded evidence, not a new run here. Physical validity and prediction accuracy on unseen boats remain open.",
    "kind": "real-data research lab"
  },
  "capabilities.html": {
    "title": "What actually runs?",
    "purpose": "PCS has several engines. Some tools use trained models to propose an answer. Others calculate an exact result or show an earlier experiment. A model proposal still needs its own check.",
    "first_step": "Choose a tool in the execution map to see whether it runs a model, computes a check, or shows a recorded result.",
    "scope": "A model suggestion needs checking. Recorded evidence is different from a fresh execution.",
    "kind": "execution guide"
  },
  "check-my-files.html": {
    "title": "Do these files share any IDs?",
    "purpose": "Choose two CSV exports and the column that identifies each person or item. We’ll show you matching IDs and the rows to review.",
    "first_step": "Choose two CSV files, select their ID columns, then check for shared IDs.",
    "scope": "An ID is the label for a person or item. Only the two chosen columns are checked; a match does not establish data accuracy.",
    "kind": "local file tool"
  },
  "claim-invalidation-v1.html": {
    "title": "What needs rechecking when a file changes?",
    "purpose": "Follow how a changed file can affect later calculations and claims. This research task studies when those claims must be reopened.",
    "first_step": "Read the small example and contribution packet before choosing a task.",
    "scope": "The dependency map only knows the connections that were recorded. It cannot discover an omitted connection automatically.",
    "kind": "research task"
  },
  "claim-review.html": {
    "title": "Follow the evidence behind a claim.",
    "purpose": "Open a PCS translation plan to see which supporting checks are complete and which questions remain open. The file stays on your device.",
    "first_step": "Load the recursive example, or open a compatible translation JSON file.",
    "scope": "This page displays a plan. It does not run the production verifier or approve a scientific claim.",
    "kind": "local evidence viewer"
  },
  "commons.html": {
    "title": "Find a useful way to help PCS.",
    "purpose": "Choose a small task that fits your time and skills. Each task explains what to deliver and how the work will be reviewed.",
    "first_step": "Browse the published tasks or the beginner contribution guide.",
    "scope": "A completed task can support a larger claim, but only checked evidence can settle that claim.",
    "kind": "contributor guide"
  },
  "contact.html": {
    "title": "Talk to us about a scientific workflow.",
    "purpose": "Tell us what you want to check, which files matter, and what another person would need to repeat the check. Start with a small, non-sensitive example.",
    "first_step": "Read the contact options and choose the one that matches your question.",
    "scope": "A conversation is not a private-data intake agreement or independent scientific validation.",
    "kind": "contact"
  },
  "contribute.html": {
    "title": "Choose a way to contribute.",
    "purpose": "You can help with research, engineering, testing, writing, or operations. Start with a task that matches your time and skills.",
    "first_step": "Choose your available time and experience, then review the suggested path.",
    "scope": "Open beginner tasks do not require an exam. Reserved or specialist work can require verified skills and manual approval.",
    "kind": "contributor guide"
  },
  "contributors.html": {
    "title": "How contributor levels work.",
    "purpose": "Start with open tasks and build a record of reliable work. More advanced responsibilities require evidence and review.",
    "first_step": "Read the level requirements, then use your account to request the next appropriate review.",
    "scope": "A contributor level describes permissions and reviewed experience. It does not make someone’s scientific claims automatically true.",
    "kind": "participation policy"
  },
  "demo.html": {
    "title": "See how a damaged evidence package is rejected.",
    "purpose": "Change a sample package and inspect which check catches the problem. This is an older, recorded-format demonstration; use it to understand the checks.",
    "first_step": "Load the reference package, choose a change, then inspect the resulting rejection.",
    "scope": "This browser demonstration uses the frozen v0.5 format. Current authoritative verification uses the separate compiled Lean checker.",
    "kind": "legacy demonstration"
  },
  "evaluation-firewall.html": {
    "title": "Compare a model’s answers across equivalent questions.",
    "purpose": "Inspect whether a model gives consistent answers when the same logic problem is rewritten. Run the evaluator on your computer, then open its report here.",
    "first_step": "Open an evaluator report; optionally load a second report for comparison.",
    "scope": "Displayed reports are not trusted until their predictions are recomputed. These public tests are not a blind evaluation.",
    "kind": "local research report viewer"
  },
  "evidence-atlas.html": {
    "title": "Find the sources behind the examples.",
    "purpose": "Browse the papers, datasets, standards, and repositories used by the PCS demonstrations. Each entry explains its connection to the project.",
    "first_step": "Filter the source list, then open a source or its related demonstration.",
    "scope": "A source link is a citation, not evidence that PCS reproduced or verified the entire study.",
    "kind": "source library"
  },
  "experience.html": {
    "title": "Check your work.Keep the evidence.",
    "purpose": "PCS checks specific rules in data and calculations. It shows what passed, what needs attention, and how someone else can check the same result.",
    "first_step": "Run the published-data example, read the result, then save and reopen its recheck file.",
    "scope": "The example checks preservation of recorded values. It does not establish that the measurements or scientific conclusions are correct.",
    "kind": "guided scientific workflow"
  },
  "first-visit-study.html": {
    "title": "Which parts are confusing?",
    "purpose": "Try a walkthrough or game, then tell us whether you understood it. You can skip a task or stop whenever you want.",
    "first_step": "Read the recording explanation, choose whether to consent, then try any practice task.",
    "scope": "Records stay on this device until you choose to share a download. Client records do not prove human authorship or reliable timing.",
    "kind": "optional usability practice"
  },
  "forge-duel.html": {
    "title": "Which plan would you choose?",
    "purpose": "Compare two robot plans. Pick one, then see what the game checks.",
    "first_step": "Read the two bot plans, choose one or neither, then inspect what the simulator finds.",
    "scope": "The result concerns the fictional mission and its fixed rules. It does not certify a real bot or AI system.",
    "kind": "simulation game"
  },
  "fund.html": {
    "title": "Help fund useful safety work.",
    "purpose": "Funding can support infrastructure, specialist reviews, and clearly defined contributor tasks. This page explains the proposed funding model and its limits.",
    "first_step": "Read the funding categories and contact PCS before making a commitment.",
    "scope": "A task is payable only when it is explicitly funded and written terms have been agreed. Funding never purchases a scientific verdict.",
    "kind": "funding policy"
  },
  "governance.html": {
    "title": "How decisions and responsibilities work.",
    "purpose": "This page explains who can approve work, how conflicts are handled, and why scientific claims still need evidence.",
    "first_step": "Read the responsibilities relevant to your role and the rules for conflicts or paid work.",
    "scope": "Governance rules organize people. They cannot substitute for verification or the separate legal terms of an agreement.",
    "kind": "governance policy"
  },
  "guided-submission.html": {
    "title": "Prepare a scientific project for review.",
    "purpose": "Choose the relevant project files, review the checks PCS suggests, and save a draft for someone else to inspect. You confirm what the scientific question means.",
    "first_step": "Try the synthetic example, or choose a small non-sensitive part of your project.",
    "scope": "A suggested check is a draft. This browser does not execute your code or issue a scientific certificate.",
    "kind": "local project preparation"
  },
  "index.html": {
    "title": "Check your work.Keep the evidence.",
    "purpose": "PCS checks specific rules in data and calculations. It shows what passed, what needs attention, and how someone else can check the same result.",
    "first_step": "Try the scientific example first. Then use the file tools, model walkthrough, or research pages.",
    "scope": "Each tool checks a particular question. Its result must be read with its assumptions and limits.",
    "kind": "home"
  },
  "intake.html": {
    "title": "Write down what you want checked.",
    "purpose": "Define the project, the specific questions, and the assumptions before looking at the result. Save that agreed description for the later review.",
    "first_step": "Fill in the pilot’s question and scope, then validate and export the description.",
    "scope": "Locking a description helps detect later changes. It does not check the underlying science or sign an approval.",
    "kind": "local planning tool"
  },
  "intervention-lab.html": {
    "title": "Find a lower-cost plan.",
    "purpose": "Change the allowed facts and check whether your plan reaches its goal.",
    "first_step": "Choose a mission, change the permitted facts, then check whether your plan reaches the goal.",
    "scope": "The cheapest plan is calculated only for the displayed Boolean variables, costs, and constraints.",
    "kind": "bounded planning lab"
  },
  "lean-learning-lab.html": {
    "title": "Explore how PCS searches for a proof.",
    "purpose": "Choose a supported mathematical question, try proof steps, and inspect the result. The simpler proof workbench is a good place to begin.",
    "first_step": "Use the proof workbench for a guided start, or connect the local backend for interactive proof play.",
    "scope": "Lean checks an exact mathematical statement. Your intended English meaning still needs review. Public jobs require explicit publication consent.",
    "kind": "advanced proof-search lab"
  },
  "live-demo.html": {
    "title": "Can a rewrite change a safety rule?",
    "purpose": "Change the facts about a fictional tool call and compare the original rule with its rewrite. Find a case where the rules give different answers.",
    "first_step": "Turn a fact on or off, then inspect both rule outcomes.",
    "scope": "The browser checks finite logic. Separate server replay is explicit; this does not test the behaviour of a real AI.",
    "kind": "local reasoning demonstration"
  },
  "meaning-forge.html": {
    "title": "Make the words mean the same thing.",
    "purpose": "Change the controls until the proposed sentence matches the target.",
    "first_step": "Choose a mission and change a word or relationship until the proposed sentence matches its target.",
    "scope": "This game checks its controlled sentence structure. It does not establish arbitrary English meaning or compile Lean.",
    "kind": "language reasoning game"
  },
  "memory-workshop.html": {
    "title": "Use a checked rule again.",
    "purpose": "Connect the facts to the goal using the rules in your toolbox.",
    "first_step": "Start the easy tutorial, then choose a checked rule to help connect the facts to the goal.",
    "scope": "Recorded proof steps and fresh kernel checks are separate. A reused rule still has to fit the current exact goal.",
    "kind": "proof game"
  },
  "model-lab.html": {
    "title": "Explore a simple drug-concentration model.",
    "purpose": "Change the dose and model parameters, calculate the predicted concentrations, and save the files needed for a separate PCS check.",
    "first_step": "Choose model parameters, generate predictions, then inspect or download them.",
    "scope": "This is a restricted mathematical model. It is not medical advice or evidence that a dose is safe or effective.",
    "kind": "synthetic scientific-model lab"
  },
  "model-walkthrough.html": {
    "title": "A model suggests.A checker tests.",
    "purpose": "Models can suggest plausible changes that are wrong. PCS keeps the suggestion separate from the check. Try a small example of that process.",
    "first_step": "Choose an example, ask the actual trained ranker for a repair, then inspect the separate checks.",
    "scope": "Passing means agreement in the registered small worlds. It does not prove real AI safety or equivalence in all possible worlds.",
    "kind": "actual browser model demonstration"
  },
  "mvp.html": {
    "title": "Run PCS on your own computer.",
    "purpose": "Prepare a small scientific project, collect its evidence, and let an independent reviewer repeat the supported checks. This page gives the command-line setup.",
    "first_step": "Start with the guided project mapper, then follow the producer and reviewer commands.",
    "scope": "These instructions require a local technical setup. Use Start here for a no-installation introduction.",
    "kind": "technical setup guide"
  },
  "omega-workspace.html": {
    "title": "Map a claim and its supporting evidence.",
    "purpose": "Choose an example or write an explicit interpretation. Follow the supporting questions and compare search strategies, including trained models.",
    "first_step": "Load an example, then select a claim or supporting question in the graph.",
    "scope": "The workspace checks explicit Boolean interpretations. It does not automatically understand a paper or run the production authority.",
    "kind": "local reasoning workspace"
  },
  "organizations.html": {
    "title": "Using PCS as an organization.",
    "purpose": "Learn about public access, research collaboration, and the proposed commercial support model. Contact PCS to discuss a concrete workflow.",
    "first_step": "Choose the use case closest to your organization and read what would need agreement.",
    "scope": "These are access and sustainability plans, not a signed service contract or a promise of enterprise readiness.",
    "kind": "organization guide"
  },
  "package-inspector.html": {
    "title": "Inspect an evidence package.",
    "purpose": "A PCS package keeps a claim and its evidence together in one file. Open it to see the contents and check their recorded file identities.",
    "first_step": "Load the sample package, or choose a compatible .pcs.zip file.",
    "scope": "Browser inspection is not authoritative verification. The recipient must run the appropriate independent verifier before relying on a package.",
    "kind": "local package inspector"
  },
  "paper-demos.html": {
    "title": "Explore scientific examples with published data.",
    "purpose": "Start with the penguin measurements, inspect the evidence behind the calculation, and see what was checked and what remains uncertain.",
    "first_step": "Choose a demonstration and follow its source, calculation, evidence, and limits.",
    "scope": "The page shows recorded verification receipts. A successful computational check does not validate an entire study or its biological interpretation.",
    "kind": "recorded scientific demonstrations"
  },
  "privacy.html": {
    "title": "What PCS stores and shares.",
    "purpose": "Local tools keep their working data on your device. Accounts, public proof requests, and optional research donations have different data rules, explained below.",
    "first_step": "Read the section for the feature you use before signing in, publishing a proof request, or donating research data.",
    "scope": "Publication, research consent, account erasure, exported copies, and infrastructure logs have separate effects. Local calculations do not imply zero website logging.",
    "kind": "privacy policy"
  },
  "project-builder.html": {
    "title": "Choose which project files to check.",
    "purpose": "Inspect files locally and review the checks PCS proposes. This advanced tool gives direct control over the draft and its technical details.",
    "first_step": "Choose a project folder or load the synthetic example, then review the suggested files and checks.",
    "scope": "Your code is not executed or uploaded. The output is a draft, not a verified scientific result.",
    "kind": "advanced local project mapper"
  },
  "projects.html": {
    "title": "See how a task helps a larger project.",
    "purpose": "Follow the connections from a task to the question it supports. See which work and evidence are still needed.",
    "first_step": "Choose a published project, then inspect its tasks and supporting evidence.",
    "scope": "A finished task is not itself a proof. Only the appropriate verified evidence can settle the scientific question.",
    "kind": "project map"
  },
  "proof-search-results.html": {
    "title": "What worked in our proof-search test?",
    "purpose": "The stronger symbolic strategy solved more of these questions. The learned policy did not add a uniquely solved question. That is why the workbench offers the fast checked portfolio first.",
    "first_step": "Compare the two methods, then inspect the retained results and their limits.",
    "scope": "The learned policy showed no unique solved question in this study. The small authored set is not a general measure of mathematical intelligence.",
    "kind": "recorded research results"
  },
  "proof-workbench-study.html": {
    "title": "Help us test the proof workflow.",
    "purpose": "This optional pilot asks whether people can use the workbench and understand what a result means. Software cannot establish that a participant is human or inexperienced. We have no human pilot results yet.",
    "first_step": "Read the consent and task instructions before starting any optional recording.",
    "scope": "Human origin, prior experience and timing need independent observation. No human usability result is established by the software.",
    "kind": "optional usability study"
  },
  "proof-workbench.html": {
    "title": "Check a mathematical claim.",
    "purpose": "See exactly what you are asking, let a proof strategy try it, and keep evidence someone else can check.",
    "first_step": "Choose a supported question, review its exact meaning, then try a recorded example or explicitly publish a real proof job.",
    "scope": "A recorded example is not a fresh run. A fresh Lean result checks the displayed statement and assumptions, not its real-world meaning.",
    "kind": "guided proof tool"
  },
  "prooflab.html": {
    "title": "Choose what to check next.",
    "purpose": "Pick a card, see whether it is ready, and build an investigation.",
    "first_step": "Choose an investigation card whose required starting facts are ready.",
    "scope": "This is a planning exercise around recorded mathematical material. Completing the graph does not itself prove a theorem.",
    "kind": "research-planning game"
  },
  "reasoning-lab.html": {
    "title": "Which assumptions does your conclusion need?",
    "purpose": "Choose a logic example, change its assumptions, and look for a case where the conclusion fails. You decide what each variable means.",
    "first_step": "Start with an example, then change one assumption or fact and rerun the check.",
    "scope": "The calculation concerns explicit Boolean formulas. It does not establish the truth of an assumption in the real world.",
    "kind": "local logic lab"
  },
  "repair-model-lab.html": {
    "title": "Watch a model suggest repairs.",
    "purpose": "Choose a case and inspect how a trained model ranks possible edits.",
    "first_step": "Choose a case and ask the trained model to rank edits. Inspect the finite check for each attempted repair.",
    "scope": "A model score suggests what to try. Only the separate finite evaluator establishes agreement within the displayed bound.",
    "kind": "advanced browser model lab"
  },
  "research-preview.html": {
    "title": "Try a small scientific or policy check.",
    "purpose": "Change an input, run a real browser calculation, and see why a check passes or fails. Follow the links to the separate evidence-review workflow.",
    "first_step": "Choose an example, change one input, then run its check.",
    "scope": "These are synthetic browser examples. They do not run Lean or establish that a deployed AI or scientific model is valid.",
    "kind": "local calculation preview"
  },
  "research-updates.html": {
    "title": "Research results and their limits.",
    "purpose": "Explore the integrated proofs and experiments, the exact inputs they concern, and the questions that remain open.",
    "first_step": "Choose a research area, then read its result, assumptions, evidence and reproduction instructions.",
    "scope": "An unsigned website summary is not an independent review. Recorded proofs must be replayed with their exact trusted sources.",
    "kind": "research archive guide"
  },
  "research.html": {
    "title": "What PCS research is trying to establish.",
    "purpose": "People and AI models can propose results. PCS studies how separate checks can establish precisely what those results support.",
    "first_step": "Start with a bounded claim below, then follow the related evidence or technical architecture.",
    "scope": "Research goals are not all released capabilities. Mathematical truth, implementation correspondence and empirical validity are separate.",
    "kind": "research overview"
  },
  "researcher-pilots.html": {
    "title": "Help test a PCS scientific workflow.",
    "purpose": "Try to reproduce a result, expose a missed error, or identify an assumption that needs more evidence. Start with a small, agreed scope.",
    "first_step": "Choose a type of evaluation and agree on non-sensitive inputs and the expected checks.",
    "scope": "A pilot is an evaluation, not an endorsement. Private data and research agreements require separate arrangements.",
    "kind": "research collaboration guide"
  },
  "result-anatomy.html": {
    "title": "How to read a PCS result.",
    "purpose": "Read four separate answers: were the files intact, did the computation pass, was the formal evidence valid, and did the reviewer accept it?",
    "first_step": "Choose a result example, then inspect each answer and its explanation.",
    "scope": "A valid package can contain a failed claim. A supported calculation can still be rejected by a reviewer.",
    "kind": "result-reading guide"
  },
  "review-changes.html": {
    "title": "What changed since the last export?",
    "purpose": "Compare two CSV files. See added, removed and edited records, then check the changes against your rules. Your files stay on this device.",
    "first_step": "Choose the previous and new CSV exports, select their ID columns, then choose which values and changes matter.",
    "scope": "The result checks selected records and rules. It does not establish whether a changed value is scientifically correct.",
    "kind": "local file-review tool"
  },
  "reviewer-desk.html": {
    "title": "Review a contributed explanation.",
    "purpose": "Read a submitted explanation and check whether it accurately describes its evidence. Only eligible, independent reviewers can submit a decision.",
    "first_step": "Sign in with an eligible contributor account, then load the next review items.",
    "scope": "A structured game score does not validate prose. Two eligible, non-conflicting reviews are required before text enters the approved export.",
    "kind": "restricted review tool"
  },
  "roles.html": {
    "title": "Find an ongoing role.",
    "purpose": "Roles cover recurring responsibilities such as operations, communications, and community work. Apply for a role that matches your experience and availability.",
    "first_step": "Read an opening and its scope, then submit the requested application.",
    "scope": "A role does not reserve a research task or automatically grant scientific or administrative authority.",
    "kind": "participation guide"
  },
  "scientific-workflow-v2.html": {
    "title": "Explore real penguin measurements.",
    "purpose": "Compare penguin species and inspect individual observations. Then follow the source data, calculation, and recorded verification evidence.",
    "first_step": "Select a dot or a species to explore the data, then read the recorded check and its limits.",
    "scope": "The plot recalculates in the browser. The signed package results are recorded; no new Lean run or biological validation occurs here.",
    "kind": "real-data scientific explorer"
  },
  "semantic-audit.html": {
    "title": "Inspect examples of changed meaning.",
    "purpose": "Choose a translation example and see what its recorded test expected. The cases come from an archived Aristotle proof-development output.",
    "first_step": "Choose a translation change and compare the intended meaning with the recorded expectation.",
    "scope": "These are archived fixture expectations. This page does not execute Lean or independently establish a fresh verification verdict.",
    "kind": "archived research viewer"
  },
  "semantic-gauntlet.html": {
    "title": "Spot a change in meaning.",
    "purpose": "Change the facts and test whether a translation changes a rule.",
    "first_step": "Change facts in a small world, then test whether the translation changed the rule’s meaning.",
    "scope": "Agreement is limited to the displayed finite domain. Public evaluation families are inspectable, not a blind test.",
    "kind": "finite-logic game"
  },
  "semantic-multistep-lab.html": {
    "title": "Watch a repair search work.",
    "purpose": "Choose a case, run the search, and inspect what it found.",
    "first_step": "Choose a case and search budget, run the planner, then inspect the attempted edits.",
    "scope": "An exhausted budget means no repair was found within that search. It does not establish that a repair is impossible.",
    "kind": "bounded repair-search lab"
  },
  "semantic-repair-lab.html": {
    "title": "Repair a changed rule.",
    "purpose": "Try small edits and check whether the two rules agree.",
    "first_step": "Choose a case, try one edit, then check whether the source and candidate still disagree.",
    "scope": "The finite checker handles the registered worlds. It does not prove agreement in all structures or understand arbitrary English.",
    "kind": "finite repair lab"
  },
  "task-graph.html": {
    "title": "See which tasks need other work first.",
    "purpose": "Follow the arrows to see what a task needs before it can begin. Some tasks need every input; others need one of several alternatives.",
    "first_step": "Choose a program and a filter, then inspect a task and its incoming connections.",
    "scope": "The map shows declared dependencies and accepted outputs. It cannot establish connections that were never recorded.",
    "kind": "task map"
  },
  "tasks.html": {
    "title": "Find a task you can help with.",
    "purpose": "Browse work that PCS has explicitly marked as needed. Choose a task with a clear deliverable, review rule, and finish line.",
    "first_step": "Filter by time, skills and availability, then open a task to read its requirements.",
    "scope": "Only published needed work appears. Paid work requires explicit funding and written terms; applying does not guarantee acceptance.",
    "kind": "task marketplace"
  },
  "transport-workflow-v3.html": {
    "title": "Follow material moving between five compartments.",
    "purpose": "Watch a simulated amount move through connected compartments. Inspect the computation and the recorded evidence about what stays conserved.",
    "first_step": "Play or step through the simulation, then inspect the recorded verification and its open questions.",
    "scope": "The data is synthetic. The animation is a browser visualization; recorded package checks do not establish physical accuracy.",
    "kind": "synthetic scientific explorer"
  },
  "trust-explorer.html": {
    "title": "See what each kind of check establishes.",
    "purpose": "Compare mathematical proofs, executed software checks, and assumptions that still require trust. Each card explains one part of PCS.",
    "first_step": "Filter the cards, then read both the supported claim and its remaining limits.",
    "scope": "A green check is meaningful only for its stated question. These categories must not be treated as one blanket approval.",
    "kind": "trust guide"
  },
  "trust.html": {
    "title": "What can you rely on in PCS?",
    "purpose": "See which capabilities are released, which mathematical results are proved, which checks were executed, and what remains uncertain.",
    "first_step": "Start with the status summary, then follow the evidence for the feature you use.",
    "scope": "A proof about a mathematical statement does not prove its inputs describe reality or that a whole scientific study is valid.",
    "kind": "trust reference"
  },
  "usability-study.html": {
    "title": "Can you finish these tasks without help?",
    "purpose": "Try the file tools with practice data. This helps identify unclear steps. You can use PCS without taking part.",
    "first_step": "Read the optional recording explanation, consent only if you choose, and use the practice files for the tasks.",
    "scope": "Answers and times are unverified client records. Actual newcomer findings require separate observation and consent.",
    "kind": "optional file-tool study"
  },
  "validation-registry.html": {
    "title": "Browse the published validation cases.",
    "purpose": "Inspect the examples used to test PCS, including cases that should pass and cases that should fail.",
    "first_step": "Filter the list, then open a case and inspect its expected and recorded outcome.",
    "scope": "This page displays committed results. It does not rerun the checks or establish performance on every scientific workflow.",
    "kind": "recorded validation registry"
  },
  "validation.html": {
    "title": "What happened when PCS checked five real-data cases?",
    "purpose": "Three cases were expected to pass and two were deliberately expected to fail. The recorded checks matched all five expectations.",
    "first_step": "Read the five cases and their expected outcomes, then inspect the evidence or full registry.",
    "scope": "These results cover the stated cases and inputs. They are not a guarantee about every dataset, scientific conclusion or future run.",
    "kind": "recorded validation results"
  },
  "workboard.html": {
    "title": "Track your submitted work.",
    "purpose": "See whether your contribution is waiting for tests, review, evidence acceptance, or integration. Each step has a separate meaning.",
    "first_step": "Sign in, refresh your work, and open an item to see its next required action.",
    "scope": "Passing CI, approving a contribution and authorizing a scientific claim are separate decisions.",
    "kind": "contributor work tracker"
  },
  "world-builder.html": {
    "title": "Find where two rules disagree.",
    "purpose": "Learn to catch a changed rule. Build one example where the original and the rewrite give different answers.",
    "first_step": "Change one fact, such as whether a character has a key, then test the two rules.",
    "scope": "One disagreement demonstrates that the rewrite changed the meaning. It says nothing about a real AI’s behaviour.",
    "kind": "visual reasoning game"
  }
});
