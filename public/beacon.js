/*
 * Pulse beacon: page views, interactions, browser errors and Core Web Vitals for one of my sites.
 *   <script defer src="https://<pulse>/beacon.js" data-project="brokwise"></script>
 *   window.pulse.track("plan_selected", "Bluepeak Plus")        name in snake_case, optional label
 *   <a href="/cv.pdf" data-pulse-event="cv_downloaded" data-pulse-label="hero">   counted on click, no code
 * Events tracked before this script loads wait in window.pulse.q (a name, or [name, label]) and are sent once it runs.
 *
 * Tracked automatically on every site, no code: how far people scroll, sections seen (a <section id> or an element
 * with data-pulse-section), links to other sites, file downloads and visible time on each page.
 * Links can say where they were shared with ?ref=linkedin (or utm_source); Pulse shows it as the source.
 * Open any page with ?pulse=ignore to stop counting yourself in this browser, ?pulse=count to count again.
 *
 * No cookies, no ids. The only thing stored is that opt-out flag. Paths are sent without query string or hash.
 */
(function () {
  var script = document.currentScript;
  var project = script && script.getAttribute("data-project");
  if (!project || (window.pulse && window.pulse.ready)) return;
  var queued = (window.pulse && window.pulse.q) || [];
  var endpoint = new URL("/api/collect", script.src).href;

  function param(name) {
    var match = new RegExp("[?&]" + name + "=([^&#]*)").exec(location.search);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1].replace(/\+/g, " "));
    } catch {
      return match[1];
    }
  }

  // "Don't count me": the owner's own visits. localStorage is per site, so this is set once on each site.
  var ignored = false;
  try {
    var choice = param("pulse");
    if (choice === "ignore") localStorage.setItem("pulse:ignore", "1");
    if (choice === "count") localStorage.removeItem("pulse:ignore");
    ignored = localStorage.getItem("pulse:ignore") === "1";
  } catch {
    // Private mode or storage blocked: counted as usual
  }

  // Local dev, automated browsers (my own E2E runs) and pre-renders stay out of the numbers
  var off = ignored || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || navigator.webdriver;

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

  function device() {
    var coarse = false;
    try {
      coarse = matchMedia("(pointer: coarse)").matches;
    } catch {
      // No matchMedia: decide by width alone
    }
    return innerWidth < 768 || coarse ? "mobile" : "desktop";
  }

  // The tag a shared link carries, read before anything else could change the address
  var source = param("ref") || param("utm_source");
  source = source
    ? source
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || null
    : null;

  // Interactions: a name says what happened, the optional label says which one or where
  function track(name, label, value) {
    label = label ? String(label).trim().slice(0, 80) : "";
    send({ type: "event", name: name, label: label || undefined, path: location.pathname, value: value });
  }

  // Automatic events: at most 40 per page load so one long session can't eat the daily cap.
  // time_on_page is always sent (it counts toward the 40 but is never dropped).
  var AUTO_MAX = 40;
  var autoSent = 0;
  function auto(name, label, value) {
    if (name !== "time_on_page" && autoSent >= AUTO_MAX) return;
    autoSent++;
    track(name, label, value);
  }

  // --- Visible time on the current page (paused while the tab is hidden) ---------------------------------------
  var visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  var visibleMs = 0;
  var timePath = null;
  // At most 5 sends per page view (a visitor switching tabs all day), always kept even past the 40 automatic events
  var timeSends = 0;
  function pauseClock() {
    if (visibleSince !== null) visibleMs += Date.now() - visibleSince;
    visibleSince = null;
  }
  // Sends the visible time since the last send. Each time the tab is hidden counts what came before; time after the
  // visitor comes back is sent on the next hide. Under a second is not worth a row.
  function flushTime() {
    pauseClock();
    if (timePath !== null && visibleMs >= 1000 && timeSends < 5) {
      timeSends++;
      send({ type: "event", name: "time_on_page", path: timePath, value: Math.min(Math.round(visibleMs), 6 * 3600000) });
      autoSent++;
    }
    visibleMs = 0;
  }
  function startClock(path) {
    timePath = path;
    timeSends = 0;
    visibleMs = 0;
    visibleSince = document.visibilityState === "visible" ? Date.now() : null;
  }

  // --- Scroll depth: 25, 50, 75 and 100% of the page, once each per page view ----------------------------------
  var depths = {};
  function checkScroll() {
    var doc = document.documentElement;
    var height = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    var seen = (window.scrollY || doc.scrollTop || 0) + innerHeight;
    // A page shorter than the screen has been read to the end
    var ratio = height <= innerHeight ? 1 : seen / height;
    [25, 50, 75, 100].forEach(function (d) {
      if (!depths[d] && ratio >= (d === 100 ? 0.98 : d / 100)) {
        depths[d] = true;
        auto("scroll_depth", String(d));
      }
    });
  }
  var scrollQueued = false;
  addEventListener(
    "scroll",
    function () {
      if (scrollQueued) return;
      scrollQueued = true;
      setTimeout(function () {
        scrollQueued = false;
        checkScroll();
      }, 250);
    },
    { passive: true },
  );

  // --- Sections seen: at least half on screen for at least a second, once each per page view --------------------
  var sectionsSeen = {};
  var sectionTimers = {};
  var sectionObserver = null;
  function sectionName(el) {
    return el.getAttribute("data-pulse-section") || el.id;
  }
  if (window.IntersectionObserver) {
    sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var name = sectionName(entry.target);
          if (!name || sectionsSeen[name]) return;
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (!sectionTimers[name]) {
              sectionTimers[name] = setTimeout(function () {
                delete sectionTimers[name];
                if (sectionsSeen[name] || document.visibilityState !== "visible") return;
                sectionsSeen[name] = true;
                auto("section_viewed", name);
              }, 1000);
            }
          } else if (sectionTimers[name]) {
            clearTimeout(sectionTimers[name]);
            delete sectionTimers[name];
          }
        });
      },
      { threshold: [0, 0.5] },
    );
  }
  function watchSections() {
    if (!sectionObserver) return;
    sectionObserver.disconnect();
    var list = document.querySelectorAll("section[id], [data-pulse-section]");
    for (var i = 0; i < list.length; i++) if (sectionName(list[i])) sectionObserver.observe(list[i]);
  }

  // --- Page views -------------------------------------------------------------------------------------------------
  var lastPath = null;
  function pageview() {
    var path = location.pathname;
    if (path === lastPath) return;
    var first = lastPath === null;
    var referrer = first && document.referrer.indexOf(location.origin) !== 0 ? document.referrer : undefined;
    if (!first) flushTime();
    lastPath = path;
    depths = {};
    sectionsSeen = {};
    for (var k in sectionTimers) clearTimeout(sectionTimers[k]);
    sectionTimers = {};
    send({
      type: "pageview",
      path: path,
      referrer: referrer || undefined,
      source: (first && source) || undefined,
      device: device(),
    });
    startClock(path);
    // Client-side pages render after pushState: look at the new page a moment later
    setTimeout(function () {
      checkScroll();
      watchSections();
    }, first ? 0 : 400);
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

  // --- Clicks: left (with or without Ctrl/Cmd/Shift) and middle button ------------------------------------------
  var FILE = /\.(pdf|zip|docx|xlsx|csv|png|jpg|mp4)$/i;
  function onClick(e) {
    // auxclick also fires for the right button (context menu); only the middle button opens a link
    if (e.type === "auxclick" && e.button !== 1) return;
    var target = e.target && e.target.closest ? e.target : null;
    if (!target) return;
    var tagged = target.closest("[data-pulse-event]");
    if (tagged) {
      // The site's own name wins; automatic events never count the same click again
      track(tagged.getAttribute("data-pulse-event"), tagged.getAttribute("data-pulse-label"));
      return;
    }
    var link = target.closest("a[href]");
    if (!link) return;
    var url;
    try {
      url = new URL(link.href, location.href);
    } catch {
      return;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") return;
    var file = url.pathname.split("/").pop() || "";
    if (link.hasAttribute("download") || FILE.test(file)) {
      auto("file_downloaded", link.getAttribute("download") || decodeURIComponent(file) || url.host);
    } else if (url.origin !== location.origin) {
      auto("outbound_clicked", url.host);
    }
  }
  addEventListener("click", onClick, true);
  addEventListener("auxclick", onClick, true);

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
    var payload = { type: "vitals", path: loadPath, device: device() };
    for (var m in vitals) if (vitals[m] <= 60000) payload[m] = vitals[m];
    send(payload);
  }

  // Hidden is the last moment a page is sure to get on mobile, so vitals and time on page go out then
  addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      sendVitals();
      flushTime();
    } else if (visibleSince === null) {
      visibleSince = Date.now();
    }
  });
  addEventListener("pagehide", function () {
    sendVitals();
    flushTime();
  });

  window.pulse = {
    ready: true,
    track: function (name, label) {
      track(name, label);
    },
  };
  pageview();
  queued.forEach(function (item) {
    if (Array.isArray(item)) track(item[0], item[1]);
    else track(item);
  });
})();
