/*
 * Pulse beacon: page views, interactions, browser errors and Core Web Vitals for one of my sites.
 *   <script defer src="https://<pulse>/beacon.js" data-project="brokwise"></script>
 *   window.pulse.track("plan_selected", "Bluepeak Plus")        name in snake_case, optional label
 *   <a href="/cv.pdf" data-pulse-event="cv_downloaded" data-pulse-label="hero">   counted on click, no code
 * Events tracked before this script loads wait in window.pulse.q (a name, or [name, label]) and are sent once it runs.
 * No cookies, no storage, no ids. Paths are sent without query string or hash.
 */
(function () {
  var script = document.currentScript;
  var project = script && script.getAttribute("data-project");
  if (!project || (window.pulse && window.pulse.ready)) return;
  var queued = (window.pulse && window.pulse.q) || [];
  var endpoint = new URL("/api/collect", script.src).href;
  // Local dev, automated browsers (my own E2E runs) and pre-renders stay out of the numbers
  var off = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || navigator.webdriver;

  function send(payload) {
    if (off) return;
    payload.project = project;
    var body = JSON.stringify(payload);
    // sendBeacon with text/plain: no CORS preflight, and it still goes out while the page unloads
    var accepted = navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
    if (!accepted) {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(
        function () {},
      );
    }
  }

  var lastPath = null;
  function pageview() {
    var path = location.pathname;
    if (path === lastPath) return;
    var referrer = lastPath === null && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : undefined;
    lastPath = path;
    send({ type: "pageview", path: path, referrer: referrer || undefined });
  }

  // Client-side navigation (Next.js Link) uses pushState; back and forward fire popstate
  var push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    pageview();
  };
  addEventListener("popstate", pageview);

  // At most 5 errors per page load, so one broken loop can't flood the log
  var errors = 0;
  function error(message, stack) {
    if (errors >= 5 || !message) return;
    errors++;
    send({
      type: "error",
      path: location.pathname,
      message: String(message).slice(0, 500),
      stack: stack ? String(stack).slice(0, 2000) : undefined,
    });
  }
  addEventListener("error", function (e) {
    // "Script error." comes from other origins' scripts and carries no detail
    if (e.message && e.message !== "Script error.") error(e.message, e.error && e.error.stack);
  });
  addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    error(r && r.message ? r.message : "Unhandled promise rejection: " + String(r), r && r.stack);
  });

  // Interactions: a name says what happened, the optional label says which one or where
  function track(name, label) {
    label = label ? String(label).trim().slice(0, 80) : "";
    send({ type: "event", name: name, label: label || undefined, path: location.pathname });
  }
  addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest && e.target.closest("[data-pulse-event]");
      if (el) track(el.getAttribute("data-pulse-event"), el.getAttribute("data-pulse-label"));
    },
    true,
  );

  // Core Web Vitals of this page load, measured with the browser's own PerformanceObserver (no library).
  // Sent once, when the page is hidden, for the page that was loaded (later client-side pages share its load).
  var vitals = {};
  var loadPath = location.pathname;
  function observe(type, onEntry, extra) {
    try {
      var options = { type: type, buffered: true };
      for (var k in extra) options[k] = extra[k];
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(onEntry);
      }).observe(options);
    } catch {
      // This browser doesn't measure it; the metric is left out
    }
  }
  var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
  if (nav && nav.responseStart > 0) vitals.ttfb = Math.round(nav.responseStart);
  observe("paint", function (e) {
    if (e.name === "first-contentful-paint") vitals.fcp = Math.round(e.startTime);
  });
  observe("largest-contentful-paint", function (e) {
    vitals.lcp = Math.round(e.startTime);
  });
  // CLS: the worst "session window" of shifts (gaps under 1 s, at most 5 s long), as Google defines it
  var windowValue = 0;
  var windowFirst = 0;
  var windowLast = 0;
  var worst = 0;
  observe("layout-shift", function (e) {
    if (e.hadRecentInput) return;
    if (windowValue && e.startTime - windowLast < 1000 && e.startTime - windowFirst < 5000) {
      windowValue += e.value;
    } else {
      windowValue = e.value;
      windowFirst = e.startTime;
    }
    windowLast = e.startTime;
    worst = Math.max(worst, windowValue);
    vitals.cls = Math.round(worst * 1000) / 1000;
  });
  // INP, simplified: the slowest interaction on the page (the real metric skips 1 in 50 on very busy pages)
  observe(
    "event",
    function (e) {
      if (e.interactionId && (!vitals.inp || e.duration > vitals.inp)) vitals.inp = Math.round(e.duration);
    },
    { durationThreshold: 16 },
  );
  var vitalsSent = false;
  function sendVitals() {
    if (vitalsSent || !Object.keys(vitals).length) return;
    vitalsSent = true;
    var payload = { type: "vitals", path: loadPath };
    for (var m in vitals) if (vitals[m] <= 60000) payload[m] = vitals[m];
    send(payload);
  }
  addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendVitals();
  });
  addEventListener("pagehide", sendVitals);

  window.pulse = { ready: true, track: track };
  pageview();
  queued.forEach(function (item) {
    if (Array.isArray(item)) track(item[0], item[1]);
    else track(item);
  });
})();
