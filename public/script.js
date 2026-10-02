(function () {
  "use strict";

  var LINKS_222_GID = "67680598";

  var state = {
    range: 7,
    daily: [],
    site: "",
    overviewRows: [],
    sortPrimary: "views",
    viewsDir: "desc",
    ratingDir: "desc",
    recentDir: "desc",
    linkGraph: null,
    linkFocus: "",
    linkGraph222: null,
    linkFocus222: "",
    sheetFetchedAt: null,
    sheetFetchedAt222: null,
  };

  var els = {
    chartTitle: document.getElementById("chart-title"),
    overviewBody: document.getElementById("overview-body"),
    overviewTable: document.getElementById("overview-table"),
    overviewMeta: document.getElementById("overview-meta"),
    overviewOverlay: document.getElementById("overview-overlay"),
    refreshBtn: document.getElementById("refresh-btn"),
    statTotal: document.getElementById("stat-total"),
    statAvg: document.getElementById("stat-avg"),
    statTop: document.getElementById("stat-top"),
    kpiRow: document.getElementById("kpi-row"),
    kpiOverlay: document.getElementById("kpi-overlay"),
    chartSvg: document.getElementById("chart-svg"),
    chartWrap: document.getElementById("chart-wrap"),
    chartOverlay: document.getElementById("chart-overlay"),
    tooltip: document.getElementById("tooltip"),
    tooltipValue: document.getElementById("tooltip-value"),
    tooltipDate: document.getElementById("tooltip-date"),
    barList: document.getElementById("bar-list"),
    barListWrap: document.getElementById("bar-list-wrap"),
    barsOverlay: document.getElementById("bars-overlay"),
    topPagesTitle: document.getElementById("top-pages-title"),
    linkWebWrap: document.getElementById("link-web-wrap"),
    linkWebSvg: document.getElementById("link-web-svg"),
    linkWebMeta: document.getElementById("link-web-meta"),
    linkWebOverlay: document.getElementById("link-web-overlay"),
    linkFocusStats: document.getElementById("link-focus-stats"),
    linkEdgeList: document.getElementById("link-edge-list"),
    linkWeb222Wrap: document.getElementById("link-web-222-wrap"),
    linkWeb222Svg: document.getElementById("link-web-222-svg"),
    linkWeb222Meta: document.getElementById("link-web-222-meta"),
    linkWeb222Overlay: document.getElementById("link-web-222-overlay"),
    linkFocus222Stats: document.getElementById("link-focus-222-stats"),
    linkEdge222List: document.getElementById("link-edge-222-list"),
    exchangeList: document.getElementById("exchange-list"),
    exchangeListWrap: document.getElementById("exchange-list-wrap"),
    exchangeOverlay: document.getElementById("exchange-overlay"),
    exchangeMeta: document.getElementById("link-exchange-meta"),
    breakdown: document.getElementById("breakdown"),
    breakdownOverlay: document.getElementById("breakdown-overlay"),
    breakdownReferrers: document.getElementById("breakdown-referrers"),
    breakdownCountries: document.getElementById("breakdown-countries"),
    breakdownDevices: document.getElementById("breakdown-devices"),
    sheetSync: document.getElementById("sheet-sync"),
    sheetSync222: document.getElementById("sheet-sync-222"),
    noGoatCard: document.getElementById("no-goat-card"),
    noGoatMeta: document.getElementById("no-goat-meta"),
    noGoatList: document.getElementById("no-goat-list"),
    lastUpdated: document.getElementById("last-updated"),
    errorBanner: document.getElementById("error-banner"),
    filterRow: document.getElementById("filter-row"),
    scopeBadge: document.getElementById("scope-badge"),
  };

  var SVG_NS = "http://www.w3.org/2000/svg";

  function normalizeDomainKey(raw) {
    if (!raw) return "";
    var d = String(raw).trim().toLowerCase();
    try {
      if (d.indexOf("://") >= 0 || d.indexOf("www.") === 0) {
        var url = d.indexOf("://") >= 0 ? new URL(d) : new URL("https://" + d);
        d = url.hostname;
      }
    } catch (e) {
      // keep raw
    }
    return d.replace(/^www\./, "").replace(/\/.*$/, "").trim();
  }

  function domainToGoatCode(domain) {
    return normalizeDomainKey(domain).replace(/\./g, "");
  }

  function websiteCoverage() {
    var domains = new Set();
    var codes = new Set();
    (state.overviewRows || []).forEach(function (row) {
      if (row.site) codes.add(String(row.site).toLowerCase());
      var d = normalizeDomainKey(row.domain);
      if (d) {
        domains.add(d);
        codes.add(domainToGoatCode(d));
      }
    });
    return { domains: domains, codes: codes };
  }

  function collectLinkWebDomains() {
    var map = new Map();
    function addFrom(graph, source) {
      if (!graph || !graph.nodes) return;
      graph.nodes.forEach(function (n) {
        var d = normalizeDomainKey(n.id);
        if (!d) return;
        var entry = map.get(d);
        if (!entry) {
          entry = { domain: d, weight: 0, sources: [] };
          map.set(d, entry);
        }
        entry.weight = Math.max(entry.weight, n.weight || 0);
        if (entry.sources.indexOf(source) < 0) entry.sources.push(source);
      });
    }
    addFrom(state.linkGraph, "Link web");
    return Array.from(map.values()).sort(function (a, b) {
      return a.domain.localeCompare(b.domain);
    });
  }

  function findNoGoatSites() {
    var covered = websiteCoverage();
    return collectLinkWebDomains().filter(function (item) {
      if (covered.domains.has(item.domain)) return false;
      if (covered.codes.has(domainToGoatCode(item.domain))) return false;
      return true;
    });
  }

  function renderNoGoatAlert() {
    if (!els.noGoatCard || !els.noGoatList) return;

    // Need both sides loaded before comparing.
    if (!state.overviewRows.length || !state.linkGraph) {
      els.noGoatCard.hidden = true;
      els.noGoatList.innerHTML = "";
      if (els.noGoatMeta) els.noGoatMeta.textContent = "";
      return;
    }

    var missing = findNoGoatSites();
    if (!missing.length) {
      els.noGoatCard.hidden = true;
      els.noGoatList.innerHTML = "";
      if (els.noGoatMeta) els.noGoatMeta.textContent = "";
      return;
    }

    els.noGoatCard.hidden = false;
    if (els.noGoatMeta) {
      els.noGoatMeta.textContent =
        missing.length + " site" + (missing.length === 1 ? "" : "s");
    }

    els.noGoatList.innerHTML = "";
    missing.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "no-goat-row";

      var badge = document.createElement("span");
      badge.className = "no-goat-badge";
      badge.textContent = "!no goat";
      row.appendChild(badge);

      var domain = document.createElement("span");
      domain.className = "no-goat-domain";
      domain.textContent = item.domain;
      row.appendChild(domain);

      var hint = document.createElement("span");
      hint.className = "no-goat-hint";
      hint.textContent = "in sheet · not in GoatCounter list";
      row.appendChild(hint);

      els.noGoatList.appendChild(row);
    });
  }

  function formatCompact(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }

  function formatAvg(total, days) {
    if (!days) return "0";
    var avg = total / days;
    if (avg >= 100) return formatCompact(Math.round(avg));
    if (avg >= 10) return String(Math.round(avg));
    if (avg > 0 && avg < 1) return avg.toFixed(1);
    return String(Math.round(avg * 10) / 10).replace(/\.0$/, "");
  }

  function makeSparkSvg(values) {
    var svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "spark");
    svg.setAttribute("viewBox", "0 0 56 22");
    svg.setAttribute("aria-hidden", "true");

    var pts = values && values.length ? values : [0];
    var max = Math.max.apply(null, pts.concat([1]));
    var n = pts.length;
    var coords = pts.map(function (v, i) {
      var x = n === 1 ? 28 : (i / (n - 1)) * 56;
      var y = 20 - (v / max) * 16;
      return x + "," + y;
    });

    var area = document.createElementNS(SVG_NS, "polygon");
    area.setAttribute(
      "points",
      "0,22 " + coords.join(" ") + " 56,22"
    );
    area.setAttribute("class", "spark-area");
    svg.appendChild(area);

    var line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", coords.join(" "));
    line.setAttribute("class", "spark-line");
    svg.appendChild(line);
    return svg;
  }

  function renderBreakdownList(el, items) {
    el.innerHTML = "";
    if (!items || !items.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No data";
      el.appendChild(empty);
      return;
    }
    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "breakdown-row";
      var name = document.createElement("div");
      name.className = "name";
      name.textContent = item.name || item.id;
      name.title = name.textContent;
      row.appendChild(name);
      var count = document.createElement("div");
      count.className = "count";
      count.textContent = formatCompact(item.count || 0);
      row.appendChild(count);
      el.appendChild(row);
    });
  }

  function formatSheetSync(iso) {
    if (!iso) return "Sheet not synced yet";
    var then = new Date(iso).getTime();
    if (!then) return "Sheet not synced yet";
    var sec = Math.max(0, Math.round((Date.now() - then) / 1000));
    if (sec < 10) return "Sheet synced just now";
    if (sec < 60) return "Sheet synced " + sec + "s ago";
    var min = Math.round(sec / 60);
    if (min < 60) return "Sheet synced " + min + "m ago";
    var hr = Math.round(min / 60);
    if (hr < 48) return "Sheet synced " + hr + "h ago";
    return "Sheet synced " + new Date(iso).toLocaleString();
  }

  function updateSheetSyncLabel() {
    els.sheetSync.textContent = formatSheetSync(state.sheetFetchedAt);
    if (els.sheetSync222) {
      els.sheetSync222.textContent = formatSheetSync(state.sheetFetchedAt222);
    }
  }

  function getLinkWebSlot(which) {
    if (which === "222") {
      return {
        which: "222",
        getGraph: function () {
          return state.linkGraph222;
        },
        getFocus: function () {
          return state.linkFocus222;
        },
        setFocus: function (v) {
          state.linkFocus222 = v;
        },
        wrap: els.linkWeb222Wrap,
        svg: els.linkWeb222Svg,
        meta: els.linkWeb222Meta,
        focusStats: els.linkFocus222Stats,
        edgeList: els.linkEdge222List,
        overlay: els.linkWeb222Overlay,
        markerPrefix: "arrow222",
        withExchanges: false,
      };
    }
    return {
      which: "farm",
      getGraph: function () {
        return state.linkGraph;
      },
      getFocus: function () {
        return state.linkFocus;
      },
      setFocus: function (v) {
        state.linkFocus = v;
      },
      wrap: els.linkWebWrap,
      svg: els.linkWebSvg,
      meta: els.linkWebMeta,
      focusStats: els.linkFocusStats,
      edgeList: els.linkEdgeList,
      overlay: els.linkWebOverlay,
      markerPrefix: "arrow",
      withExchanges: true,
    };
  }

  function formatDate(dayStr) {
    // GoatCounter days are YYYY-MM-DD (UTC calendar dates). Parse as UTC so
    // local timezones don't shift the label to the previous evening.
    var parts = String(dayStr).split("-");
    var d = parts.length === 3
      ? new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2]))
      : new Date(dayStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }

  function showError(message) {
    if (!message) {
      els.errorBanner.hidden = true;
      els.errorBanner.textContent = "";
      return;
    }
    els.errorBanner.hidden = false;
    els.errorBanner.textContent = message;
  }

  function setPanelState(panel, overlay, opts) {
    opts = opts || {};
    if (!panel || !overlay) return;

    if (opts.clear) {
      panel.classList.remove("is-loading");
      overlay.hidden = true;
      overlay.classList.remove("is-error");
      overlay.innerHTML = "";
      return;
    }

    overlay.innerHTML = "";
    var status = document.createElement("div");
    status.className = "panel-status";
    status.setAttribute("role", opts.error ? "alert" : "status");

    if (!opts.error) {
      panel.classList.add("is-loading");
      overlay.classList.remove("is-error");
      var spin = document.createElement("div");
      spin.className = "spinner";
      spin.setAttribute("aria-hidden", "true");
      status.appendChild(spin);
    } else {
      panel.classList.remove("is-loading");
      overlay.classList.add("is-error");
    }

    var label = document.createElement("div");
    label.className = "panel-status-label";
    label.textContent = opts.error || opts.loading || "Loading…";
    status.appendChild(label);

    if (opts.error && typeof opts.onRetry === "function") {
      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "panel-retry";
      retry.textContent = "Retry";
      retry.addEventListener("click", function (evt) {
        evt.preventDefault();
        opts.onRetry();
      });
      status.appendChild(retry);
    }

    overlay.appendChild(status);
    overlay.hidden = false;
  }

  function setStatsBusy(busy) {
    els.filterRow.classList.toggle("is-busy", !!busy);
  }

  function setOverviewLoading(on) {
    setPanelState(els.overviewTable, els.overviewOverlay, on ? { loading: "Loading websites…" } : { clear: true });
    if (on && els.overviewMeta) els.overviewMeta.textContent = "Loading…";
  }

  function setOverviewError(message) {
    setPanelState(els.overviewTable, els.overviewOverlay, {
      error: message || "Couldn't load websites",
      onRetry: function () {
        loadOverview().then(function () {
          if (state.site) return loadData(state.range, state.site);
        });
      },
    });
    if (els.overviewMeta) els.overviewMeta.textContent = "Error";
  }

  function setStatsLoading(on) {
    var label = "Loading stats…";
    setPanelState(els.kpiRow, els.kpiOverlay, on ? { loading: label } : { clear: true });
    setPanelState(els.chartWrap, els.chartOverlay, on ? { loading: label } : { clear: true });
    setPanelState(els.breakdown, els.breakdownOverlay, on ? { loading: label } : { clear: true });
    setPanelState(els.barListWrap, els.barsOverlay, on ? { loading: label } : { clear: true });
    setStatsBusy(on);
  }

  function setStatsError(message) {
    var msg = message || "Couldn't load stats";
    var retry = function () {
      loadData(state.range, state.site);
    };
    setPanelState(els.kpiRow, els.kpiOverlay, { error: msg, onRetry: retry });
    setPanelState(els.chartWrap, els.chartOverlay, { error: msg, onRetry: retry });
    setPanelState(els.breakdown, els.breakdownOverlay, { error: msg, onRetry: retry });
    setPanelState(els.barListWrap, els.barsOverlay, { error: msg, onRetry: retry });
    setStatsBusy(false);
  }

  function setLinkWebLoading(which, on) {
    var slot = getLinkWebSlot(which);
    setPanelState(slot.wrap, slot.overlay, on ? { loading: "Loading link web…" } : { clear: true });
    if (which === "farm") {
      setPanelState(
        els.exchangeListWrap,
        els.exchangeOverlay,
        on ? { loading: "Loading exchanges…" } : { clear: true }
      );
    }
  }

  function setLinkWebError(which, message) {
    var slot = getLinkWebSlot(which);
    var msg = message || "Couldn't load link web";
    setPanelState(slot.wrap, slot.overlay, {
      error: msg,
      onRetry: function () {
        loadLinkWeb(which);
      },
    });
    if (which === "farm") {
      setPanelState(els.exchangeListWrap, els.exchangeOverlay, {
        error: msg,
        onRetry: function () {
          loadLinkWeb("farm");
        },
      });
    }
  }

  function setActiveButton(range) {
    var buttons = els.filterRow.querySelectorAll(".filter-btn");
    buttons.forEach(function (btn) {
      btn.classList.toggle("active", parseInt(btn.dataset.range, 10) === range);
    });
  }

  function renderKPIs(data) {
    var total = data.total || 0;
    var days = data.range || (data.daily || []).length || 1;
    els.statTotal.textContent = formatCompact(total);
    els.statAvg.textContent = formatAvg(total, days);

    var top = (data.topPages || [])[0];
    els.statTop.textContent = top ? top.path + " (" + formatCompact(top.count) + ")" : "No data yet";
  }

  function clearSvg() {
    while (els.chartSvg.firstChild) {
      els.chartSvg.removeChild(els.chartSvg.firstChild);
    }
  }

  function renderChart(daily) {
    clearSvg();
    state.daily = daily || [];

    var wrap = els.chartWrap;
    var width = wrap.clientWidth || 600;
    var height = wrap.clientHeight || 220;
    var padding = { top: 12, right: 12, bottom: 24, left: 36 };
    var innerW = width - padding.left - padding.right;
    var innerH = height - padding.top - padding.bottom;

    els.chartSvg.setAttribute("viewBox", "0 0 " + width + " " + height);

    if (!state.daily.length) {
      var emptyText = document.createElementNS(SVG_NS, "text");
      emptyText.setAttribute("x", width / 2);
      emptyText.setAttribute("y", height / 2);
      emptyText.setAttribute("text-anchor", "middle");
      emptyText.setAttribute("class", "chart-axis-label");
      emptyText.textContent = "No data yet";
      els.chartSvg.appendChild(emptyText);
      return;
    }

    var maxVal = Math.max.apply(null, state.daily.map(function (d) { return d.count; }));
    maxVal = maxVal <= 0 ? 1 : maxVal;
    // Keep small totals readable (don't jump 3 → 5); only step up for larger values.
    var niceMax = maxVal <= 5 ? maxVal : Math.ceil(maxVal / 5) * 5;

    function xFor(i) {
      var n = state.daily.length;
      return padding.left + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
    }
    function yFor(v) {
      return padding.top + innerH - (v / niceMax) * innerH;
    }

    // gridlines (0, mid, max)
    [0, 0.5, 1].forEach(function (frac) {
      var y = padding.top + innerH - frac * innerH;
      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", padding.left);
      line.setAttribute("x2", width - padding.right);
      line.setAttribute("y1", y);
      line.setAttribute("y2", y);
      line.setAttribute("class", "chart-gridline");
      els.chartSvg.appendChild(line);

      var label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", padding.left - 8);
      label.setAttribute("y", y + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "chart-axis-label");
      label.textContent = formatCompact(Math.round(frac * niceMax));
      els.chartSvg.appendChild(label);
    });

    // x-axis labels: first, middle, last
    [0, Math.floor((state.daily.length - 1) / 2), state.daily.length - 1].forEach(function (i, idx, arr) {
      if (arr.indexOf(i) !== idx) return;
      var label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("x", xFor(i));
      label.setAttribute("y", height - 6);
      label.setAttribute("text-anchor", i === 0 ? "start" : i === state.daily.length - 1 ? "end" : "middle");
      label.setAttribute("class", "chart-axis-label");
      label.textContent = formatDate(state.daily[i].day);
      els.chartSvg.appendChild(label);
    });

    // area + line
    var linePoints = state.daily.map(function (d, i) { return xFor(i) + "," + yFor(d.count); });
    var areaPoints = [padding.left + "," + yFor(0)].concat(linePoints).concat([xFor(state.daily.length - 1) + "," + yFor(0)]);

    var area = document.createElementNS(SVG_NS, "polygon");
    area.setAttribute("points", areaPoints.join(" "));
    area.setAttribute("class", "chart-area");
    els.chartSvg.appendChild(area);

    var line = document.createElementNS(SVG_NS, "polyline");
    line.setAttribute("points", linePoints.join(" "));
    line.setAttribute("class", "chart-line");
    els.chartSvg.appendChild(line);

    // end marker
    var lastI = state.daily.length - 1;
    var endDot = document.createElementNS(SVG_NS, "circle");
    endDot.setAttribute("cx", xFor(lastI));
    endDot.setAttribute("cy", yFor(state.daily[lastI].count));
    endDot.setAttribute("r", 4);
    endDot.setAttribute("class", "chart-dot");
    els.chartSvg.appendChild(endDot);

    // hover layer: crosshair + tooltip
    var crosshair = document.createElementNS(SVG_NS, "line");
    crosshair.setAttribute("y1", padding.top);
    crosshair.setAttribute("y2", padding.top + innerH);
    crosshair.setAttribute("class", "chart-crosshair");
    crosshair.setAttribute("visibility", "hidden");
    els.chartSvg.appendChild(crosshair);

    var hoverDot = document.createElementNS(SVG_NS, "circle");
    hoverDot.setAttribute("r", 4);
    hoverDot.setAttribute("class", "chart-dot");
    hoverDot.setAttribute("visibility", "hidden");
    els.chartSvg.appendChild(hoverDot);

    var hitLayer = document.createElementNS(SVG_NS, "rect");
    hitLayer.setAttribute("x", padding.left);
    hitLayer.setAttribute("y", padding.top);
    hitLayer.setAttribute("width", innerW);
    hitLayer.setAttribute("height", innerH);
    hitLayer.setAttribute("class", "chart-hit-layer");
    els.chartSvg.appendChild(hitLayer);

    function showAt(i) {
      var d = state.daily[i];
      var x = xFor(i);
      var y = yFor(d.count);
      crosshair.setAttribute("x1", x);
      crosshair.setAttribute("x2", x);
      crosshair.setAttribute("visibility", "visible");
      hoverDot.setAttribute("cx", x);
      hoverDot.setAttribute("cy", y);
      hoverDot.setAttribute("visibility", "visible");

      els.tooltip.hidden = false;
      els.tooltipValue.textContent = formatCompact(d.count) + " pageviews";
      els.tooltipDate.textContent = formatDate(d.day);
      var pxRatio = wrap.clientWidth / width;
      els.tooltip.style.left = x * pxRatio + "px";
    }

    function hide() {
      crosshair.setAttribute("visibility", "hidden");
      hoverDot.setAttribute("visibility", "hidden");
      els.tooltip.hidden = true;
    }

    hitLayer.addEventListener("pointermove", function (evt) {
      var rect = els.chartSvg.getBoundingClientRect();
      var scaleX = width / rect.width;
      var px = (evt.clientX - rect.left) * scaleX;
      var n = state.daily.length;
      var i = Math.round(((px - padding.left) / innerW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      showAt(i);
    });
    hitLayer.addEventListener("pointerleave", hide);
  }

  function renderBarList(topPages) {
    els.barList.innerHTML = "";
    if (!topPages || !topPages.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No page data yet";
      els.barList.appendChild(empty);
      return;
    }

    var maxCount = Math.max.apply(null, topPages.map(function (p) { return p.count; }));

    topPages.forEach(function (page) {
      var row = document.createElement("div");
      row.className = "bar-row";

      var track = document.createElement("div");
      track.className = "bar-track";
      row.appendChild(track);

      var fill = document.createElement("div");
      fill.className = "bar-fill";
      var pct = maxCount > 0 ? (page.count / maxCount) * 100 : 0;
      fill.style.width = pct + "%";
      row.appendChild(fill);

      var label = document.createElement("div");
      label.className = "bar-label";
      label.textContent = page.title ? page.path + " — " + page.title : page.path;
      label.title = label.textContent;
      row.appendChild(label);

      var count = document.createElement("div");
      count.className = "bar-count";
      count.textContent = formatCompact(page.count);
      row.appendChild(count);

      els.barList.appendChild(row);
    });
  }

  function setActiveOverviewRow(site) {
    var rows = els.overviewBody.querySelectorAll(".overview-body-row");
    rows.forEach(function (row) {
      row.classList.toggle("active", !!site && row.dataset.site === site);
    });
  }

  function siteLabel(site) {
    if (!site) return "Select a website";
    var row = (state.overviewRows || []).find(function (r) {
      return r.site === site;
    });
    if (row && row.domain) return row.domain;
    return site;
  }

  function updateScopeLabels(scope, site) {
    var label = siteLabel(site);
    if (els.scopeBadge) {
      els.scopeBadge.textContent = site ? "Selected · " + label : "Pick a website";
      els.scopeBadge.classList.toggle("is-selected", !!site);
    }
    els.chartTitle.textContent = "Pageviews over time — " + label;
    els.topPagesTitle.textContent = "Top pages — " + label;
  }

  function firstOverviewSite() {
    if (state.overviewRows && state.overviewRows.length) {
      return state.overviewRows[0].site;
    }
    return "";
  }

  function selectSite(site) {
    state.site = site || "";
    if (site) {
      var row = (state.overviewRows || []).find(function (r) {
        return r.site === site;
      });
      state.linkFocus = row && row.domain ? String(row.domain).toLowerCase() : "";
    } else {
      state.linkFocus = "";
    }
    setActiveOverviewRow(state.site);
    if (state.site) loadData(state.range, state.site);
    renderLinkWeb("farm");
  }

  function clearSiteSelection() {
    // Old behavior: always show one site — jump back to the first row.
    var first = firstOverviewSite();
    if (!first) return;
    if (state.site === first) {
      loadData(state.range, first);
      return;
    }
    selectSite(first);
  }

  function sortValue(row, key) {
    if (key === "views") {
      if (row.totalError) return null;
      return typeof row.total === "number" ? row.total : null;
    }
    if (key === "recent") {
      if (row.totalError) return null;
      return typeof row.recent2h === "number" ? row.recent2h : null;
    }
    if (key === "rating") {
      if (row.offline || row.drError) return null;
      return typeof row.dr === "number" ? row.dr : null;
    }
    return null;
  }

  function compareNullable(av, bv, dir) {
    var sign = dir === "asc" ? 1 : -1;
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    if (av === bv) return 0;
    return av < bv ? -sign : sign;
  }

  function sortDirFor(key) {
    if (key === "views") return state.viewsDir;
    if (key === "recent") return state.recentDir;
    return state.ratingDir;
  }

  function sortedOverviewRows() {
    var rows = state.overviewRows.slice();
    var primary = state.sortPrimary;
    var secondary = primary === "views" ? "rating" : "views";
    var primaryDir = sortDirFor(primary);
    var secondaryDir = sortDirFor(secondary);

    rows.sort(function (a, b) {
      var byPrimary = compareNullable(sortValue(a, primary), sortValue(b, primary), primaryDir);
      if (byPrimary) return byPrimary;
      var bySecondary = compareNullable(sortValue(a, secondary), sortValue(b, secondary), secondaryDir);
      if (bySecondary) return bySecondary;
      return String(a.domain || a.site).localeCompare(String(b.domain || b.site));
    });
    return rows;
  }

  function updateSortButtons() {
    var buttons = els.overviewTable.querySelectorAll(".sort-btn");
    buttons.forEach(function (btn) {
      var key = btn.dataset.sort;
      var active = key === state.sortPrimary;
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      btn.setAttribute("data-dir", sortDirFor(key));
      btn.classList.toggle("sort-secondary", !active);
    });
  }

  function renderOverview() {
    var rows = sortedOverviewRows();
    els.overviewBody.innerHTML = "";
    updateSortButtons();

    if (!rows.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No sites configured";
      els.overviewBody.appendChild(empty);
      return;
    }

    rows.forEach(function (row) {
      var el = document.createElement("div");
      el.className = "overview-row overview-body-row";
      el.dataset.site = row.site;
      el.tabIndex = 0;
      el.setAttribute("role", "button");

      var siteCell = document.createElement("div");
      siteCell.className = "overview-site";
      siteCell.textContent = row.domain || row.site;
      var sub = document.createElement("span");
      sub.className = "overview-domain";
      sub.textContent = row.site + ".goatcounter.com";
      siteCell.appendChild(sub);
      el.appendChild(siteCell);

      var recentCell = document.createElement("div");
      if (row.totalError) {
        recentCell.className = "overview-error";
        recentCell.textContent = "Error";
      } else if (row.pending || row.total === null) {
        recentCell.className = "overview-offline";
        recentCell.textContent = "…";
      } else {
        recentCell.className = "overview-value";
        recentCell.textContent = formatCompact(row.recent2h || 0);
      }
      el.appendChild(recentCell);

      var pageviewsCell = document.createElement("div");
      pageviewsCell.className = "overview-views";
      if (row.totalError) {
        var err = document.createElement("div");
        err.className = "overview-error";
        err.textContent = "Error";
        pageviewsCell.appendChild(err);
      } else if (row.pending || row.total === null) {
        var pending = document.createElement("div");
        pending.className = "overview-offline";
        pending.textContent = "…";
        pageviewsCell.appendChild(pending);
      } else {
        var val = document.createElement("div");
        val.className = "overview-value";
        val.textContent = formatCompact(row.total || 0);
        pageviewsCell.appendChild(val);
        pageviewsCell.appendChild(makeSparkSvg(row.spark || []));
      }
      el.appendChild(pageviewsCell);

      var drCell = document.createElement("div");
      if (row.offline) {
        drCell.className = "overview-offline";
        drCell.textContent = "Offline";
      } else if (row.drError) {
        drCell.className = "overview-error";
        drCell.textContent = "Error";
      } else if (row.dr === null || row.dr === undefined) {
        drCell.className = "overview-offline";
        drCell.textContent = row.pending ? "…" : "—";
      } else {
        drCell.className = "overview-value";
        drCell.textContent = Math.round(row.dr);
      }
      el.appendChild(drCell);

      function select() {
        if (state.site === row.site) return;
        selectSite(row.site);
      }
      el.addEventListener("click", select);
      el.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          select();
        }
      });

      els.overviewBody.appendChild(el);
    });

    setActiveOverviewRow(state.site);
  }

  function apiUrl(path, fresh) {
    var sep = path.indexOf("?") >= 0 ? "&" : "?";
    var url = path + sep + "_=" + Date.now();
    if (fresh) url += "&fresh=1";
    return url;
  }

  function apiFetch(path, opts) {
    opts = opts || {};
    return fetch(apiUrl(path, opts.fresh), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) throw new Error(body.error || "Request failed");
        return body;
      });
    });
  }

  function cacheNote(data) {
    if (!data || !data.cache) return "";
    if (data.cache === "HIT" || data.cache === "SHARED") {
      if (!data.cachedAt) return " · cached";
      var sec = Math.max(0, Math.round((Date.now() - new Date(data.cachedAt).getTime()) / 1000));
      if (sec < 5) return " · cached just now";
      if (sec < 60) return " · cached " + sec + "s ago";
      return " · cached " + Math.round(sec / 60) + "m ago";
    }
    return " · fresh";
  }

  var overviewFillToken = 0;

  function mergeOverviewRow(row) {
    if (!row || !row.site) return;
    var list = state.overviewRows || [];
    var idx = list.findIndex(function (r) {
      return r.site === row.site;
    });
    if (idx >= 0) list[idx] = row;
    else list.push(row);
    state.overviewRows = list;
  }

  function fillOverviewMetrics(opts) {
    opts = opts || {};
    var token = ++overviewFillToken;
    var sites = (state.overviewRows || []).map(function (r) {
      return r.site;
    });
    // Prefer the selected site first so its table row fills ASAP.
    if (state.site) {
      sites = [state.site].concat(
        sites.filter(function (s) {
          return s !== state.site;
        })
      );
    }
    var i = 0;

    function next() {
      if (token !== overviewFillToken) return Promise.resolve();
      if (i >= sites.length) {
        if (els.overviewMeta) {
          var ready = (state.overviewRows || []).filter(function (r) {
            return r.total !== null;
          }).length;
          els.overviewMeta.textContent = ready + " / " + sites.length + " sites";
        }
        return Promise.resolve();
      }
      var code = sites[i++];
      var url = "/.netlify/functions/overview?site=" + encodeURIComponent(code) + "&dr=1";
      return apiFetch(url, opts)
        .then(function (data) {
          if (token !== overviewFillToken) return;
          if (data && data.row) {
            mergeOverviewRow(data.row);
            renderOverview();
            setActiveOverviewRow(state.site);
          }
        })
        .catch(function () {
          if (token !== overviewFillToken) return;
          var prev = (state.overviewRows || []).find(function (r) {
            return r.site === code;
          }) || {};
          mergeOverviewRow({
            site: code,
            domain: prev.domain || null,
            offline: !prev.domain,
            total: null,
            recent2h: null,
            spark: null,
            totalError: "Unavailable",
            dr: null,
            drError: null,
            pending: false,
          });
          renderOverview();
        })
        .then(function () {
          return new Promise(function (resolve) {
            setTimeout(resolve, 350);
          });
        })
        .then(next);
    }

    if (els.overviewMeta) {
      els.overviewMeta.textContent = "0 / " + sites.length + " sites";
    }
    return next();
  }

  function loadOverview(opts) {
    opts = opts || {};
    setOverviewLoading(true);
    // Instant list (no GoatCounter fan-out), then fill one site at a time.
    return apiFetch("/.netlify/functions/overview", opts)
      .then(function (data) {
        state.overviewRows = data.rows || [];
        setOverviewLoading(false);
        renderOverview();
        if (els.overviewMeta) {
          els.overviewMeta.textContent = state.overviewRows.length
            ? state.overviewRows.length + " sites"
            : "";
        }
        if (state.site) {
          var stillThere = state.overviewRows.some(function (r) {
            return r.site === state.site;
          });
          if (!stillThere) state.site = "";
        }
        if (!state.site && state.overviewRows.length) {
          state.site = state.overviewRows[0].site;
        }
        setActiveOverviewRow(state.site);
        els.lastUpdated.textContent =
          "Updated " +
          new Date().toLocaleTimeString() +
          (data.siteCount ? " · " + data.siteCount + " sites" : "") +
          cacheNote(data);
        renderNoGoatAlert();
        return data;
      })
      .catch(function (err) {
        state.overviewRows = [];
        setOverviewError("Couldn't load websites: " + err.message);
        showError("Couldn't load site overview: " + err.message);
        renderNoGoatAlert();
        throw err;
      });
  }

  function loadData(range, site, opts) {
    opts = opts || {};
    state.range = range;
    if (site) state.site = site;
    setActiveButton(range);
    setActiveOverviewRow(state.site);
    showError(null);
    setStatsLoading(true);
    updateScopeLabels("site", state.site || "");

    // One site only. If none picked yet, the server defaults to the first
    // configured site (old, fast behavior) — never fan out to all sites.
    var url = "/.netlify/functions/stats?range=" + range;
    if (state.site) {
      url += "&site=" + encodeURIComponent(state.site);
    }

    return apiFetch(url, opts)
      .then(function (data) {
        setStatsLoading(false);
        state.site = data.site || state.site || "";
        setActiveOverviewRow(state.site);
        updateScopeLabels(data.scope || "site", state.site);
        renderKPIs(data);
        renderChart(data.daily);
        renderBarList(data.topPages);
        renderBreakdownList(els.breakdownReferrers, data.referrers);
        renderBreakdownList(els.breakdownCountries, data.countries);
        renderBreakdownList(els.breakdownDevices, data.devices);
        els.lastUpdated.textContent =
          "Updated " + new Date().toLocaleTimeString() + cacheNote(data);
      })
      .catch(function (err) {
        setStatsError("Couldn't load stats: " + err.message);
        showError("Couldn't load stats: " + err.message);
        renderChart([]);
        renderBarList([]);
        renderBreakdownList(els.breakdownReferrers, []);
        renderBreakdownList(els.breakdownCountries, []);
        renderBreakdownList(els.breakdownDevices, []);
        els.statTotal.textContent = "—";
        els.statAvg.textContent = "—";
        els.statTop.textContent = "—";
        throw err;
      });
  }

  function refreshAll() {
    els.refreshBtn.classList.add("spinning");
    els.refreshBtn.disabled = true;
    showError(null);
    var fresh = { fresh: true };
    overviewFillToken += 1;
    Promise.allSettled([
      loadData(state.range, state.site, fresh),
      loadOverview(fresh),
      loadLinkWeb("farm", fresh),
      loadLinkWeb("222", fresh),
    ])
      .then(function (results) {
        var fails = results.filter(function (r) {
          return r.status === "rejected";
        });
        if (fails.length) {
          showError(
            fails.length +
              " of " +
              results.length +
              " refresh requests failed. Use Retry on the red panels."
          );
        }
        return fillOverviewMetrics(fresh);
      })
      .finally(function () {
        els.refreshBtn.classList.remove("spinning");
        els.refreshBtn.disabled = false;
      });
  }

  function clearLinkSvg(slot) {
    while (slot.svg.firstChild) {
      slot.svg.removeChild(slot.svg.firstChild);
    }
  }

  function renderLinkEdgeList(slot, edges, focus) {
    slot.edgeList.innerHTML = "";
    var list = edges.slice();
    if (focus) {
      list = list.filter(function (e) {
        return e.source === focus || e.target === focus;
      });
    }
    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = focus
        ? "No sheet links involving " + focus
        : "No link rows in the sheet yet";
      slot.edgeList.appendChild(empty);
      return;
    }

    list.slice(0, 40).forEach(function (edge) {
      var row = document.createElement("div");
      row.className = "link-edge-row";

      function domainBtn(domain, className) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = className + " domain-link";
        btn.textContent = domain;
        btn.title = "Focus " + domain + " on the map";
        if (focus === domain) btn.classList.add("active");
        btn.addEventListener("click", function (evt) {
          evt.stopPropagation();
          slot.setFocus(slot.getFocus() === domain ? "" : domain);
          renderLinkWeb(slot.which);
        });
        return btn;
      }

      row.appendChild(domainBtn(edge.source, "from"));

      var arrow = document.createElement("div");
      arrow.className = "arrow";
      arrow.textContent = "→";
      row.appendChild(arrow);

      row.appendChild(domainBtn(edge.target, "to"));

      var count = document.createElement("div");
      count.className = "count";
      count.textContent = formatCompact(edge.count);
      row.appendChild(count);

      slot.edgeList.appendChild(row);
    });
  }

  function renderLinkWeb(which) {
    var slot = getLinkWebSlot(which || "farm");
    var graph = slot.getGraph();
    clearLinkSvg(slot);

    if (!graph || !graph.nodes || !graph.nodes.length) {
      slot.meta.textContent = "";
      if (slot.focusStats) {
        slot.focusStats.hidden = true;
        slot.focusStats.textContent = "";
      }
      slot.edgeList.innerHTML = "";
      if (slot.withExchanges) renderExchanges([], "");
      var empty = document.createElementNS(SVG_NS, "text");
      empty.setAttribute("x", "50%");
      empty.setAttribute("y", "50%");
      empty.setAttribute("text-anchor", "middle");
      empty.setAttribute("class", "chart-axis-label");
      empty.textContent = graph ? "No links found in sheet" : "Loading link web…";
      slot.svg.appendChild(empty);
      return;
    }

    var wrap = slot.wrap;
    var width = wrap.clientWidth || 900;
    var height = wrap.clientHeight || 560;
    slot.svg.setAttribute("viewBox", "0 0 " + width + " " + height);

    var prefix = slot.markerPrefix;
    var defs = document.createElementNS(SVG_NS, "defs");
    function addMarker(id, colorClass) {
      var marker = document.createElementNS(SVG_NS, "marker");
      marker.setAttribute("id", id);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "8");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "7");
      marker.setAttribute("markerHeight", "7");
      marker.setAttribute("orient", "auto-start-reverse");
      var path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      path.setAttribute("class", colorClass);
      marker.appendChild(path);
      defs.appendChild(marker);
    }
    addMarker(prefix, "link-arrow");
    addMarker(prefix + "-hot", "link-arrow hot");
    addMarker(prefix + "-dim", "link-arrow dim");
    slot.svg.appendChild(defs);

    var focus = slot.getFocus();
    var baseMeta =
      graph.linkCount + " links · " + graph.nodes.length + " sites · " + graph.edges.length + " routes";
    var inboundRoutes = 0;
    var outboundRoutes = 0;
    var inboundLinks = 0;
    var outboundLinks = 0;
    if (focus) {
      graph.edges.forEach(function (e) {
        var n = Number(e.count) || 0;
        if (e.target === focus) {
          inboundRoutes += 1;
          inboundLinks += n;
        }
        if (e.source === focus) {
          outboundRoutes += 1;
          outboundLinks += n;
        }
      });
      slot.meta.textContent =
        focus + " · " + inboundRoutes + " inbound · " + outboundRoutes + " outbound";
      if (slot.focusStats) {
        slot.focusStats.hidden = false;
        slot.focusStats.textContent = "";
        var nameEl = document.createElement("strong");
        nameEl.textContent = focus;
        slot.focusStats.appendChild(nameEl);
        slot.focusStats.appendChild(
          document.createTextNode(" · inbound ")
        );
        var inEl = document.createElement("strong");
        inEl.textContent = String(inboundRoutes);
        slot.focusStats.appendChild(inEl);
        slot.focusStats.appendChild(
          document.createTextNode(" (" + inboundLinks + " links) · outbound ")
        );
        var outEl = document.createElement("strong");
        outEl.textContent = String(outboundRoutes);
        slot.focusStats.appendChild(outEl);
        slot.focusStats.appendChild(
          document.createTextNode(" (" + outboundLinks + " links)")
        );
      }
    } else {
      slot.meta.textContent = baseMeta;
      if (slot.focusStats) {
        slot.focusStats.hidden = true;
        slot.focusStats.textContent = "";
      }
    }

    var nodes = graph.nodes.map(function (n) {
      return { id: n.id, weight: n.weight, x: width / 2, y: height / 2, vx: 0, vy: 0 };
    });
    var nodeById = {};
    nodes.forEach(function (n) {
      nodeById[n.id] = n;
    });
    var edges = graph.edges
      .map(function (e) {
        return {
          source: e.source,
          target: e.target,
          count: e.count,
          a: nodeById[e.source],
          b: nodeById[e.target],
        };
      })
      .filter(function (e) {
        return e.a && e.b;
      });

    var maxCount = Math.max.apply(
      null,
      edges.map(function (e) {
        return e.count;
      }).concat([1])
    );
    var maxWeight = Math.max.apply(
      null,
      nodes.map(function (n) {
        return n.weight;
      }).concat([1])
    );

    var rx = width * 0.44;
    var ry = height * 0.40;
    nodes.forEach(function (n, i) {
      var angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      n.x = width / 2 + Math.cos(angle) * rx;
      n.y = height / 2 + Math.sin(angle) * ry;
    });

    var padX = 90;
    var padY = 56;
    var steps = 160;
    for (var step = 0; step < steps; step++) {
      for (var i = 0; i < nodes.length; i++) {
        for (var j = i + 1; j < nodes.length; j++) {
          var a = nodes[i];
          var b = nodes[j];
          var dx = b.x - a.x;
          var dy = b.y - a.y;
          var dist = Math.sqrt(dx * dx + dy * dy) || 1;
          var force = 4200 / (dist * dist);
          var fx = (dx / dist) * force;
          var fy = (dy / dist) * force;
          a.vx -= fx;
          a.vy -= fy;
          b.vx += fx;
          b.vy += fy;
        }
      }

      edges.forEach(function (e) {
        var dx = e.b.x - e.a.x;
        var dy = e.b.y - e.a.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var ideal = Math.max(width * 0.22, 180);
        var force = (dist - ideal) * 0.008;
        var fx = (dx / dist) * force;
        var fy = (dy / dist) * force;
        e.a.vx += fx;
        e.a.vy += fy;
        e.b.vx -= fx;
        e.b.vy -= fy;
      });

      nodes.forEach(function (n) {
        n.vy += (height / 2 - n.y) * 0.001;
        n.vx *= 0.8;
        n.vy *= 0.8;
        n.x += n.vx;
        n.y += n.vy;
        n.x = Math.max(padX, Math.min(width - padX, n.x));
        n.y = Math.max(padY, Math.min(height - padY, n.y));
      });
    }

    var minX = Infinity;
    var maxX = -Infinity;
    var minY = Infinity;
    var maxY = -Infinity;
    nodes.forEach(function (n) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    });
    var spanX = Math.max(maxX - minX, 1);
    var spanY = Math.max(maxY - minY, 1);
    var targetW = width - padX * 2;
    var targetH = height - padY * 2;
    nodes.forEach(function (n) {
      n.x = padX + ((n.x - minX) / spanX) * targetW;
      n.y = padY + ((n.y - minY) / spanY) * targetH;
    });

    function nodeRadius(n) {
      return 12 + (n.weight / maxWeight) * 16;
    }

    edges.forEach(function (e) {
      var dx = e.b.x - e.a.x;
      var dy = e.b.y - e.a.y;
      var dist = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / dist;
      var uy = dy / dist;
      var startPad = nodeRadius(e.a) + 2;
      var endPad = nodeRadius(e.b) + 8;
      var x1 = e.a.x + ux * startPad;
      var y1 = e.a.y + uy * startPad;
      var x2 = e.b.x - ux * endPad;
      var y2 = e.b.y - uy * endPad;

      var line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("x1", x1);
      line.setAttribute("y1", y1);
      line.setAttribute("x2", x2);
      line.setAttribute("y2", y2);
      line.setAttribute("stroke-width", String(1.25 + (e.count / maxCount) * 4.5));
      line.setAttribute("class", "link-edge");
      var marker = "url(#" + prefix + ")";
      if (focus) {
        var hot = e.source === focus || e.target === focus;
        line.classList.add(hot ? "hot" : "dim");
        marker = hot ? "url(#" + prefix + "-hot)" : "url(#" + prefix + "-dim)";
      }
      line.setAttribute("marker-end", marker);
      slot.svg.appendChild(line);
    });

    nodes.forEach(function (n) {
      var g = document.createElementNS(SVG_NS, "g");
      g.setAttribute("class", "link-node");
      g.setAttribute("transform", "translate(" + n.x + "," + n.y + ")");
      if (focus) g.classList.add(n.id === focus ? "hot" : "dim");

      var r = nodeRadius(n);
      var circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", String(r));
      g.appendChild(circle);

      var label = document.createElementNS(SVG_NS, "text");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("y", String(r + 16));
      label.textContent = n.id;
      g.appendChild(label);

      g.addEventListener("click", function (evt) {
        evt.stopPropagation();
        slot.setFocus(slot.getFocus() === n.id ? "" : n.id);
        renderLinkWeb(slot.which);
      });

      slot.svg.appendChild(g);
    });

    renderLinkEdgeList(slot, graph.edges, focus);
    if (slot.withExchanges) renderExchanges(graph.exchanges || [], focus);
  }

  function renderExchanges(exchanges, focus) {
    els.exchangeList.innerHTML = "";
    var list = exchanges || [];
    if (focus) {
      list = list.filter(function (ex) {
        return ex.a === focus || ex.b === focus;
      });
    }

    els.exchangeMeta.textContent = list.length
      ? list.length + " exchange" + (list.length === 1 ? "" : "s")
      : "";

    if (!list.length) {
      var empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = focus
        ? "No link exchanges involving " + focus
        : "No reciprocal link exchanges found";
      els.exchangeList.appendChild(empty);
      return;
    }

    list.forEach(function (ex) {
      var card = document.createElement("div");
      card.className = "exchange-card";
      if (focus && (ex.a === focus || ex.b === focus)) card.classList.add("active");

      var pair = document.createElement("div");
      pair.className = "exchange-pair";

      var a = document.createElement("div");
      a.className = "site";
      a.textContent = ex.a;
      a.title = ex.a;
      pair.appendChild(a);

      var swap = document.createElement("div");
      swap.className = "swap";
      swap.textContent = "↔";
      pair.appendChild(swap);

      var b = document.createElement("div");
      b.className = "site";
      b.textContent = ex.b;
      b.title = ex.b;
      pair.appendChild(b);

      card.appendChild(pair);

      var dirs = document.createElement("div");
      dirs.className = "exchange-dirs";
      var d1 = document.createElement("span");
      d1.textContent = ex.a + " → " + ex.b + ": " + formatCompact(ex.aToB);
      dirs.appendChild(d1);
      var d2 = document.createElement("span");
      d2.textContent = ex.b + " → " + ex.a + ": " + formatCompact(ex.bToA);
      dirs.appendChild(d2);
      card.appendChild(dirs);

      card.addEventListener("click", function () {
        state.linkFocus = ex.a;
        renderLinkWeb("farm");
      });

      els.exchangeList.appendChild(card);
    });
  }

  function loadLinkWeb(which, opts) {
    opts = opts || {};
    var slot = getLinkWebSlot(which || "farm");
    var url =
      which === "222"
        ? "/.netlify/functions/links?gid=" + encodeURIComponent(LINKS_222_GID)
        : "/.netlify/functions/links";

    setLinkWebLoading(slot.which, true);
    return apiFetch(url, opts)
      .then(function (data) {
        if (which === "222") {
          state.linkGraph222 = data;
          state.sheetFetchedAt222 = data.fetchedAt || new Date().toISOString();
        } else {
          state.linkGraph = data;
          state.sheetFetchedAt = data.fetchedAt || new Date().toISOString();
        }
        updateSheetSyncLabel();
        setLinkWebLoading(slot.which, false);
        renderLinkWeb(slot.which);
        renderNoGoatAlert();
      })
      .catch(function (err) {
        if (which === "222") {
          state.linkGraph222 = null;
          state.sheetFetchedAt222 = null;
        } else {
          state.linkGraph = null;
          state.sheetFetchedAt = null;
        }
        updateSheetSyncLabel();
        clearLinkSvg(slot);
        slot.meta.textContent = "";
        slot.edgeList.innerHTML = "";
        if (slot.withExchanges) {
          els.exchangeList.innerHTML = "";
          els.exchangeMeta.textContent = "";
        }
        setLinkWebError(slot.which, "Couldn't load link web: " + err.message);
        showError("Couldn't load link web: " + err.message);
        renderNoGoatAlert();
        throw err;
      });
  }

  els.filterRow.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".filter-btn");
    if (!btn) return;
    loadData(parseInt(btn.dataset.range, 10), state.site);
  });

  if (els.scopeBadge) {
    els.scopeBadge.title = "Click to select the first website";
    els.scopeBadge.addEventListener("click", function () {
      clearSiteSelection();
    });
  }

  els.overviewTable.addEventListener("click", function (evt) {
    if (evt.target.closest(".overview-body-row")) return;
    if (evt.target.closest(".sort-btn")) {
      var btn = evt.target.closest(".sort-btn");
      var key = btn.dataset.sort;
      if (key === "views") {
        if (state.sortPrimary === "views") {
          state.viewsDir = state.viewsDir === "desc" ? "asc" : "desc";
        } else {
          state.sortPrimary = "views";
        }
      } else if (key === "recent") {
        if (state.sortPrimary === "recent") {
          state.recentDir = state.recentDir === "desc" ? "asc" : "desc";
        } else {
          state.sortPrimary = "recent";
        }
      } else if (key === "rating") {
        if (state.sortPrimary === "rating") {
          state.ratingDir = state.ratingDir === "desc" ? "asc" : "desc";
        } else {
          state.sortPrimary = "rating";
        }
      }
      renderOverview();
      return;
    }
    // Empty spot in the websites card → first website.
    clearSiteSelection();
  });

  els.refreshBtn.addEventListener("click", refreshAll);

  function bindLinkWebClear(which) {
    var slot = getLinkWebSlot(which);
    slot.svg.addEventListener("click", function (evt) {
      if (evt.target.closest(".link-node")) return;
      if (!slot.getFocus()) return;
      slot.setFocus("");
      renderLinkWeb(slot.which);
    });
  }
  bindLinkWebClear("farm");
  bindLinkWebClear("222");

  window.addEventListener("resize", function () {
    renderChart(state.daily);
    renderLinkWeb("farm");
    renderLinkWeb("222");
  });

  // Boot: site list + charts for the first site immediately.
  // Table metrics fill one-by-one after charts, to avoid GoatCounter 429s.
  loadOverview().catch(function () {});
  loadData(state.range, state.site)
    .catch(function () {})
    .then(function () {
      return fillOverviewMetrics();
    });
  loadLinkWeb("farm");
  loadLinkWeb("222");
  setInterval(updateSheetSyncLabel, 30000);
})();
