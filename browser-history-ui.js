(function () {
  "use strict";

  const STATE_KEY = "embrascaJuridicoView";
  const DEFAULT_VIEW = "Dashboard";
  const NAV_ITEMS = [
    "Dashboard",
    "Gerar documento",
    "Documentos",
    "Revisões",
    "Modelos Jurídicos",
    "Configurações",
    "Administração",
  ];

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function canonicalView(value) {
    const normalized = normalizeText(value).toLocaleLowerCase("pt-BR");
    return (
      NAV_ITEMS.find(
        (item) => item.toLocaleLowerCase("pt-BR") === normalized,
      ) || null
    );
  }

  function mapHeadingToView(value) {
    const text = normalizeText(value);
    if (text.toLocaleLowerCase("pt-BR") === "preencher dados") {
      return "Gerar documento";
    }
    return canonicalView(text);
  }

  function stateView(state) {
    if (!state || typeof state !== "object") return null;
    return canonicalView(state[STATE_KEY]);
  }

  function withViewState(state, view) {
    const base = state && typeof state === "object" ? state : {};
    return { ...base, [STATE_KEY]: view };
  }

  function createHistoryManager({ history, location, restoreView }) {
    if (!history || !location || typeof restoreView !== "function") {
      throw new Error("Dependências de histórico inválidas.");
    }

    function ensureInitialState(initialView = DEFAULT_VIEW) {
      const current = stateView(history.state);
      if (current) return current;

      const view = canonicalView(initialView) || DEFAULT_VIEW;
      history.replaceState(
        withViewState(history.state, view),
        "",
        location.href,
      );
      return view;
    }

    function recordView(viewName) {
      const view = canonicalView(viewName);
      if (!view) return false;

      if (stateView(history.state) === view) return false;

      history.pushState(
        withViewState(history.state, view),
        "",
        location.href,
      );
      return true;
    }

    function handlePopState(event) {
      const view = stateView(event && event.state);
      if (!view) return false;
      restoreView(view);
      return true;
    }

    return {
      ensureInitialState,
      recordView,
      handlePopState,
    };
  }

  function getNavigationRoots(doc) {
    const roots = Array.from(
      doc.querySelectorAll("aside,nav,[role='navigation']"),
    );
    return roots.length ? roots : [doc.body];
  }

  function elementForView(doc, viewName) {
    const view = canonicalView(viewName);
    if (!view) return null;

    for (const root of getNavigationRoots(doc)) {
      if (!root) continue;
      const elements = [root, ...Array.from(root.querySelectorAll("*"))];
      const exact = elements.find(
        (element) => normalizeText(element.textContent) === view,
      );
      if (!exact) continue;

      return (
        exact.closest(
          "a,button,[role='button'],[data-view],[data-page],[onclick]",
        ) || exact
      );
    }

    return null;
  }

  function viewFromClickTarget(target, doc) {
    if (!target || !doc) return null;

    let element = target.nodeType === 3 ? target.parentElement : target;
    while (element && element !== doc.body) {
      const view = canonicalView(element.textContent);
      if (view) return view;
      element = element.parentElement;
    }
    return null;
  }

  function detectView(doc) {
    const current = doc.querySelector(
      "[aria-current='page'],[aria-selected='true']",
    );
    if (current) {
      const activeView = canonicalView(current.textContent);
      if (activeView) return activeView;
    }

    const headings = Array.from(
      doc.querySelectorAll(
        "main h1,main h2,main h3,#app h1,#app h2,#app h3,h1,h2,h3,[role='heading']",
      ),
    );

    for (const heading of headings) {
      const view = mapHeadingToView(heading.textContent);
      if (view) return view;
    }

    return null;
  }

  function start(doc, win) {
    let restoring = false;
    let syncScheduled = false;

    const manager = createHistoryManager({
      history: win.history,
      location: win.location,
      restoreView(view) {
        const target = elementForView(doc, view);
        if (!target || typeof target.click !== "function") return;

        restoring = true;
        target.click();
        win.setTimeout(() => {
          restoring = false;
        }, 0);
      },
    });

    manager.ensureInitialState(DEFAULT_VIEW);

    function syncDetectedView() {
      if (restoring) return;
      const view = detectView(doc);
      if (view) manager.recordView(view);
    }

    function scheduleSync() {
      if (syncScheduled) return;
      syncScheduled = true;
      win.setTimeout(() => {
        syncScheduled = false;
        syncDetectedView();
      }, 0);
    }

    doc.addEventListener("click", (event) => {
      if (restoring) return;
      const view = viewFromClickTarget(event.target, doc);
      if (view) manager.recordView(view);
    });

    win.addEventListener("popstate", (event) => {
      manager.handlePopState(event);
    });

    if (typeof win.MutationObserver === "function" && doc.body) {
      const observer = new win.MutationObserver(scheduleSync);
      observer.observe(doc.body, { childList: true, subtree: true });
    }

    scheduleSync();
    return manager;
  }

  const api = {
    STATE_KEY,
    DEFAULT_VIEW,
    NAV_ITEMS,
    normalizeText,
    mapHeadingToView,
    createHistoryManager,
    detectView,
    elementForView,
    viewFromClickTarget,
    start,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined" && window.document) {
    const boot = () => start(window.document, window);
    if (window.document.readyState === "loading") {
      window.document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
})();
