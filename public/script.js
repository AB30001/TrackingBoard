(function () {
  "use strict";

  var state = { range: 7, daily: [], site: "" };

  var els = {
    chartTitle: document.getElementById("chart-title"),
    overviewBody: document.getElementById("overview-body"),
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

  function formatDate(dayStr) {
    var d = new Date(dayStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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
    var days = (data.daily || []).length || 1;
    els.statTotal.textContent = formatCompact(total);
    els.statAvg.textContent = formatCompact(Math.round(total / days));

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
    // round the top gridline up to a clean-ish step
    var niceMax = Math.ceil(maxVal / 5) * 5 || 1;

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

  function renderOverview(rows) {
    els.overviewBody.innerHTML = "";
    if (!rows || !rows.length) {
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

      var pageviewsCell = document.createElement("div");
      if (row.totalError) {
        pageviewsCell.className = "overview-error";
        pageviewsCell.textContent = "Error";
      } else {
        pageviewsCell.className = "overview-value";
        pageviewsCell.textContent = formatCompact(row.total || 0);
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
        setActiveOverviewRow(row.site);
        loadData(state.range, row.site);
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
        renderOverview(data.rows);
        if (!state.site && data.rows && data.rows.length) {
          state.site = data.rows[0].site;
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
        renderKPIs(data);
        renderChart(data.daily);
        renderBarList(data.topPages);
        els.lastUpdated.textContent = "Updated " + new Date().toLocaleTimeString();
      })
      .catch(function (err) {
        showError("Couldn't load stats: " + err.message);
        renderChart([]);
        renderBarList([]);
      });
  }

  function refreshAll() {
    els.refreshBtn.classList.add("spinning");
    els.refreshBtn.disabled = true;
    Promise.all([loadOverview(), loadData(state.range, state.site)]).finally(function () {
      els.refreshBtn.classList.remove("spinning");
      els.refreshBtn.disabled = false;
    });
  }

  els.filterRow.addEventListener("click", function (evt) {
    var btn = evt.target.closest(".filter-btn");
    if (!btn) return;
    loadData(parseInt(btn.dataset.range, 10), state.site);
  });

  els.refreshBtn.addEventListener("click", refreshAll);

  window.addEventListener("resize", function () {
    renderChart(state.daily);
  });

  loadOverview().then(function () {
    loadData(state.range, state.site);
  });
})();
