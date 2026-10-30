function byId(id) {
  return document.getElementById(id);
}

function numVal(id, fallback = 0) {
  const el = byId(id);
  if (!el) return fallback;
  const v = parseInt(el.value, 10);
  return Number.isNaN(v) ? fallback : v;
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

function createInput(value = "", type = "text") {
  const input = document.createElement("input");
  input.type = type;
  input.value = value ?? "";
  return input;
}

function normalizeReplicateInputs() {
  const expInput = byId("exp_replicates");
  const bkInput = byId("bk_replicates");

  let expVal = parseInt(expInput.value, 10);
  let bkVal = parseInt(bkInput.value, 10);

  if (Number.isNaN(expVal) || expVal < 1) expVal = 1;
  if (Number.isNaN(bkVal) || bkVal < 0) bkVal = 0;

  expInput.value = expVal;
  bkInput.value = bkVal;

  return { expVal, bkVal };
}

function getFormState() {
  return {
    project_name: byId("project_name").value,
    sample_name: byId("sample_name").value,
    sample_wet_weight_g: byId("sample_wet_weight_g").value,
    exp_replicates: byId("exp_replicates").value,
    bk_replicates: byId("bk_replicates").value,
    apply_bk_subtraction: byId("apply_bk_subtraction").value,
    negative_policy: byId("negative_policy").value,
    tsvs_rows: getTSVSRows(),
    gas_rows: getGasRows(),
  };
}

function setFormState(state) {
  byId("project_name").value = state.project_name ?? "";
  byId("sample_name").value = state.sample_name ?? "";
  byId("sample_wet_weight_g").value = state.sample_wet_weight_g ?? "";
  byId("exp_replicates").value = state.exp_replicates ?? 3;
  byId("bk_replicates").value = state.bk_replicates ?? 2;
  byId("apply_bk_subtraction").value = state.apply_bk_subtraction ?? "yes";
  byId("negative_policy").value = state.negative_policy ?? "keep";

  normalizeReplicateInputs();
  buildTSVSTable(state.tsvs_rows ?? []);
  buildGasTable(state.gas_rows ?? []);
  syncReplicateBaseline();
}

function buildTSVSTable(rows = []) {
  const table = byId("tsvs-table");
  table.innerHTML = "";

  const headers = [
    "空坩鍋重(g)",
    "加料後重(g)",
    "105°C烘乾後重(g)",
    "550°C灰化後重(g)",
  ];

  const keys = [
    "empty_crucible_g",
    "wet_total_g",
    "dry_total_g",
    "ash_total_g",
  ];

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  });

  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const dataRows = rows.length
    ? rows
    : [
        { empty_crucible_g: "", wet_total_g: "", dry_total_g: "", ash_total_g: "" },
        { empty_crucible_g: "", wet_total_g: "", dry_total_g: "", ash_total_g: "" },
      ];

  dataRows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    keys.forEach((key, colIndex) => {
      const td = document.createElement("td");
      const input = createInput(row[key] ?? "", "number");
      input.step = "any";
      input.dataset.table = "tsvs";
      input.dataset.row = rowIndex;
      input.dataset.col = colIndex;
      input.dataset.key = key;
      td.appendChild(input);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function buildGasTable(rows = []) {
  const expReps = numVal("exp_replicates", 3);
  const bkReps = numVal("bk_replicates", 2);
  const table = byId("gas-table");
  table.innerHTML = "";

  const thead = document.createElement("thead");
  const hr = document.createElement("tr");

  const headers = ["Day"];
  for (let i = 1; i <= expReps; i += 1) headers.push(`Exp ${i}`);
  for (let i = 1; i <= bkReps; i += 1) headers.push(`BK ${i}`);

  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  });

  thead.appendChild(hr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  const dataRows = rows.length
    ? rows
    : Array.from({ length: 8 }, (_, i) => ({
        day: i,
        exp_values: Array(expReps).fill(""),
        bk_values: Array(bkReps).fill(""),
      }));

  dataRows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    const dayTd = document.createElement("td");
    const dayInput = createInput(row.day ?? "", "number");
    dayInput.step = "1";
    dayInput.dataset.table = "gas";
    dayInput.dataset.row = rowIndex;
    dayInput.dataset.col = 0;
    dayInput.dataset.key = "day";
    dayTd.appendChild(dayInput);
    tr.appendChild(dayTd);

    for (let i = 0; i < expReps; i += 1) {
      const td = document.createElement("td");
      const input = createInput((row.exp_values ?? [])[i] ?? "", "number");
      input.step = "any";
      input.dataset.table = "gas";
      input.dataset.row = rowIndex;
      input.dataset.col = 1 + i;
      input.dataset.group = "exp_values";
      input.dataset.index = i;
      td.appendChild(input);
      tr.appendChild(td);
    }

    for (let i = 0; i < bkReps; i += 1) {
      const td = document.createElement("td");
      const input = createInput((row.bk_values ?? [])[i] ?? "", "number");
      input.step = "any";
      input.dataset.table = "gas";
      input.dataset.row = rowIndex;
      input.dataset.col = 1 + expReps + i;
      input.dataset.group = "bk_values";
      input.dataset.index = i;
      td.appendChild(input);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
}

function getTSVSRows() {
  const rows = [];
  const tbody = byId("tsvs-table").querySelector("tbody");
  if (!tbody) return rows;

  tbody.querySelectorAll("tr").forEach((tr) => {
    const inputs = tr.querySelectorAll("input");
    rows.push({
      empty_crucible_g: inputs[0]?.value ?? "",
      wet_total_g: inputs[1]?.value ?? "",
      dry_total_g: inputs[2]?.value ?? "",
      ash_total_g: inputs[3]?.value ?? "",
    });
  });

  return rows;
}

function getGasRows() {
  const rows = [];
  const tbody = byId("gas-table").querySelector("tbody");
  if (!tbody) return rows;

  const expReps = numVal("exp_replicates", 3);
  const bkReps = numVal("bk_replicates", 2);

  tbody.querySelectorAll("tr").forEach((tr) => {
    const inputs = tr.querySelectorAll("input");
    const row = {
      day: inputs[0]?.value ?? "",
      exp_values: [],
      bk_values: [],
    };

    for (let i = 0; i < expReps; i += 1) {
      row.exp_values.push(inputs[1 + i]?.value ?? "");
    }

    for (let i = 0; i < bkReps; i += 1) {
      row.bk_values.push(inputs[1 + expReps + i]?.value ?? "");
    }

    rows.push(row);
  });

  return rows;
}

function addTSVSRow() {
  const rows = getTSVSRows();
  rows.push({
    empty_crucible_g: "",
    wet_total_g: "",
    dry_total_g: "",
    ash_total_g: "",
  });
  buildTSVSTable(rows);
}

function delTSVSRow() {
  const rows = getTSVSRows();
  if (rows.length > 1) rows.pop();
  buildTSVSTable(rows);
}

function addGasRow() {
  const rows = getGasRows();
  const expReps = numVal("exp_replicates", 3);
  const bkReps = numVal("bk_replicates", 2);
  const nextDay = rows.length ? Number(rows[rows.length - 1].day || 0) + 1 : 0;

  rows.push({
    day: nextDay,
    exp_values: Array(expReps).fill(""),
    bk_values: Array(bkReps).fill(""),
  });

  buildGasTable(rows);
}

function delGasRow() {
  const rows = getGasRows();
  if (rows.length > 1) rows.pop();
  buildGasTable(rows);
}

function rebuildTablesPreserveValues() {
  const tsvsRows = getTSVSRows();
  const gasRows = getGasRows();
  buildTSVSTable(tsvsRows);
  buildGasTable(gasRows);
}

function saveProjectJson() {
  const state = getFormState();
  const filenameBase = (state.project_name || "bmp_project").trim() || "bmp_project";
  downloadTextFile(`${filenameBase}.json`, JSON.stringify(state, null, 2));
}

function loadProjectJsonFromFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const state = JSON.parse(text);
    setFormState(state);
  };
  reader.readAsText(file, "utf-8");
}

function serializeTablesForSubmit() {
  byId("tsvs_json").value = JSON.stringify(getTSVSRows());
  byId("gas_json").value = JSON.stringify(getGasRows());
}

function findInput(tableName, row, col) {
  return document.querySelector(
    `input[data-table="${tableName}"][data-row="${row}"][data-col="${col}"]`
  );
}

function applyGridPaste(startInput, clipboardText) {
  const tableName = startInput.dataset.table;
  const startRow = Number(startInput.dataset.row);
  const startCol = Number(startInput.dataset.col);

  const lines = clipboardText.replace(/\r/g, "").split("\n").filter((line) => line.length > 0);

  lines.forEach((line, rOffset) => {
    const values = line.split("\t");
    values.forEach((value, cOffset) => {
      const target = findInput(tableName, startRow + rOffset, startCol + cOffset);
      if (target) target.value = value;
    });
  });
}

function bindPasteSupport() {
  document.addEventListener("paste", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.dataset.table) return;

    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (text.includes("\t") || text.includes("\n")) {
      event.preventDefault();
      applyGridPaste(target, text);
    }
  });
}

let lastReplicateState = {
  exp: null,
  bk: null,
};

function syncReplicateBaseline() {
  const { expVal, bkVal } = normalizeReplicateInputs();
  lastReplicateState.exp = expVal;
  lastReplicateState.bk = bkVal;
}

function maybeRebuildTablesOnReplicateChange() {
  const { expVal, bkVal } = normalizeReplicateInputs();

  const changed =
    expVal !== lastReplicateState.exp ||
    bkVal !== lastReplicateState.bk;

  if (!changed) return;

  rebuildTablesPreserveValues();
  lastReplicateState.exp = expVal;
  lastReplicateState.bk = bkVal;
}

function bindAutoRebuildEvents() {
  const expInput = byId("exp_replicates");
  const bkInput = byId("bk_replicates");

  if (expInput) {
    expInput.addEventListener("change", maybeRebuildTablesOnReplicateChange);
    expInput.addEventListener("blur", maybeRebuildTablesOnReplicateChange);
  }

  if (bkInput) {
    bkInput.addEventListener("change", maybeRebuildTablesOnReplicateChange);
    bkInput.addEventListener("blur", maybeRebuildTablesOnReplicateChange);
  }
}

function bindEvents() {
  byId("btn-add-tsvs-row").addEventListener("click", addTSVSRow);
  byId("btn-del-tsvs-row").addEventListener("click", delTSVSRow);
  byId("btn-add-gas-row").addEventListener("click", addGasRow);
  byId("btn-del-gas-row").addEventListener("click", delGasRow);

  byId("btn-save-project").addEventListener("click", saveProjectJson);
  byId("btn-load-project").addEventListener("click", () => byId("project-file-input").click());

  byId("project-file-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    if (file) loadProjectJsonFromFile(file);
    e.target.value = "";
  });

  byId("bmp-form").addEventListener("submit", serializeTablesForSubmit);

  bindAutoRebuildEvents();
}

function init() {
  normalizeReplicateInputs();
  buildTSVSTable(window.DEMO_TSVS || []);
  buildGasTable(window.DEMO_GAS || []);
  syncReplicateBaseline();
  bindEvents();
  bindPasteSupport();
}

document.addEventListener("DOMContentLoaded", init);