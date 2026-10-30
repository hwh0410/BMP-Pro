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

const PARAM_LABEL_MAP = {
  Pmax: "Pmax",
  mu: "μ",
  lag: "λ",
  k: "k",
  d: "d",
  P1max: "P₁max",
  P2max: "P₂max",
};

const PARAM_ORDER = ["Pmax", "mu", "lag", "k", "d", "P1max", "P2max"];

const FIT_LINE_DASH = {
  logistic: "dash",
  gompertz: "dash",
  richards: "dash",
  first_order: "dash",
  transfer: "dash",
  superimposed: "dash",
};

const ALL_MODEL_KEYS = ["logistic", "gompertz", "richards", "first_order", "transfer", "superimposed"];

const fitComparePayload = window.FIT_COMPARE_PAYLOAD;
const defaultFitCompareSettings = window.DEFAULT_FIT_COMPARE_SETTINGS;

const pageState = {
  curves: fitComparePayload.curves || [],
  settings: JSON.parse(JSON.stringify(defaultFitCompareSettings || {})),
};

function centerPlotContainer(plotDivId) {
  const plotEl = byId(plotDivId);
  if (!plotEl) return;

  plotEl.style.width = `${pageState.settings.width}px`;
  plotEl.style.maxWidth = "100%";
  plotEl.style.marginLeft = "auto";
  plotEl.style.marginRight = "auto";
  plotEl.style.display = "block";
}

function loadControls() {
  byId("fc_plot_width").value = pageState.settings.width ?? 750;
  byId("fc_plot_height").value = pageState.settings.height ?? 560;
  byId("fc_x_dtick").value = pageState.settings.x_dtick ?? "";
  byId("fc_y_dtick").value = pageState.settings.y_dtick ?? "";
  byId("fc_x_title").value = pageState.settings.x_title ?? "Time(day)";
  byId("fc_y_title").value = pageState.settings.y_title ?? "Yield(L/kg-VS)";
}

function syncControlsToState() {
  pageState.settings.width = toNumberOrNull(byId("fc_plot_width").value) ?? 750;
  pageState.settings.height = toNumberOrNull(byId("fc_plot_height").value) ?? 560;
  pageState.settings.x_dtick = toNumberOrNull(byId("fc_x_dtick").value);
  pageState.settings.y_dtick = toNumberOrNull(byId("fc_y_dtick").value);
  pageState.settings.x_title = byId("fc_x_title").value || "Time(day)";
  pageState.settings.y_title = byId("fc_y_title").value || "Yield(L/kg-VS)";
}

function getUnionParameterNamesForModel(modelKey) {
  const found = new Set();

  pageState.curves.forEach((curve) => {
    const fit = curve.fit_results?.[modelKey];
    if (fit?.success && Array.isArray(fit.parameter_names)) {
      fit.parameter_names.forEach((name) => found.add(name));
    }
  });

  const ordered = PARAM_ORDER.filter((name) => found.has(name));
  const extras = Array.from(found).filter((name) => !PARAM_ORDER.includes(name)).sort();
  return ordered.concat(extras);
}

function renderObservedPlot() {
  const plotDivId = "fit-model-plot-observed";
  const traces = [];

  pageState.curves.forEach((curve) => {
    traces.push({
      x: curve.x,
      y: curve.y,
      mode: "lines+markers",
      name: curve.display_name,
      line: {
        color: curve.color,
        width: 2,
      },
      marker: {
        color: curve.color,
        size: 6,
        symbol: "circle",
        line: {
          color: "#ffffff",
          width: 1,
        },
      },
      hovertemplate: "%{x}<br>%{y:.4f}<extra>" + curve.display_name + "</extra>",
    });
  });

  centerPlotContainer(plotDivId);

  const layout = {
    autosize: false,
    width: pageState.settings.width,
    height: pageState.settings.height,
    template: "plotly_white",
    hovermode: "x unified",
    margin: { l: 70, r: 30, t: 30, b: 60 },
    legend: {
      orientation: "h",
      y: 1.12,
      x: 0.5,
      xanchor: "center",
    },
    xaxis: {
      title: pageState.settings.x_title,
      dtick: pageState.settings.x_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
    yaxis: {
      title: pageState.settings.y_title,
      dtick: pageState.settings.y_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
  };

  Plotly.newPlot(plotDivId, traces, layout, {
    responsive: false,
    displaylogo: false,
  });
}

function renderModelTable(modelKey) {
  const modelSection = byId(`fit-model-table-${modelKey}`);
  const paramNames = getUnionParameterNamesForModel(modelKey);

  const rowsHtml = pageState.curves.map((curve) => {
    const fit = curve.fit_results?.[modelKey];
    const paramCells = paramNames.map((name) => {
      if (!fit?.success) return "<td></td>";
      const value = fit.parameters?.[name];
      return `<td>${value === undefined ? "" : Number(value).toFixed(4)}</td>`;
    }).join("");

    const r2 = fit?.success ? Number(fit.r_squared).toFixed(4) : "";
    const rmse = fit?.success ? Number(fit.rmse).toFixed(4) : "";
    const status = fit?.success ? "OK" : (fit?.error || "Fit failed");

    return `
      <tr>
        <td>${curve.display_name}</td>
        ${paramCells}
        <td>${r2}</td>
        <td>${rmse}</td>
        <td>${status}</td>
      </tr>
    `;
  }).join("");

  modelSection.innerHTML = `
    <div class="fit-summary-table-wrap">
      <table class="fit-summary-table">
        <thead>
          <tr>
            <th>Curve</th>
            ${paramNames.map((name) => `<th>${PARAM_LABEL_MAP[name] ?? name}</th>`).join("")}
            <th>R²</th>
            <th>RMSE</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

function renderModelPlot(modelKey) {
  const plotDivId = `fit-model-plot-${modelKey}`;
  const traces = [];

  pageState.curves.forEach((curve) => {
    const fit = curve.fit_results?.[modelKey];
    if (!fit?.success) return;

    traces.push({
      x: fit.t,
      y: fit.y_fit,
      mode: "lines",
      name: `${curve.display_name} | ${fit.model_label}`,
      line: {
        color: curve.color,
        width: 3,
        dash: FIT_LINE_DASH[modelKey] || "dash",
      },
      hovertemplate: "%{x}<br>%{y:.4f}<extra>" + `${curve.display_name} | ${fit.model_label}` + "</extra>",
    });
  });

  centerPlotContainer(plotDivId);

  const layout = {
    autosize: false,
    width: pageState.settings.width,
    height: pageState.settings.height,
    template: "plotly_white",
    hovermode: "x unified",
    margin: { l: 70, r: 30, t: 30, b: 60 },
    legend: {
      orientation: "h",
      y: 1.12,
      x: 0.5,
      xanchor: "center",
    },
    xaxis: {
      title: pageState.settings.x_title,
      dtick: pageState.settings.x_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
    yaxis: {
      title: pageState.settings.y_title,
      dtick: pageState.settings.y_dtick ?? undefined,
      showgrid: true,
      zeroline: false,
    },
  };

  Plotly.newPlot(plotDivId, traces, layout, {
    responsive: false,
    displaylogo: false,
  });
}

function renderModelSections() {
  syncControlsToState();

  const container = byId("fit-compare-model-sections");

  container.innerHTML = `
    <section class="model-compare-section">
      <h3>原始點位比較</h3>
      <div id="fit-model-plot-observed" class="plot-container model-plot-container"></div>
    </section>
    ${ALL_MODEL_KEYS.map((modelKey) => {
      const modelLabel = pageState.curves[0]?.fit_results?.[modelKey]?.model_label || modelKey;
      return `
        <section class="model-compare-section">
          <h3>${modelLabel}</h3>
          <div id="fit-model-plot-${modelKey}" class="plot-container model-plot-container"></div>
          <div id="fit-model-table-${modelKey}" class="fit-summary-box"></div>
        </section>
      `;
    }).join("")}
  `;

  renderObservedPlot();
  ALL_MODEL_KEYS.forEach((modelKey) => {
    renderModelPlot(modelKey);
    renderModelTable(modelKey);
  });
}

async function downloadSelectedPlots() {
  syncControlsToState();

  const selected = Array.from(document.querySelectorAll(".fc-download-plot-checkbox:checked")).map((el) => el.value);
  if (selected.length === 0) {
    alert("請至少勾選一個圖檔。");
    return;
  }

  for (const key of selected) {
    const plotDivId = key === "observed" ? "fit-model-plot-observed" : `fit-model-plot-${key}`;
    const plotDiv = byId(plotDivId);
    if (!plotDiv) continue;

    const filename = key === "observed"
      ? "fit_compare_observed"
      : `fit_compare_${pageState.curves[0]?.fit_results?.[key]?.model_label || key}`;

    const dataUrl = await Plotly.toImage(plotDiv, {
      format: "png",
      width: pageState.settings.width,
      height: pageState.settings.height,
      scale: 2,
    });

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${filename}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

function downloadSelectedTablesCsv() {
  const selected = Array.from(document.querySelectorAll(".fc-download-table-checkbox:checked")).map((el) => el.value);
  if (selected.length === 0) {
    alert("請至少勾選一個資料表。");
    return;
  }

  const allParams = new Set();
  selected.forEach((modelKey) => {
    getUnionParameterNamesForModel(modelKey).forEach((p) => allParams.add(p));
  });

  const orderedParams = PARAM_ORDER.filter((name) => allParams.has(name));
  const extraParams = Array.from(allParams).filter((name) => !PARAM_ORDER.includes(name)).sort();
  const paramNames = orderedParams.concat(extraParams);

  const header = [
    "Model",
    "Curve",
    ...paramNames.map((name) => PARAM_LABEL_MAP[name] ?? name),
    "R²",
    "RMSE",
    "Status",
  ];

  const rows = [];

  selected.forEach((modelKey) => {
    pageState.curves.forEach((curve) => {
      const fit = curve.fit_results?.[modelKey];
      const modelLabel = fit?.model_label || modelKey;

      const row = [modelLabel, curve.display_name];

      paramNames.forEach((name) => {
        const value = fit?.success ? fit.parameters?.[name] : "";
        row.push(value === undefined || value === "" ? "" : Number(value).toFixed(6));
      });

      row.push(fit?.success ? Number(fit.r_squared).toFixed(6) : "");
      row.push(fit?.success ? Number(fit.rmse).toFixed(6) : "");
      row.push(fit?.success ? "OK" : (fit?.error || "Fit failed"));

      rows.push(row);
    });
  });

  const csvText = "\uFEFF" + [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
  downloadTextFile("fit_compare_selected_tables.csv", csvText, "text/csv;charset=utf-8;");
}

function exportSettings() {
  syncControlsToState();
  downloadTextFile("fit_compare_settings.json", JSON.stringify(pageState.settings, null, 2));
}

function importSettings(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const payload = JSON.parse(text);
    pageState.settings = {
      ...pageState.settings,
      ...payload,
    };
    loadControls();
    renderModelSections();
  };
  reader.readAsText(file, "utf-8");
}

function resetSettings() {
  pageState.settings = JSON.parse(JSON.stringify(defaultFitCompareSettings || {}));
  loadControls();
  renderModelSections();
}

function bindEvents() {
  byId("btn-update-fit-compare").addEventListener("click", renderModelSections);
  byId("btn-download-fit-images").addEventListener("click", downloadSelectedPlots);
  byId("btn-download-fit-summary-csv").addEventListener("click", downloadSelectedTablesCsv);

  byId("btn-export-fit-settings").addEventListener("click", exportSettings);
  byId("btn-import-fit-settings").addEventListener("click", () => {
    byId("fit-settings-file-input").click();
  });
  byId("fit-settings-file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) importSettings(file);
    e.target.value = "";
  });
  byId("btn-reset-fit-settings").addEventListener("click", resetSettings);

  [
    "fc_plot_width",
    "fc_plot_height",
    "fc_x_dtick",
    "fc_y_dtick",
    "fc_x_title",
    "fc_y_title",
  ].forEach((id) => {
    const el = byId(id);
    if (!el) return;
    el.addEventListener("change", renderModelSections);
  });
}

function init() {
  loadControls();
  bindEvents();
  renderModelSections();
}

document.addEventListener("DOMContentLoaded", init);