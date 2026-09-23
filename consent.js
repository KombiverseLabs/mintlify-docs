/**
 * Minimal cookie-consent banner for docs.kombify.io.
 *
 * Mintlify includes every root-level `.js` file on every page, so this
 * script needs no wiring beyond `docs.json`'s `integrations.cookies` key,
 * which points Mintlify's own PostHog telemetry at the same localStorage
 * key/value this banner writes (`kombify_analytics_consent` = "accepted").
 * Mintlify fails closed: a first-time visitor has no key set, so telemetry
 * stays off until they choose. This mirrors the consent-key convention
 * already used by kombify.io and the kombify Blog
 * (`kombify_analytics_consent` / `posthog_consent`), though localStorage is
 * not shared across those origins.
 *
 * Accept and Reject are equally prominent (same size/weight), the choice is
 * stored, and the footer's "Cookie settings" link (`#kombify-cookie-settings`)
 * reopens the banner so a visitor can change their mind.
 */
(function () {
  "use strict";

  var CONSENT_KEY = "kombify_analytics_consent";
  var ACCEPTED = "accepted";
  var REJECTED = "rejected";
  var REOPEN_HASH = "#kombify-cookie-settings";
  var BANNER_ID = "kombify-cookie-banner";

  function currentConsent() {
    try {
      return window.localStorage.getItem(CONSENT_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeConsent(value) {
    try {
      window.localStorage.setItem(CONSENT_KEY, value);
    } catch (e) {
      /* localStorage unavailable (private mode, etc.) — banner just re-shows next visit */
    }
  }

  function removeBanner() {
    var el = document.getElementById(BANNER_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function showBanner() {
    removeBanner();

    var banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-live", "polite");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.style.cssText =
      "position:fixed;right:16px;bottom:16px;left:16px;z-index:2147483000;" +
      "max-width:340px;margin-left:auto;background:#111318;color:#f4f3ef;" +
      "border:1px solid rgba(255,255,255,0.12);border-radius:12px;" +
      "box-shadow:0 12px 32px rgba(0,0,0,0.35);padding:18px;" +
      "font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;";

    var text = document.createElement("p");
    text.style.cssText = "margin:0 0 14px;";
    text.textContent =
      "We use optional product analytics (PostHog, EU-hosted) to improve these docs. " +
      "Nothing runs until you accept.";
    banner.appendChild(text);

    var link = document.createElement("a");
    link.href = "https://kombify.io/cookies";
    link.textContent = "Learn more";
    link.style.cssText = "display:inline-block;margin-bottom:14px;color:#818CF8;";
    banner.appendChild(link);

    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;";

    var buttonStyle =
      "flex:1;padding:9px 12px;border-radius:8px;border:1px solid rgba(255,255,255,0.18);" +
      "background:transparent;color:#f4f3ef;font:inherit;font-weight:600;cursor:pointer;";

    var reject = document.createElement("button");
    reject.type = "button";
    reject.textContent = "Reject";
    reject.style.cssText = buttonStyle;
    reject.addEventListener("click", function () {
      storeConsent(REJECTED);
      removeBanner();
    });

    var accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = "Accept";
    accept.style.cssText = buttonStyle + "background:#6366F1;border-color:#6366F1;";
    accept.addEventListener("click", function () {
      storeConsent(ACCEPTED);
      removeBanner();
      // Reload once so Mintlify's telemetry check (which reads this key at
      // page load) can pick up the freshly granted consent.
      window.location.reload();
    });

    row.appendChild(reject);
    row.appendChild(accept);
    banner.appendChild(row);

    document.body.appendChild(banner);
  }

  function maybeShowOnLoad() {
    if (!currentConsent()) showBanner();
  }

  function isReopenLink(target) {
    var anchor = target.closest ? target.closest("a[href]") : null;
    if (!anchor) return false;
    var href = anchor.getAttribute("href") || "";
    return href === REOPEN_HASH || href.indexOf(REOPEN_HASH) !== -1;
  }

  document.addEventListener("click", function (event) {
    if (isReopenLink(event.target)) {
      event.preventDefault();
      showBanner();
    }
  });

  if (window.location.hash === REOPEN_HASH) showBanner();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", maybeShowOnLoad);
  } else {
    maybeShowOnLoad();
  }
})();
