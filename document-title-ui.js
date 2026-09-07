(function () {
  "use strict";

  const HEADING_TEXT = "Preencher dados";
  const TITLE_CLASS = "embrasca-document-type-title";
  const STYLE_ID = "embrasca-document-type-title-style";

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isIgnoredElement(element) {
    if (!element || !element.tagName) return true;

    const tagName = String(element.tagName).toUpperCase();
    return [
      "SCRIPT",
      "STYLE",
      "TEMPLATE",
      "NOSCRIPT",
      "LABEL",
      "BUTTON",
      "INPUT",
      "TEXTAREA",
      "SELECT",
      "OPTION",
    ].includes(tagName);
  }

  function findTitleParent(textNodes, heading) {
    let afterHeading = false;

    for (const node of textNodes) {
      if (!node) continue;

      if (
        heading &&
        typeof heading.contains === "function" &&
        heading.contains(node)
      ) {
        afterHeading = true;
        continue;
      }

      if (!afterHeading || !normalizeText(node.nodeValue)) continue;

      const parent = node.parentElement;
      if (isIgnoredElement(parent)) continue;

      if (
        parent &&
        typeof parent.closest === "function" &&
        parent.closest(
          "script,style,template,noscript,label,button,input,textarea,select,option",
        )
      ) {
        continue;
      }

      return parent || null;
    }

    return null;
  }

  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${TITLE_CLASS} {
        font-size: 22px !important;
        font-weight: 600 !important;
        line-height: 1.35 !important;
        margin-top: 10px !important;
        margin-bottom: 16px !important;
        overflow-wrap: anywhere;
      }
    `;
    doc.head.appendChild(style);
  }

  function findHeading(doc) {
    return (
      Array.from(doc.querySelectorAll("h1,h2,h3,[role='heading']")).find(
        (element) => normalizeText(element.textContent) === HEADING_TEXT,
      ) || null
    );
  }

  function apply(doc) {
    const heading = findHeading(doc);
    if (!heading) return null;

    const root = heading.closest("main") || doc.body;
    if (!root) return null;

    const nodeFilter =
      doc.defaultView && doc.defaultView.NodeFilter
        ? doc.defaultView.NodeFilter
        : typeof NodeFilter !== "undefined"
          ? NodeFilter
          : null;

    if (!nodeFilter) return null;

    const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;

    while ((node = walker.nextNode())) {
      textNodes.push(node);
    }

    const target = findTitleParent(textNodes, heading);
    if (!target) return null;

    for (const previous of doc.querySelectorAll(`.${TITLE_CLASS}`)) {
      if (previous !== target) previous.classList.remove(TITLE_CLASS);
    }

    target.classList.add(TITLE_CLASS);
    return target;
  }

  function start(doc) {
    ensureStyle(doc);

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;

      setTimeout(() => {
        scheduled = false;
        apply(doc);
      }, 0);
    };

    schedule();

    const Observer =
      doc.defaultView && doc.defaultView.MutationObserver
        ? doc.defaultView.MutationObserver
        : typeof MutationObserver !== "undefined"
          ? MutationObserver
          : null;

    if (!Observer || !doc.body) return null;

    const observer = new Observer(schedule);
    observer.observe(doc.body, { childList: true, subtree: true });
    return observer;
  }

  const api = {
    normalizeText,
    findTitleParent,
    apply,
    start,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  if (typeof window !== "undefined" && window.document) {
    if (window.document.readyState === "loading") {
      window.document.addEventListener(
        "DOMContentLoaded",
        () => start(window.document),
        { once: true },
      );
    } else {
      start(window.document);
    }
  }
})();
