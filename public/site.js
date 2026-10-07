(() => {
  "use strict";

  document.documentElement.classList.add("js");

  // One predictable site-wide map. The original HTML links remain a no-JS fallback.
  // Navigation labels reflect sessions; authorization always remains on the server.
  const accountLinks = [];
  const adminLinks = [];
  const currentPath = location.pathname.split("/").pop() || "index.html";
  const matchPage = (href) => href.split("#")[0].split("?")[0] === currentPath;

  document.querySelectorAll(".navlinks").forEach((links) => {
    links.classList.add("pcs-global-nav");
    links.closest("nav")?.classList.add("pcs-nav-ready");
    links.replaceChildren();

    const addLink = (parent, href, label, className = "") => {
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.textContent = label;
      if (className) anchor.className = className;
      if (matchPage(href)) anchor.setAttribute("aria-current", "page");
      parent.appendChild(anchor);
      return anchor;
    };
    const addMenu = (title, sections, ariaLabel = title) => {
      const details = document.createElement("details");
      details.className = "navmore";
      const summary = document.createElement("summary");
      summary.appendChild(document.createTextNode(title + " "));
      const arrow = document.createElement("span");
      arrow.setAttribute("aria-hidden", "true");
      arrow.textContent = "⌄";
      summary.appendChild(arrow);
      summary.setAttribute("aria-label", ariaLabel);
      const menu = document.createElement("div");
      menu.className = "navmore-menu";
      for (const section of sections) {
        if (section.heading) {
          const heading = document.createElement("span");
          heading.className = "navmore-heading";
          heading.textContent = section.heading;
          menu.appendChild(heading);
        }
        for (const item of section.links) addLink(menu, item[0], item[1]);
      }
      details.append(summary, menu);
      links.appendChild(details);
      if (details.querySelector('[aria-current="page"]')) details.classList.add("current");
      details.addEventListener("toggle", () => {
        if (details.open) links.querySelectorAll(".navmore").forEach((other) => {
          if (other !== details) other.open = false;
        });
      });
      details.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { details.open = false; summary.focus(); }
      });
      return details;
    };

    addLink(links, "experience.html", "Start here", "nav-primary-link");
    addLink(links, "arena.html", "Play Arena", "nav-find-work");

    addMenu("Get involved", [
      {heading:"LEARN BY PLAYING",links:[
        ["arena-proof-quest.html","Proof Quest · beginner logic game"],
        ["arena-safety-forge.html","Safety Forge · build AI-safety shields"],
        ["forge-duel.html","Shield Duel · blind policy tournament"],
        ["arena.html","Arena / community challenges"]
      ]},
      {heading:"FIND YOUR PLACE",links:[
        ["commons.html","Commons overview"],
        ["contribute.html","Start contributing · L0+"],
        ["tasks.html","Needed tasks"],
        ["roles.html","Ongoing roles"],
        ["experience.html","New here? Two-minute tour"]
      ]},
      {heading:"SEE THE BIG PICTURE",links:[
        ["task-graph.html","Task dependency graph"],
        ["projects.html","Assurance projects"],
        ["contributors.html","Contributors"]
      ]}
    ]);
    addMenu("Use PCS", [
      {heading:"START WITH AN EXAMPLE",links:[
        ["experience.html","Start here · guided interactive tour"],
        ["research-preview.html","Editable scientific checks · no login"],
        ["guided-submission.html","Guided submission"],
        ["package-inspector.html","Inspect a PCS package"],
        ["result-anatomy.html","Understand verification results"]
      ]},
      {heading:"CHECK, REPRODUCE, UNDERSTAND",links:[
        ["claim-review.html","Claim & obligation review"],
        ["researcher-pilots.html","Independent researcher pilots"],
        ["trust.html","Trust Center"],
        ["validation.html","Validation evidence"],
        ["project-builder.html","Advanced Project Mapper"],
        ["mvp.html","v0.6 verifier"],
        ["demo.html","Live verifier"],
        ["trust-explorer.html","Trust explorer"]
      ]}
    ]);
    // Additional pathways are collected in one place, not scattered across every header.
    const secondaryHrefs = [
      ["index.html#product","Product overview"],
      ["architecture.html","Architecture"],
      ["research.html","Research"],
      ["organizations.html","For organizations"],
      ["governance.html","Governance"],
      ["fund.html","Funding and support"],
      ["model-lab.html","Model Lab"],
      ["intake.html","Pilot intake"],
      ["validation-registry.html","Validation registry"],
      ["contact.html","Contact"],
      ["privacy.html","Privacy"]
    ];
    addMenu("About", [
      {heading:"PCS & RESEARCH",links:secondaryHrefs.slice(0,3)},
      {heading:"PARTICIPATION",links:secondaryHrefs.slice(3,7)},
      {heading:"MORE PCS RESOURCES",links:secondaryHrefs.slice(7)}
    ], "More PCS resources");

    const quickButton=document.createElement("button");
    quickButton.type="button";quickButton.className="nav-quickfind";
    quickButton.setAttribute("aria-label","Find a PCS page");
    quickButton.textContent="⌕ Find page";
    quickButton.addEventListener("click",()=>openQuick());
    links.appendChild(quickButton);
    const account = addLink(links, "account.html", "Account sign in", "nav-account-entry");
    const admin = addLink(links, "admin-login.html", "Admin sign in", "nav-admin-entry");
    accountLinks.push(account);
    adminLinks.push(admin);

    document.addEventListener("click", (event) => {
      links.querySelectorAll(".navmore").forEach((menu) => {
        if (menu.open && !menu.contains(event.target)) menu.open = false;
      });
    });
  });

  // Browse the actual site map without sending a search query to any server.
  // An offline-first command palette works on desktop, keyboard and mobile.
  const siteShortcuts=[
    ["Start here","experience.html","A two-minute interactive tour","Explore"],
    ["Safety Forge","arena-safety-forge.html","Build and check toy AI safety shields","Play"],
    ["Shield Duel","forge-duel.html","Blind AI policy decisions, human reason tags and checked outcomes","Play"],
    ["Proof Quest","arena-proof-quest.html","Learn prerequisite logic through puzzles","Play"],
    ["PCS Arena","arena.html","Games and research challenges","Play"],
    ["Research preview","research-preview.html","Editable local AI and science checks","Try PCS"],
    ["Guided submission","guided-submission.html?demo=1","Project to evidence, step by step","Try PCS"],
    ["Package inspector","package-inspector.html","Open and inspect a PCS package","Try PCS"],
    ["Verification results","result-anatomy.html","Understand every result layer","Try PCS"],
    ["Project mapper","project-builder.html","Discover candidate claims in your own files","Try PCS"],
    ["v0.6 verifier","mvp.html","Command-line package verification workflow","Try PCS"],
    ["Legacy threat lab","demo.html","Frozen v0.5 adversarial parity simulation","Try PCS"],
    ["Needed tasks","tasks.html","Live, curated volunteer work","Get involved"],
    ["Contributor roles","roles.html","Longer-term responsibilities","Get involved"],
    ["Contribute","contribute.html","Join as a new contributor","Get involved"],
    ["Task dependency map","task-graph.html","Understand task ordering and blockers","Get involved"],
    ["Commons overview","commons.html","What the community is building","Get involved"],
    ["Independent pilots","researcher-pilots.html","Pilot studies and claims to reproduce","Research"],
    ["Trust Center","trust.html","Assumptions and external boundaries","Research"],
    ["Trust Explorer","trust-explorer.html","Inspect exact trust boundaries","Research"],
    ["Validation","validation.html","Evidence for published testing claims","Research"],
    ["Validation registry","validation-registry.html","Find individually documented validation","Research"],
    ["Architecture","architecture.html","Technical design of PCS","Research"],
    ["AI safety research","research.html","Projects and research program","Research"],
    ["Governance","governance.html","How assurance decisions are governed","About"],
    ["Organizations","organizations.html","How labs can run a pilot","About"],
    ["Support PCS","fund.html","Funding and public-good contributions","About"],
    ["Privacy","privacy.html","Gameplay research consent and deletion","About"],
    ["Contact","contact.html","Get in touch","About"],
    ["My account","account.html","Dashboard, applications and settings","Account"],
    ["Admin sign in","admin-login.html","Separate privileged administration","Account"]
  ];
  const quick=document.createElement("dialog");quick.id="pcsQuickFind";quick.className="pcs-quick-dialog";
  quick.setAttribute("aria-labelledby","pcsQuickTitle");
  const quickHeader=document.createElement("div");quickHeader.className="pcs-quick-header";
  const quickTitle=document.createElement("h2");quickTitle.id="pcsQuickTitle";quickTitle.textContent="Find your place in PCS";
  const quickClose=document.createElement("button");quickClose.type="button";quickClose.className="pcs-quick-close";
  quickClose.setAttribute("aria-label","Close page finder");quickClose.textContent="✕";
  quickClose.addEventListener("click",()=>quick.close());
  quickHeader.append(quickTitle,quickClose);
  const quickSearch=document.createElement("input");quickSearch.type="search";quickSearch.id="pcsQuickInput";
  quickSearch.placeholder="Search pages, topics, or activities…";
  quickSearch.setAttribute("aria-label","Search PCS pages");
  const quickResults=document.createElement("div");quickResults.id="pcsQuickResults";
  quickResults.className="pcs-quick-results";quickResults.setAttribute("aria-live","polite");
  const quickHelp=document.createElement("p");quickHelp.className="pcs-quick-help";
  quickHelp.textContent="Press / or Ctrl/⌘+K anywhere to open. Arrow keys select a page. All results are local site links.";
  quick.append(quickHeader,quickSearch,quickResults,quickHelp);
  document.body.appendChild(quick);
  const renderQuick=()=>{
    quickResults.replaceChildren();
    const query=quickSearch.value.trim().toLowerCase();
    const ranked=siteShortcuts.filter(x=>(x[0]+" "+x[2]+" "+x[3]).toLowerCase().includes(query)).slice(0,18);
    for(const [title,href,description,group] of ranked){
      const anchor=document.createElement("a");anchor.href=href;anchor.className="pcs-quick-item";
      const name=document.createElement("strong");name.textContent=title;
      const detail=document.createElement("small");detail.textContent=description;
      const category=document.createElement("span");category.textContent=group;
      const main=document.createElement("div");main.append(name,detail);anchor.append(main,category);
      quickResults.appendChild(anchor);
    }
    if(!ranked.length){const p=document.createElement("p");p.textContent="No matching pages. Try 'game', 'verify', 'task', or 'trust'.";quickResults.appendChild(p);}
  };
  const openQuick=()=>{
    if(!quick.open){quickSearch.value="";renderQuick();quick.showModal();}
    quickSearch.focus();
  };
  quickSearch.addEventListener("input",renderQuick);
  quickSearch.addEventListener("keydown",event=>{
    const links=[...quickResults.querySelectorAll("a")];
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();
      if(links.length)(event.key==="ArrowDown"?links[0]:links.at(-1)).focus();
    }else if(event.key==="Enter"&&links.length){event.preventDefault();links[0].click();}
  });
  quickResults.addEventListener("keydown",event=>{
    const links=[...quickResults.querySelectorAll("a")],current=links.indexOf(document.activeElement);
    if(current<0)return;
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();links[(current+(event.key==="ArrowDown"?1:-1)+links.length)%links.length].focus();
    }else if(event.key==="Escape"){quick.close();}
  });
  quick.addEventListener("click",event=>{if(event.target===quick)quick.close();});
  document.addEventListener("keydown",event=>{
    const target=event.target;
    const typing=target?.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(target?.tagName);
    if((event.key==="k"&&(event.metaKey||event.ctrlKey))||(event.key==="/"&&!typing&&!event.altKey&&!event.metaKey&&!event.ctrlKey)){
      event.preventDefault();openQuick();
    }
  });

  // Native, accessible breadcrumbs help readers return to the right collection.
  const breadcrumbParents={
    "experience.html":["Start here"],
    "arena.html":["Play Arena"],"arena-proof-quest.html":["Play Arena","Proof Quest"],
    "arena-safety-forge.html":["Play Arena","Safety Forge"],
    "guided-submission.html":["Use PCS","Guided submission"],
    "research-preview.html":["Use PCS","Research preview"],
    "result-anatomy.html":["Use PCS","Verification results"],
    "package-inspector.html":["Use PCS","Package inspector"],
    "project-builder.html":["Use PCS","Project mapper"],
    "mvp.html":["Use PCS","v0.6 verifier"],
    "tasks.html":["Get involved","Needed tasks"],"roles.html":["Get involved","Roles"],
    "task-graph.html":["Get involved","Task dependencies"],
    "trust.html":["Research","Trust Center"],"validation.html":["Research","Validation"]
  };
  const labels=breadcrumbParents[currentPath],main=document.querySelector("main");
  if(labels&&main){
    const crumb=document.createElement("nav");crumb.className="pcs-crumbs";crumb.setAttribute("aria-label","Breadcrumb");
    const ol=document.createElement("ol");
    const home=document.createElement("a");home.href="index.html";home.textContent="Home";
    const first=document.createElement("li");first.appendChild(home);ol.appendChild(first);
    labels.forEach((label,index)=>{
      const li=document.createElement("li");
      if(index===labels.length-1){const span=document.createElement("span");span.setAttribute("aria-current","page");span.textContent=label;li.appendChild(span);}
      else{const a=document.createElement("a");a.href=label==="Play Arena"?"arena.html":label==="Use PCS"?"experience.html":label==="Get involved"?"commons.html":"research.html";a.textContent=label;li.appendChild(a);}
      ol.appendChild(li);
    });
    crumb.appendChild(ol);main.prepend(crumb);
  }

  // Two independent sessions: an ordinary L0–L6 account is not admin authority.
  // Default links remain usable if the status endpoints are offline.
  const readSession = async (path) => {
    if (path !== "/api/me" && path !== "/api/admin/session") return null;
    try {
      const response = await fetch(path, {credentials:"same-origin",cache:"no-store"});
      return response.ok ? await response.json() : null;
    } catch (_) { return null; }
  };
  if (accountLinks.length || adminLinks.length) {
    Promise.all([readSession("/api/me"), readSession("/api/admin/session")]).then(([me, admin]) => {
      if (me?.authenticated && me.user) {
        const level = Number(me.user.display_level ?? me.user.level);
        accountLinks.forEach((link) => {
          link.textContent = Number.isFinite(level) ? "My dashboard · L" + level : "My dashboard";
          link.title = "Your contributor profile, eligibility, tasks and notifications";
        });
      }
      if (admin?.authenticated) {
        adminLinks.forEach((link) => {
          link.href = "admin.html";
          link.textContent = "Admin Center";
          link.title = "Open your separately authenticated Admin Center";
          if (currentPath === "admin.html") link.setAttribute("aria-current", "page");
        });
      }
    });
  }

  document.querySelectorAll("nav").forEach((nav) => {
    const links = nav.querySelector(".navlinks");
    if (!links) return;

    const button = document.createElement("button");
    button.className = "navtoggle";
    button.type = "button";
    button.setAttribute("aria-label", "Open navigation");
    button.setAttribute("aria-expanded", "false");
    button.innerHTML = '<span></span><span></span><span></span>';
    nav.insertBefore(button, links);

    const close = () => {
      links.classList.remove("open");
      button.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Open navigation");
      const more = links.querySelector(".navmore");
      if (more) more.open = false;
    };

    button.addEventListener("click", () => {
      const open = !links.classList.contains("open");
      links.classList.toggle("open", open);
      button.classList.toggle("open", open);
      button.setAttribute("aria-expanded", String(open));
      button.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    });

    links.addEventListener("click", (event) => {
      if (event.target.closest("a")) close();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) close();
    });
  });

  document.querySelectorAll(".tabs").forEach((tablist, listIndex) => {
    tablist.setAttribute("role", "tablist");
    const tabs = [...tablist.querySelectorAll(".tab")];
    tabs.forEach((tab, tabIndex) => {
      const key = tab.dataset.tab;
      const panel = key ? document.getElementById("tab-" + key) : null;
      if (!tab.id) tab.id = `tab-${listIndex}-${tabIndex}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", tab.classList.contains("active") ? "true" : "false");
      if (panel) {
        tab.setAttribute("aria-controls", panel.id);
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tab.id);
      }
      tab.addEventListener("click", () => {
        tabs.forEach((other) => other.setAttribute("aria-selected", other === tab ? "true" : "false"));
      });
      tab.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        let next = tabIndex;
        if (event.key === "ArrowLeft") next = (tabIndex - 1 + tabs.length) % tabs.length;
        if (event.key === "ArrowRight") next = (tabIndex + 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        tabs[next].focus();
        tabs[next].click();
      });
    });
  });

  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.getAttribute("data-copy") || "";
      const original = button.textContent;
      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "Copied";
      } catch {
        button.textContent = "Copy unavailable";
      }
      window.setTimeout(() => { button.textContent = original; }, 1400);
    });
  });
  const analyticsHost = "proof-carrying-science-site.marenatommaso.workers.dev";
  if (location.hostname === analyticsHost && !document.querySelector('script[data-pcs-web-analytics]')) {
    const beacon = document.createElement("script");
    beacon.type = "module";
    beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
    beacon.dataset.cfBeacon = JSON.stringify({token: "ea09d5072ce041ea893b5e0092815294"});
    beacon.dataset.pcsWebAnalytics = "true";
    document.head.appendChild(beacon);
  }
})();
