function byId(id) {
  return document.getElementById(id);
}

function toNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function csvEscape(value) {
  const s = value === null || value === undefined ? "" : String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

function downloadTextFile(filename, text, mime = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const multiCurvePayload = window.MULTI_CURVE_PAYLOAD;
const defaultMultiCurveSettings = window.DEFAULT_MULTI_CURVE_SETTINGS;

const pageState = {
  curves: multiCurvePayload.curves || [],
  curveDisplayMap: JSON.parse(JSON.stringify(multiCurvePayload.curve_display_defaults || {})),
  globalSettings: JSON.parse(JSON.stringify(defaultMultiCurveSettings || {})),
  currentCurveId: (multiCurvePayload.curves && multiCurvePayload.curves[0]?.curve_id) || null,
};

function getCurveById(curveId) {
  return pageState.curves.find((curve) => curve.curve_id === curveId) || null;
}

function getDisplaySettings(curveId) {
  return pageState.curveDisplayMap[curveId] || null;
}

function buildCurveSelectOptions() {
  const select = byId("mc_curve_select");
  if (!select) return;

  select.innerHTML = "";

  pageState.curves.forEach((curve) => {
    const option = document.createElement("option");
    option.value = curve.curve_id;
    option.textContent = curve.selector_label || curve.source_file || curve.curve_name;
    select.appendChild(option);
  });

  if (pageState.currentCurveId) {
    select.value = pageState.currentCurveId;
  }
}

function loadCurrentCurveControls() {
  const curveId = pageState.currentCurveId;
  if (!curveId) return;

  const display = getDisplaySettings(curveId);
  if (!display) return;

  byId("mc_curve_name").value = display.display_name ?? "";
  byId("mc_curve_color").value = display.line_color ?? "#1f77b4";
  byId("mc_curve_marker_symbol").value = display.marker_symbol ?? "circle";
  byId("mc_curve_marker_size").value = display.marker_size ?? 7;
  byId("mc_curve_line_width").value = display.line_width ?? 3;
  byId("mc_curve_visible").checked = display.visible !== false;
}

function syncCurrentCurveControlsToState() {
  const curveId = pageState.currentCurveId;
  if (!curveId) return;

  const display = getDisplaySettings(curveId);
  if (!display) return;

  display.display_name = byId("mc_curve_name").value || getCurveById(curveId)?.curve_name || "Curve";
  display.line_color = byId("mc_curve_color").value || "#1f77b4";
  display.marker_symbol = byId("mc_curve_marker_symbol").value || "circle";
  display.marker_size = toNumberOrNull(byId("mc_curve_marker_size").value) ?? 7;
  display.line_width = toNumberOrNull(byId("mc_curve_line_width").value) ?? 3;
  display.visible = byId("mc_curve_visible").checked;
}

function loadGlobalControls() {
  byId("mc_plot_width").value = pageState.globalSettings.width ?? 900;
  byId("mc_plot_height").value = pageState.globalSettings.height ?? 560;
  byId("mc_x_title").value = pageState.globalSettings.x_title ?? "Time(day)";
  byId("mc_y_title").value = pageState.globalSettings.y_title ?? "Yield(L/kg-VS)";
  byId("mc_x_dtick").value = pageState.globalSettings.x_dtick ?? "";
  byId("mc_y_dtick").value = pageState.globalSettings.y_dtick ?? "";
}

function syncGlobalControlsToState() {
  pageState.globalSettings.width = toNumberOrNull(byId("mc_plot_width").value) ?? 900;
  pageState.globalSettings.height = toNumberOrNull(byId("mc_plot_height").value) ?? 560;
  pageState.globalSettings.x_title = byId("mc_x_title").value || "Time(day)";
  pageState.globalSettings.y_title = byId("mc_y_title").value || "Yield(L/kg-VS)";
  pageState.globalSettings.x_dtick = toNumberOrNull(byId("mc_x_dtick").value);
  pageState.globalSettings.y_dtick = toNumberOrNull(byId("mc_y_dtick").value);
}

function getUnionXValues() {
  const xSet = new Set();

  pageState.curves.forEach((curve) => {
    curve.x.forEach((x) => xSet.add(Number(x)));
  });

  return Array.from(xSet).sort((a, b) => a - b);
}

function buildCurveValueMap(curve) {
  const valueMap = {};
  curve.x.forEach((x, idx) => {
    valueMap[String(Number(x))] = curve.y[idx];
  });
  return valueMap;
}

function renderMergedPreview() {
  const box = byId("multi-cumulative-preview-box");
  const allX = getUnionXValues();

  const headers = pageState.curves.map((curve) => {
    const display = getDisplaySettings(curve.curve_id);
    return display?.display_name || curve.curve_name;
  });

  const curveMaps = pageState.curves.map((curve) => buildCurveValueMap(curve));

  const rowsHtml = allX.map((x) => {
    const tds = curveMaps.map((map) => {
      const value = map[String(Number(x))];
      return `<td>${value === undefined ? "" : Number(value).toFixed(6)}</td>`;
    }).join("");

    return `
      <tr>
        <td>${x}</td>
        ${tds}
      </tr>
    `;
  }).join("");

  box.innerHTML = `
    <div class="preview-table-wrap">
      <table class="preview-table">
        <thead>
          <tr>
            <th>Time</th>
            ${headers.map((h) => `<th>${h}</th>`).join("")}
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderPlot() {
  syncCurrentCurveControlsToState();
  syncGlobalControlsToState();

  const traces = [];

  pageState.curves.forEach((curve) => {
    const display = getDisplaySettings(curve.curve_id);
    if (!display || display.visible === false) return;

    const displayName = display.display_name || curve.curve_name;

    traces.push({
      x: curve.x,
      y: curve.y,
      mode: "lines+markers",
      name: displayName,
      line: {
        color: display.line_color,
        width: display.line_width,
      },
      marker: {
        color: display.line_color,
        symbol: display.marker_symbol,
        size: display.marker_size,
        line: {
          color: "#ffffff",
          width: 1,
        },
      },
      hovertemplate: "%{x}<br>%{y:.4f}<extra>" + displayName + "</extra>",
    });
  });

  const layout = {
    width: pageState.globalSettings.width,
    height: pageState.globalSettings.height,
    template: "plotly_white",
    hovermode: "x unified",
    margin: { l: 70, r: 30, t: 40, b: 60 },
    legend: { orientation: "h", y: 1.14 },
    xaxis: {
      title: pageState.globalSettings.x_title,
      dtick: pageState.globalSettings.x_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
    yaxis: {
      title: pageState.globalSettings.y_title,
      dtick: pageState.globalSettings.y_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
  };

  const config = {
    responsive: true,
    displaylogo: false,
    toImageButtonOptions: {
      format: "png",
      filename: "multi_curve_plot",
      scale: 2,
    },
  };

  Plotly.newPlot("multi-plot-container", traces, layout, config);
  renderMergedPreview();
}

function downloadPlotImage() {
  syncCurrentCurveControlsToState();
  syncGlobalControlsToState();

  Plotly.downloadImage("multi-plot-container", {
    format: "png",
    width: pageState.globalSettings.width,
    height: pageState.globalSettings.height,
    filename: "multi_curve_plot",
    scale: 2,
  });
}

function downloadMergedCsv() {
  syncCurrentCurveControlsToState();

  const allX = getUnionXValues();
  const headers = [
    "Time",
    ...pageState.curves.map((curve) => {
      const display = getDisplaySettings(curve.curve_id);
      return display?.display_name || curve.curve_name;
    }),
  ];

  const curveMaps = pageState.curves.map((curve) => buildCurveValueMap(curve));

  const rows = allX.map((x) => {
    const row = [x];
    curveMaps.forEach((map) => {
      const value = map[String(Number(x))];
      row.push(value === undefined ? "" : Number(value).toFixed(6));
    });
    return row;
  });

  const csvText = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadTextFile("multi_curve_cumulative.csv", csvText, "text/csv;charset=utf-8;");
}

function exportSettings() {
  syncCurrentCurveControlsToState();
  syncGlobalControlsToState();

  const payload = {
    global_settings: pageState.globalSettings,
    curve_display_map: pageState.curveDisplayMap,
    current_curve_id: pageState.currentCurveId,
  };

  downloadTextFile("multi_curve_plot_settings.json", JSON.stringify(payload, null, 2));
}

function importSettings(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const payload = JSON.parse(text);

    pageState.globalSettings = {
      ...pageState.globalSettings,
      ...(payload.global_settings || {}),
    };

    const importedCurveMap = payload.curve_display_map || {};
    Object.keys(importedCurveMap).forEach((curveId) => {
      if (pageState.curveDisplayMap[curveId]) {
        pageState.curveDisplayMap[curveId] = {
          ...pageState.curveDisplayMap[curveId],
          ...importedCurveMap[curveId],
        };
      }
    });

    if (payload.current_curve_id && pageState.curveDisplayMap[payload.current_curve_id]) {
      pageState.currentCurveId = payload.current_curve_id;
    }

    buildCurveSelectOptions();
    loadCurrentCurveControls();
    loadGlobalControls();
    renderPlot();
  };
  reader.readAsText(file, "utf-8");
}

function resetSettings() {
  pageState.globalSettings = JSON.parse(JSON.stringify(defaultMultiCurveSettings));
  pageState.curveDisplayMap = JSON.parse(JSON.stringify(multiCurvePayload.curve_display_defaults || {}));
  pageState.currentCurveId = (pageState.curves[0] && pageState.curves[0].curve_id) || null;

  buildCurveSelectOptions();
  loadCurrentCurveControls();
  loadGlobalControls();
  renderPlot();
}

function bindEvents() {
  byId("mc_curve_select").addEventListener("change", (e) => {
    syncCurrentCurveControlsToState();
    pageState.currentCurveId = e.target.value;
    loadCurrentCurveControls();
    renderPlot();
  });

  byId("btn-update-multi-plot").addEventListener("click", renderPlot);
  byId("btn-download-multi-image").addEventListener("click", downloadPlotImage);
  byId("btn-download-multi-csv").addEventListener("click", downloadMergedCsv);

  byId("btn-export-multi-settings").addEventListener("click", exportSettings);
  byId("btn-import-multi-settings").addEventListener("click", () => {
    byId("multi-settings-file-input").click();
  });
  byId("multi-settings-file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importSettings(file);
    e.target.value = "";
  });
  byId("btn-reset-multi-settings").addEventListener("click", resetSettings);

  [
    "mc_curve_name",
    "mc_curve_color",
    "mc_curve_marker_symbol",
    "mc_curve_marker_size",
    "mc_curve_line_width",
    "mc_curve_visible",
    "mc_plot_width",
    "mc_plot_height",
    "mc_x_dtick",
    "mc_y_dtick",
    "mc_x_title",
    "mc_y_title",
  ].forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("change", renderPlot);
  });
}

function init() {
  buildCurveSelectOptions();
  loadCurrentCurveControls();
  loadGlobalControls();
  bindEvents();
  renderPlot();
}

document.addEventListener("DOMContentLoaded", init);