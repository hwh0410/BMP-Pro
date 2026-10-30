function byId(id) {
  return document.getElementById(id);
}

function makeId(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
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

function createEmptyTsvsRow() {
  return {
    empty_crucible_g: "",
    wet_total_g: "",
    dry_total_g: "",
    ash_total_g: "",
  };
}

function createSample(type, index) {
  return {
    id: makeId(type),
    type,
    name: type === "inoculum" ? `植種${index}` : `基質${index}`,
    wet_weight_g: "",
    replicate_count: 2,
    tsvs_rows: [createEmptyTsvsRow(), createEmptyTsvsRow()],
  };
}

const initialPayload = window.INITIAL_RATIO_PAYLOAD;

function getDefaultRatioState() {
  return {
    project_name: "植種比與共醱酵比例計算",
    inocula: [createSample("inoculum", 1)],
    substrates: [createSample("substrate", 1)],
  };
}

let pageState = getDefaultRatioState();

function clonePayload(payload) {
  return JSON.parse(JSON.stringify(payload));
}

function loadInitialPayload() {
  if (!initialPayload) return;

  pageState.project_name = initialPayload.project_name || pageState.project_name;
  pageState.inocula = (initialPayload.inocula || []).map((sample, idx) => ({
    id: makeId("inoculum"),
    type: "inoculum",
    name: sample.name || `植種${idx + 1}`,
    wet_weight_g: sample.wet_weight_g ?? "",
    replicate_count: Number(sample.replicate_count || (sample.tsvs_rows?.length ?? 2)),
    tsvs_rows: (sample.tsvs_rows || []).map((row) => ({
      empty_crucible_g: row.empty_crucible_g ?? "",
      wet_total_g: row.wet_total_g ?? "",
      dry_total_g: row.dry_total_g ?? "",
      ash_total_g: row.ash_total_g ?? "",
    })),
  }));

  pageState.substrates = (initialPayload.substrates || []).map((sample, idx) => ({
    id: makeId("substrate"),
    type: "substrate",
    name: sample.name || `基質${idx + 1}`,
    wet_weight_g: sample.wet_weight_g ?? "",
    replicate_count: Number(sample.replicate_count || (sample.tsvs_rows?.length ?? 2)),
    tsvs_rows: (sample.tsvs_rows || []).map((row) => ({
      empty_crucible_g: row.empty_crucible_g ?? "",
      wet_total_g: row.wet_total_g ?? "",
      dry_total_g: row.dry_total_g ?? "",
      ash_total_g: row.ash_total_g ?? "",
    })),
  }));
}

function ensureRowCount(sample, targetCount) {
  const count = Math.max(1, Number(targetCount || 1));
  while (sample.tsvs_rows.length < count) {
    sample.tsvs_rows.push(createEmptyTsvsRow());
  }
  while (sample.tsvs_rows.length > count) {
    sample.tsvs_rows.pop();
  }
  sample.replicate_count = count;
}

function getSampleList(type) {
  return type === "inoculum" ? pageState.inocula : pageState.substrates;
}

function getProjectStateForSave() {
  return {
    project_name: pageState.project_name,
    inocula: pageState.inocula.map((s) => ({
      name: s.name,
      wet_weight_g: s.wet_weight_g,
      replicate_count: s.replicate_count,
      tsvs_rows: clonePayload(s.tsvs_rows),
    })),
    substrates: pageState.substrates.map((s) => ({
      name: s.name,
      wet_weight_g: s.wet_weight_g,
      replicate_count: s.replicate_count,
      tsvs_rows: clonePayload(s.tsvs_rows),
    })),
  };
}

function setProjectState(state) {
  pageState = {
    project_name: state.project_name || "植種比與共醱酵比例計算",
    inocula: (state.inocula || []).map((sample, idx) => ({
      id: makeId("inoculum"),
      type: "inoculum",
      name: sample.name || `植種${idx + 1}`,
      wet_weight_g: sample.wet_weight_g ?? "",
      replicate_count: Number(sample.replicate_count || (sample.tsvs_rows?.length ?? 2)),
      tsvs_rows: (sample.tsvs_rows || []).map((row) => ({
        empty_crucible_g: row.empty_crucible_g ?? "",
        wet_total_g: row.wet_total_g ?? "",
        dry_total_g: row.dry_total_g ?? "",
        ash_total_g: row.ash_total_g ?? "",
      })),
    })),
    substrates: (state.substrates || []).map((sample, idx) => ({
      id: makeId("substrate"),
      type: "substrate",
      name: sample.name || `基質${idx + 1}`,
      wet_weight_g: sample.wet_weight_g ?? "",
      replicate_count: Number(sample.replicate_count || (sample.tsvs_rows?.length ?? 2)),
      tsvs_rows: (sample.tsvs_rows || []).map((row) => ({
        empty_crucible_g: row.empty_crucible_g ?? "",
        wet_total_g: row.wet_total_g ?? "",
        dry_total_g: row.dry_total_g ?? "",
        ash_total_g: row.ash_total_g ?? "",
      })),
    })),
  };

  if (!pageState.inocula.length) pageState.inocula = [createSample("inoculum", 1)];
  if (!pageState.substrates.length) pageState.substrates = [createSample("substrate", 1)];

  renderAll();
}

function resetProjectState() {
  pageState = getDefaultRatioState();
  renderAll();
}

function saveProjectJson() {
  const state = getProjectStateForSave();
  const filenameBase = (state.project_name || "ratio_tool_project").trim() || "ratio_tool_project";
  downloadTextFile(`${filenameBase}.json`, JSON.stringify(state, null, 2));
}

function loadProjectJsonFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const state = JSON.parse(text);
    setProjectState(state);
  };
  reader.readAsText(file, "utf-8");
}

function renderSamples(type) {
  const container = byId(type === "inoculum" ? "inocula-container" : "substrates-container");
  const samples = getSampleList(type);

  container.innerHTML = "";

  samples.forEach((sample, sampleIndex) => {
    const card = document.createElement("section");
    card.className = "sample-card";

    const rowsHtml = sample.tsvs_rows.map((row, rowIndex) => `
      <tr>
        <td><input type="number" step="any" data-type="${type}" data-sample="${sample.id}" data-row="${rowIndex}" data-key="empty_crucible_g" value="${row.empty_crucible_g ?? ""}"></td>
        <td><input type="number" step="any" data-type="${type}" data-sample="${sample.id}" data-row="${rowIndex}" data-key="wet_total_g" value="${row.wet_total_g ?? ""}"></td>
        <td><input type="number" step="any" data-type="${type}" data-sample="${sample.id}" data-row="${rowIndex}" data-key="dry_total_g" value="${row.dry_total_g ?? ""}"></td>
        <td><input type="number" step="any" data-type="${type}" data-sample="${sample.id}" data-row="${rowIndex}" data-key="ash_total_g" value="${row.ash_total_g ?? ""}"></td>
      </tr>
    `).join("");

    card.innerHTML = `
      <div class="section-head">
        <h3>${type === "inoculum" ? "植種樣品" : "基質樣品"} ${sampleIndex + 1}</h3>
        <div class="button-row">
          <button type="button" class="secondary btn-remove-sample" data-type="${type}" data-sample="${sample.id}">刪除此樣品</button>
        </div>
      </div>

      <div class="grid-3">
        <label>樣品名稱
          <input type="text" class="sample-name-input" data-type="${type}" data-sample="${sample.id}" value="${sample.name}">
        </label>

        <label>樣品添加量(g)
          <input type="number" step="any" class="sample-wet-input" data-type="${type}" data-sample="${sample.id}" value="${sample.wet_weight_g}">
        </label>

        <label>平行樣數
          <input type="number" min="1" class="sample-rep-input" data-type="${type}" data-sample="${sample.id}" value="${sample.replicate_count}">
        </label>
      </div>

      <div class="table-wrap top-gap">
        <table class="edit-table">
          <thead>
            <tr>
              <th>空坩鍋重(g)</th>
              <th>加料後重(g)</th>
              <th>105°C烘乾後重(g)</th>
              <th>550°C灰化後重(g)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;

    container.appendChild(card);
  });
}

function renderAll() {
  byId("ratio_project_name").value = pageState.project_name;
  renderSamples("inoculum");
  renderSamples("substrate");
  bindDynamicEvents();
}

function findSample(type, sampleId) {
  return getSampleList(type).find((s) => s.id === sampleId);
}

function bindDynamicEvents() {
  document.querySelectorAll(".sample-name-input").forEach((el) => {
    el.addEventListener("input", (e) => {
      const sample = findSample(e.target.dataset.type, e.target.dataset.sample);
      if (sample) sample.name = e.target.value;
    });
  });

  document.querySelectorAll(".sample-wet-input").forEach((el) => {
    el.addEventListener("input", (e) => {
      const sample = findSample(e.target.dataset.type, e.target.dataset.sample);
      if (sample) sample.wet_weight_g = e.target.value;
    });
  });

  document.querySelectorAll(".sample-rep-input").forEach((el) => {
    el.addEventListener("change", (e) => {
      const sample = findSample(e.target.dataset.type, e.target.dataset.sample);
      if (!sample) return;
      ensureRowCount(sample, e.target.value);
      renderAll();
    });
  });

  document.querySelectorAll("input[data-key]").forEach((el) => {
    el.addEventListener("input", (e) => {
      const sample = findSample(e.target.dataset.type, e.target.dataset.sample);
      if (!sample) return;
      const row = sample.tsvs_rows[Number(e.target.dataset.row)];
      if (!row) return;
      row[e.target.dataset.key] = e.target.value;
    });
  });

  document.querySelectorAll(".btn-remove-sample").forEach((el) => {
    el.addEventListener("click", (e) => {
      const type = e.target.dataset.type;
      const sampleId = e.target.dataset.sample;
      const list = getSampleList(type);
      if (list.length <= 1) return;
      const idx = list.findIndex((s) => s.id === sampleId);
      if (idx >= 0) {
        list.splice(idx, 1);
        renderAll();
      }
    });
  });
}

function bindStaticEvents() {
  byId("btn-add-inoculum").addEventListener("click", () => {
    pageState.inocula.push(createSample("inoculum", pageState.inocula.length + 1));
    renderAll();
  });

  byId("btn-add-substrate").addEventListener("click", () => {
    pageState.substrates.push(createSample("substrate", pageState.substrates.length + 1));
    renderAll();
  });

  byId("ratio_project_name").addEventListener("input", (e) => {
    pageState.project_name = e.target.value;
  });

  byId("btn-save-ratio-project").addEventListener("click", saveProjectJson);
  byId("btn-load-ratio-project").addEventListener("click", () => {
    byId("ratio-project-file-input").click();
  });
  byId("ratio-project-file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadProjectJsonFromFile(file);
    e.target.value = "";
  });
  byId("btn-reset-ratio-project").addEventListener("click", resetProjectState);

  byId("ratio-tool-form").addEventListener("submit", () => {
    pageState.project_name = byId("ratio_project_name").value;
    byId("ratio_payload_json").value = JSON.stringify(getProjectStateForSave());
  });

  if (window.RATIO_RESULT) {
    const btn = byId("btn-download-ratio-csv");
    if (btn) {
      btn.addEventListener("click", () => {
        const blob = new Blob([window.RATIO_RESULT.export_csv_text], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = window.RATIO_RESULT.export_filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadInitialPayload();
  bindStaticEvents();
  renderAll();
});