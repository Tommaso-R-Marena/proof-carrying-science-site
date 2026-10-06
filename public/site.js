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

    addLink(links, "research-preview.html", "Try PCS", "nav-primary-link");
    addLink(links, "tasks.html", "Find work", "nav-find-work");

    addMenu("Contribute", [
      {heading:"FIND YOUR PLACE",links:[
        ["commons.html","Commons overview"],
        ["contribute.html","Start contributing · L0+"],
        ["tasks.html","Needed tasks"],
        ["roles.html","Ongoing roles"],
        ["arena.html","PCS Arena challenges"]
      ]},
      {heading:"SEE THE BIG PICTURE",links:[
        ["task-graph.html","Task dependency graph"],
        ["projects.html","Assurance projects"],
        ["contributors.html","Contributors"]
      ]}
    ]);
    addMenu("Verify", [
      {heading:"GET STARTED",links:[
        ["research-preview.html","Research preview · no login"],
        ["guided-submission.html","Guided submission"],
        ["package-inspector.html","Inspect a PCS package"],
        ["result-anatomy.html","Understand verification results"]
      ]},
      {heading:"ADVANCED",links:[
        ["claim-review.html","Claim & obligation review"],
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

  // Two independent sessions: an ordinary L0–L6 account is not admin authority.
  // Default links remain usable if the status endpoints are offline.
  const readSession = async (path) => {
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
