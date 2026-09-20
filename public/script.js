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
    refreshBtn: document.getElementById("refresh-btn"),
    statTotal: document.getElementById("stat-total"),
    statAvg: document.getElementById("stat-avg"),
    statTop: document.getElementById("stat-top"),
    chartSvg: document.getElementById("chart-svg"),
    chartWrap: document.getElementById("chart-wrap"),
    tooltip: document.getElementById("tooltip"),
    tooltipValue: document.getElementById("tooltip-value"),
    tooltipDate: document.getElementById("tooltip-date"),
    barList: document.getElementById("bar-list"),
    topPagesTitle: document.getElementById("top-pages-title"),
    linkWebWrap: document.getElementById("link-web-wrap"),
    linkWebSvg: document.getElementById("link-web-svg"),
    linkWebMeta: document.getElementById("link-web-meta"),
    linkEdgeList: document.getElementById("link-edge-list"),
    linkWeb222Wrap: document.getElementById("link-web-222-wrap"),
    linkWeb222Svg: document.getElementById("link-web-222-svg"),
    linkWeb222Meta: document.getElementById("link-web-222-meta"),
    linkEdge222List: document.getElementById("link-edge-222-list"),
    exchangeList: document.getElementById("exchange-list"),
    exchangeMeta: document.getElementById("link-exchange-meta"),
    breakdownReferrers: document.getElementById("breakdown-referrers"),
    breakdownCountries: document.getElementById("breakdown-countries"),
    breakdownDevices: document.getElementById("breakdown-devices"),
    sheetSync: document.getElementById("sheet-sync"),
    sheetSync222: document.getElementById("sheet-sync-222"),
    lastUpdated: document.getElementById("last-updated"),
    errorBanner: document.getElementById("error-banner"),
    filterRow: document.getElementById("filter-row"),
  };

  var SVG_NS = "http://www.w3.org/2000/svg";

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
        edgeList: els.linkEdge222List,
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
      edgeList: els.linkEdgeList,
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
      row.classList.toggle("active", row.dataset.site === site);
    });
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
        drCell.textContent = "—";
      } else {
        drCell.className = "overview-value";
        drCell.textContent = Math.round(row.dr);
      }
      el.appendChild(drCell);

      function select() {
        state.site = row.site;
        state.linkFocus = row.domain ? String(row.domain).toLowerCase() : "";
        setActiveOverviewRow(row.site);
        loadData(state.range, row.site);
        renderLinkWeb();
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

  function loadOverview() {
    return fetch("/.netlify/functions/overview")
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Request failed");
          return body;
        });
      })
      .then(function (data) {
        state.overviewRows = data.rows || [];
        renderOverview();
        if (!state.site && state.overviewRows.length) {
          state.site = sortedOverviewRows()[0].site;
          setActiveOverviewRow(state.site);
        }
      })
      .catch(function (err) {
        showError("Couldn't load site overview: " + err.message);
      });
  }

  function loadData(range, site) {
    state.range = range;
    setActiveButton(range);
    showError(null);

    var url = "/.netlify/functions/stats?range=" + range;
    if (site) url += "&site=" + encodeURIComponent(site);

    return fetch(url)
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Request failed");
          return body;
        });
      })
      .then(function (data) {
        state.site = data.site || "";
        setActiveOverviewRow(state.site);
        els.chartTitle.textContent = "Pageviews over time — " + state.site;
        els.topPagesTitle.textContent = "Top pages — " + state.site;
        renderKPIs(data);
        renderChart(data.daily);
        renderBarList(data.topPages);
        renderBreakdownList(els.breakdownReferrers, data.referrers);
        renderBreakdownList(els.breakdownCountries, data.countries);
        renderBreakdownList(els.breakdownDevices, data.devices);
        els.lastUpdated.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch(function (err) {
        showError("Couldn't load stats: " + err.message);
        renderChart([]);
        renderBarList([]);
        renderBreakdownList(els.breakdownReferrers, []);
        renderBreakdownList(els.breakdownCountries, []);
        renderBreakdownList(els.breakdownDevices, []);
      });
  }

  function refreshAll() {
    els.refreshBtn.classList.add("spinning");
    els.refreshBtn.disabled = true;
    Promise.all([
      loadOverview(),
      loadData(state.range, state.site),
      loadLinkWeb("farm"),
      loadLinkWeb("222"),
    ]).finally(function () {
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

    slot.meta.textContent =
      graph.linkCount + " links · " + graph.nodes.length + " sites · " + graph.edges.length + " routes";

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

  function loadLinkWeb(which) {
    var slot = getLinkWebSlot(which || "farm");
    var url =
      which === "222"
        ? "/.netlify/functions/links?gid=" + encodeURIComponent(LINKS_222_GID)
        : "/.netlify/functions/links";

    return fetch(url)
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) throw new Error(body.error || "Request failed");
          return body;
        });
      })
      .then(function (data) {
        if (which === "222") {
          state.linkGraph222 = data;
          state.sheetFetchedAt222 = data.fetchedAt || new Date().toISOString();
        } else {
          state.linkGraph = data;
          state.sheetFetchedAt = data.fetchedAt || new Date().toISOString();
        }
        updateSheetSyncLabel();
        renderLinkWeb(slot.which);
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
        if (slot.withExchanges) renderExchanges([], "");
        var empty = document.createElementNS(SVG_NS, "text");
        empty.setAttribute("x", "50%");
        empty.setAttribute("y", "50%");
        empty.setAttribute("text-anchor", "middle");
        empty.setAttribute("class", "chart-axis-label");
        empty.textContent = "Couldn't load link web: " + err.message;
        slot.svg.appendChild(empty);
        showError("Couldn't load link web: " + err.message);
      });
  }

  els.filterRow.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".filter-btn");
    if (!btn) return;
    loadData(parseInt(btn.dataset.range, 10), state.site);
  });

  els.overviewTable.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".sort-btn");
    if (!btn) return;
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

  loadOverview().then(function () {
    loadData(state.range, state.site);
  });
  loadLinkWeb("farm");
  loadLinkWeb("222");
  setInterval(updateSheetSyncLabel, 30000);
})();
