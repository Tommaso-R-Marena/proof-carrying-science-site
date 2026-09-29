(() => {
  "use strict";

  document.documentElement.classList.add("js");

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
})();
