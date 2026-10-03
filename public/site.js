(() => {
  "use strict";

  document.documentElement.classList.add("js");

  document.querySelectorAll(".navlinks").forEach((links) => {
    const directLinks = () => [...links.querySelectorAll(":scope > a")];
    const guided = directLinks().find((a) => (a.getAttribute("href") || "").split("?")[0] === "guided-submission.html");
    if (guided) {
      guided.textContent = "Try PCS";
      guided.classList.add("nav-primary-link");
    } else {
      const tryLink = document.createElement("a");
      tryLink.href = "guided-submission.html";
      tryLink.textContent = "Try PCS";
      tryLink.className = "nav-primary-link";
      links.insertBefore(tryLink, links.firstChild);
    }

    if (!directLinks().some((a) => (a.getAttribute("href") || "").split("?")[0] === "package-inspector.html")) {
      const inspectLink = document.createElement("a");
      inspectLink.href = "package-inspector.html";
      inspectLink.textContent = "Inspect package";
      const tryLink = directLinks().find((a) => (a.getAttribute("href") || "").split("?")[0] === "guided-submission.html");
      if (tryLink && tryLink.nextSibling) links.insertBefore(inspectLink, tryLink.nextSibling);
      else links.insertBefore(inspectLink, links.firstChild);
    }

    const mapperLink = directLinks().find((a) => (a.getAttribute("href") || "").split("?")[0] === "project-builder.html");
    if (mapperLink && /Project Mapper/i.test(mapperLink.textContent || "")) {
      mapperLink.textContent = "Advanced Mapper";
    }

    const secondaryHrefs = new Set([
      "validation.html",
      "architecture.html",
      "mvp.html",
      "project-builder.html",
      "demo.html",
      "model-lab.html",
      "intake.html",
      "privacy.html"
    ]);
    const secondaryLinks = directLinks().filter((a) => secondaryHrefs.has((a.getAttribute("href") || "").split("?")[0]));
    if (secondaryLinks.length) {
      const more = document.createElement("details");
      more.className = "navmore";
      const summary = document.createElement("summary");
      summary.innerHTML = 'More <span aria-hidden="true">⌄</span>';
      summary.setAttribute("aria-label", "More PCS resources");
      const menu = document.createElement("div");
      menu.className = "navmore-menu";
      secondaryLinks.forEach((a) => menu.appendChild(a));
      more.append(summary, menu);
      const contact = directLinks().find((a) => a.classList.contains("button"));
      links.insertBefore(more, contact || null);

      document.addEventListener("click", (event) => {
        if (more.open && !more.contains(event.target)) more.open = false;
      });
      more.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          more.open = false;
          summary.focus();
        }
      });
    }

    const currentPath = location.pathname.split("/").pop() || "index.html";
    links.querySelectorAll("a[href]").forEach((a) => {
      const raw = a.getAttribute("href") || "";
      if (!raw || raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("http")) return;
      const targetPath = raw.split("#")[0].split("?")[0] || "index.html";
      if (targetPath === currentPath) a.setAttribute("aria-current", "page");
    });
    const more = links.querySelector(".navmore");
    if (more?.querySelector('[aria-current="page"]')) more.classList.add("current");
  });

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
