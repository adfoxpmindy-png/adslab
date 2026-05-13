/* AdsLab Event SDK — fires Meta Pixel events from configured rules.
 *
 * Install:
 *   <script>
 *     (function(w,k){w._adslab=k;var s=document.createElement('script');
 *     s.async=1;s.src='https://ads-lab.xyz/sdk.js?k='+k;
 *     document.head.appendChild(s);})(window,'<SITE_KEY>');
 *   </script>
 *
 * After load:
 *   1. Fetch rule config for this siteKey
 *   2. Inject Meta Pixel base code + init for the configured Pixel
 *   3. Wire triggers: url / click / form_submit / scroll / time_on_page
 *   4. Each fire: fbq('track', name, params, {eventID}) + POST CAPI relay
 *
 * No build step — vanilla ES2018. Keep small (target <10KB pre-gzip).
 */
(function () {
  "use strict";

  // ---- Boot ----------------------------------------------------------

  var SDK_ORIGIN = (function () {
    try {
      var script = document.currentScript;
      if (script && script.src) {
        var u = new URL(script.src);
        return u.origin;
      }
    } catch (e) {}
    return "";
  })();

  function getSiteKey() {
    if (window._adslab) return String(window._adslab);
    try {
      var script = document.currentScript;
      if (script && script.src) {
        var u = new URL(script.src);
        return u.searchParams.get("k") || "";
      }
    } catch (e) {}
    return "";
  }

  var siteKey = getSiteKey();
  if (!siteKey) {
    return console && console.warn && console.warn("[adslab] no siteKey");
  }

  var state = {
    pixelId: null,
    rules: [],
    firedOnce: Object.create(null), // ruleId → bool (for "once" rules)
    scrollMax: 0,
    pageLoadedAt: Date.now(),
  };

  // ---- Meta Pixel base (minified verbatim from Meta's official) ----

  function ensureFbq() {
    if (window.fbq) return;
    var n = (window.fbq = function () {
      n.callMethod
        ? n.callMethod.apply(n, arguments)
        : n.queue.push(arguments);
    });
    if (!window._fbq) window._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    var t = document.createElement("script");
    t.async = true;
    t.src = "https://connect.facebook.net/en_US/fbevents.js";
    var s = document.getElementsByTagName("script")[0];
    if (s && s.parentNode) s.parentNode.insertBefore(t, s);
  }

  // ---- Config fetch + init ------------------------------------------

  function fetchConfig() {
    return fetch(SDK_ORIGIN + "/api/event-sdk/config/" + encodeURIComponent(siteKey), {
      method: "GET",
      credentials: "omit",
    })
      .then(function (r) {
        if (!r.ok) throw new Error("config " + r.status);
        return r.json();
      })
      .catch(function (err) {
        console && console.warn && console.warn("[adslab] config fetch failed", err);
        return null;
      });
  }

  function init(cfg) {
    if (!cfg || !cfg.pixelId) return;
    state.pixelId = cfg.pixelId;
    state.rules = cfg.rules || [];

    ensureFbq();
    window.fbq("init", cfg.pixelId);

    // PageView: fire BOTH browser-side (fbq) and server-side (CAPI)
    // with the same event_id so Meta dedupes. CAPI ensures the
    // PageView is counted even when the browser-side Pixel is blocked
    // by ad blockers or iOS 14 ATT — the whole point of having CAPI.
    var pageViewId = generateEventId();
    try {
      window.fbq("track", "PageView", {}, { eventID: pageViewId });
    } catch (e) {}
    sendCapi(
      { id: "__sdk_pageview__", eventName: "PageView" },
      {},
      pageViewId,
    );

    wireTriggers();
    // Run URL rules immediately for initial pageview
    state.rules.forEach(function (rule) {
      if (rule.triggerType === "url") {
        maybeFireUrl(rule);
      }
    });

    // SPA navigation — re-evaluate URL rules on history change.
    patchHistoryEvents();
    window.addEventListener("popstate", onUrlChange);
    window.addEventListener("adslab:locationchange", onUrlChange);
  }

  // ---- Trigger wiring -----------------------------------------------

  function wireTriggers() {
    var anyClick = false;
    var anyForm = false;
    var anyScroll = false;

    state.rules.forEach(function (rule) {
      switch (rule.triggerType) {
        case "click":
          anyClick = true;
          break;
        case "form_submit":
          anyForm = true;
          break;
        case "scroll":
          anyScroll = true;
          break;
        case "time_on_page":
          scheduleTime(rule);
          break;
        case "custom_js":
          wireCustomEvent(rule);
          break;
      }
    });

    if (anyClick) document.addEventListener("click", onClick, true);
    if (anyForm) document.addEventListener("submit", onFormSubmit, true);
    if (anyScroll) {
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  function onUrlChange() {
    state.rules.forEach(function (rule) {
      if (rule.triggerType === "url") maybeFireUrl(rule);
    });
  }

  function maybeFireUrl(rule) {
    var url = window.location.href;
    if (!matchesUrlCondition(url, rule.conditions)) return;
    if (rule.conditions && rule.conditions.fireOnce && state.firedOnce[rule.id]) return;
    state.firedOnce[rule.id] = true;
    fireEvent(rule, {});
  }

  function matchesUrlCondition(url, cond) {
    if (!cond) return false;
    var op = cond.op || "contains";
    var val = String(cond.value || "");
    if (!val) return false;
    var lcUrl = url.toLowerCase();
    var lcVal = val.toLowerCase();
    if (op === "contains") return lcUrl.indexOf(lcVal) >= 0;
    if (op === "equals") return url === val;
    if (op === "not_contains") return lcUrl.indexOf(lcVal) < 0;
    if (op === "starts_with") return lcUrl.indexOf(lcVal) === 0;
    if (op === "regex") {
      try {
        return new RegExp(val).test(url);
      } catch (e) {
        return false;
      }
    }
    return false;
  }

  function onClick(e) {
    var target = e.target;
    if (!target || target.nodeType !== 1) return;
    state.rules.forEach(function (rule) {
      if (rule.triggerType !== "click") return;
      var sel = rule.conditions && rule.conditions.selector;
      if (!sel) return;
      try {
        if (target.closest && target.closest(sel)) {
          var hit = target.closest(sel);
          fireEvent(rule, extractParams(rule, hit));
        }
      } catch (err) {
        // Bad selector — ignore silently
      }
    });
  }

  function onFormSubmit(e) {
    var form = e.target;
    if (!form || form.tagName !== "FORM") return;
    state.rules.forEach(function (rule) {
      if (rule.triggerType !== "form_submit") return;
      var sel = rule.conditions && rule.conditions.selector;
      // Empty selector = ANY form. Otherwise must match.
      if (sel) {
        try {
          if (!form.matches(sel)) return;
        } catch (err) {
          return;
        }
      }
      fireEvent(rule, extractParams(rule, form));
    });
  }

  function onScroll() {
    var pct = scrollPercent();
    if (pct <= state.scrollMax) return;
    state.scrollMax = pct;
    state.rules.forEach(function (rule) {
      if (rule.triggerType !== "scroll") return;
      var threshold = (rule.conditions && rule.conditions.percent) || 50;
      if (state.firedOnce[rule.id]) return;
      if (pct >= threshold) {
        state.firedOnce[rule.id] = true;
        fireEvent(rule, {});
      }
    });
  }

  function scrollPercent() {
    var doc = document.documentElement;
    var h = doc.scrollHeight - doc.clientHeight;
    if (h <= 0) return 100;
    return Math.round((doc.scrollTop / h) * 100);
  }

  function scheduleTime(rule) {
    var sec = (rule.conditions && rule.conditions.seconds) || 30;
    setTimeout(function () {
      if (state.firedOnce[rule.id]) return;
      state.firedOnce[rule.id] = true;
      fireEvent(rule, {});
    }, sec * 1000);
  }

  function wireCustomEvent(rule) {
    var name = rule.conditions && rule.conditions.eventName;
    if (!name) return;
    window.addEventListener(name, function (ev) {
      // Allow custom event detail to override params
      var detail = ev && ev.detail && typeof ev.detail === "object" ? ev.detail : {};
      fireEvent(rule, detail);
    });
  }

  // ---- Param extraction ----------------------------------------------

  function extractParams(rule, contextEl) {
    var out = {};
    var ex = rule.paramsExtractor;
    if (!ex || typeof ex !== "object") return out;
    Object.keys(ex).forEach(function (k) {
      var spec = ex[k];
      if (!spec || typeof spec !== "object") {
        if (spec !== undefined) out[k] = spec;
        return;
      }
      try {
        var val = extractOne(spec, contextEl);
        if (val !== undefined && val !== null && val !== "") out[k] = val;
      } catch (e) {}
    });
    return out;
  }

  function extractOne(spec, contextEl) {
    var sel = spec.selector;
    var el = null;
    if (sel) {
      var root = contextEl || document;
      try {
        el = root.querySelector ? root.querySelector(sel) : null;
      } catch (e) {}
      if (!el && contextEl) {
        try { el = document.querySelector(sel); } catch (e) {}
      }
    }
    if (spec.type === "literal") return spec.value;
    if (spec.type === "data_attr" && el) {
      return el.getAttribute("data-" + (spec.attr || "value"));
    }
    if (spec.type === "attr" && el) return el.getAttribute(spec.attr);
    if (spec.type === "text" && el) {
      var txt = (el.textContent || "").trim();
      if (spec.numeric) {
        var m = txt.match(/[\d.,]+/);
        if (m) return Number(m[0].replace(/,/g, ""));
      }
      return txt;
    }
    if (spec.type === "form_field" && contextEl && contextEl.elements) {
      var f = contextEl.elements[spec.name];
      if (f) return f.value;
    }
    if (spec.type === "url_param") {
      var u = new URL(window.location.href);
      return u.searchParams.get(spec.name);
    }
    return undefined;
  }

  // ---- Fire (Pixel + CAPI) ------------------------------------------

  function fireEvent(rule, params) {
    var eventId = generateEventId();
    var name = rule.eventName;

    // Browser-side Pixel fire
    try {
      window.fbq("track", name, params || {}, { eventID: eventId });
    } catch (e) {}

    sendCapi(rule, params || {}, eventId);
  }

  function sendCapi(rule, params, eventId) {
    try {
      var body = {
        siteKey: siteKey,
        ruleId: rule.id && rule.id.indexOf("__") === 0 ? null : rule.id,
        eventName: rule.eventName,
        eventId: eventId,
        params: params || {},
        sourceUrl: window.location.href,
        referrer: document.referrer || null,
        userAgent: navigator.userAgent,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
      };
      var blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      // sendBeacon survives page unload — great for click rules where
      // navigation happens immediately after.
      if (navigator.sendBeacon) {
        navigator.sendBeacon(SDK_ORIGIN + "/api/event-sdk/capi", blob);
      } else {
        fetch(SDK_ORIGIN + "/api/event-sdk/capi", {
          method: "POST",
          body: blob,
          keepalive: true,
          credentials: "omit",
        }).catch(function () {});
      }
    } catch (e) {}
  }

  function generateEventId() {
    // RFC4122 v4-ish; sufficient for Meta dedup window
    var hex = "";
    var rnd = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(rnd);
    } else {
      for (var i = 0; i < 16; i++) rnd[i] = Math.floor(Math.random() * 256);
    }
    rnd[6] = (rnd[6] & 0x0f) | 0x40;
    rnd[8] = (rnd[8] & 0x3f) | 0x80;
    for (var j = 0; j < 16; j++) {
      hex += rnd[j].toString(16).padStart(2, "0");
      if (j === 3 || j === 5 || j === 7 || j === 9) hex += "-";
    }
    return hex;
  }

  function readCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"),
    );
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---- History API patching for SPA URL changes ---------------------

  function patchHistoryEvents() {
    var origPush = history.pushState;
    var origReplace = history.replaceState;
    history.pushState = function () {
      var r = origPush.apply(this, arguments);
      window.dispatchEvent(new Event("adslab:locationchange"));
      return r;
    };
    history.replaceState = function () {
      var r = origReplace.apply(this, arguments);
      window.dispatchEvent(new Event("adslab:locationchange"));
      return r;
    };
  }

  // ---- Go --------------------------------------------------------------

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      fetchConfig().then(init);
    });
  } else {
    fetchConfig().then(init);
  }
})();
