/*
 * Pulse beacon: page views, named events and browser errors for one of my sites.
 *   <script defer src="https://<pulse>/beacon.js" data-project="brokwise"></script>
 *   window.pulse.track("lead_submitted")
 *   <a href="/cv.pdf" data-pulse-event="cv_downloaded">   (counted on click, no code needed)
 * Events tracked before this script loads wait in window.pulse.q and are sent once it runs.
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
    var queued = navigator.sendBeacon && navigator.sendBeacon(endpoint, new Blob([body], { type: "text/plain" }));
    if (!queued) {
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

  function track(name) {
    send({ type: "event", name: name, path: location.pathname });
  }
  addEventListener(
    "click",
    function (e) {
      var el = e.target && e.target.closest && e.target.closest("[data-pulse-event]");
      if (el) track(el.getAttribute("data-pulse-event"));
    },
    true,
  );

  window.pulse = { ready: true, track: track };
  pageview();
  queued.forEach(track);
})();
