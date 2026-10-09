/*!
 * cms-web-theme — light/dark toggle. Optional: css/cambridge-tokens.css
 * follows the OS on its own; this adds a button that overrides it and
 * remembers the choice.
 *
 * Load in <head>, without defer/async. The first half applies a saved choice
 * before first paint, which avoids a white flash on every page load.
 *
 *   <script src="cms-web-theme/js/cambridge-theme.js"></script>
 *
 * - Saved choice ("light"/"dark") -> <html data-theme>. None saved -> no
 *   attribute, so the OS keeps deciding, even if it changes while open.
 * - Wires every [data-cam-theme-toggle] button (.cam-theme-toggle): a click
 *   saves and applies the opposite of what's showing.
 * - Mirrors the effective theme to data-bs-theme, which the Bootstrap build
 *   keys on (it doesn't read the OS itself).
 * - Fires "cam-theme-change" on document, detail { theme }.
 *
 * Storage access is in try/catch: it throws with cookies blocked and in some
 * private modes, and not remembering isn't worth breaking the page.
 */
(function () {
  "use strict";

  var KEY = "cam-theme";
  var root = document.documentElement;
  var osDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function stored() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === "light" || v === "dark" ? v : null;
    } catch (e) {
      return null;
    }
  }

  function save(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (e) { /* applied for this page view, just not remembered */ }
  }

  // What's showing: the attribute if set, else the OS.
  function effective() {
    var attr = root.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") return attr;
    return osDark && osDark.matches ? "dark" : "light";
  }

  var last = null;
  function sync() {
    var theme = effective();
    root.setAttribute("data-bs-theme", theme);
    var buttons = document.querySelectorAll("[data-cam-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    }
    if (theme !== last) {
      last = theme;
      document.dispatchEvent(new CustomEvent("cam-theme-change", { detail: { theme: theme } }));
    }
  }

  function apply(theme) {
    if (theme) root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme");
    sync();
  }

  // 1. Before first paint: apply a saved choice.
  var saved = stored();
  if (saved) root.setAttribute("data-theme", saved);
  root.setAttribute("data-bs-theme", effective());

  // 2. Once the buttons exist: reveal and wire them.
  function ready() {
    var buttons = document.querySelectorAll("[data-cam-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].hidden = false;
      buttons[i].addEventListener("click", function () {
        var next = effective() === "dark" ? "light" : "dark";
        save(next);
        apply(next);
      });
    }
    sync();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ready);
  } else {
    ready();
  }

  // An OS change only matters while nothing is saved.
  if (osDark) {
    var onOs = function () { sync(); };
    if (osDark.addEventListener) osDark.addEventListener("change", onOs);
    else if (osDark.addListener) osDark.addListener(onOs); // Safari < 14
  }

  // Another tab changed the choice.
  window.addEventListener("storage", function (e) {
    if (e.key === KEY) apply(stored());
  });
})();
