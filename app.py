from __future__ import annotations

import json
import os
import re
import sys
from typing import List

import pandas as pd
from flask import Flask, render_template, request

from config import (
    SECRET_KEY,
    MAX_CONTENT_LENGTH,
    UPLOAD_FOLDER,
    PROJECTS_FOLDER,
    TMP_FOLDER,
)


def resource_path(relative_path):
    try:
        base_path = sys._MEIPASS
    except Exception:
        base_path = os.path.abspath(".")

    return os.path.join(base_path, relative_path)


app = Flask(
    __name__,
    template_folder=resource_path("templates"),
    static_folder=resource_path("static"),
)

app.config["SECRET_KEY"] = SECRET_KEY
app.config["MAX_CONTENT_LENGTH"] = MAX_CONTENT_LENGTH
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["PROJECTS_FOLDER"] = PROJECTS_FOLDER
app.config["TMP_FOLDER"] = TMP_FOLDER

for folder in [UPLOAD_FOLDER, PROJECTS_FOLDER, TMP_FOLDER]:
    os.makedirs(folder, exist_ok=True)


from bmp_core import (
    BMPProject,
    BMPSettings,
    TSVSRecord,
    GasDayRecord,
    run_bmp_analysis,
    FIT_MODEL_ORDER,
    FIT_MODEL_LABELS,
    fit_all_supported_models,
)




def parse_float_or_none(value):
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
    return float(value)


def parse_tsvs_json(tsvs_json: str) -> List[TSVSRecord]:
    if not tsvs_json:
        return []

    rows = json.loads(tsvs_json)
    records: List[TSVSRecord] = []
    for row in rows:
        if all(
            str(row.get(k, "")).strip() == ""
            for k in ["empty_crucible_g", "wet_total_g", "dry_total_g", "ash_total_g"]
        ):
            continue

        records.append(
            TSVSRecord(
                empty_crucible_g=float(row["empty_crucible_g"]),
                wet_total_g=float(row["wet_total_g"]),
                dry_total_g=float(row["dry_total_g"]),
                ash_total_g=float(row["ash_total_g"]),
            )
        )
    return records


def parse_gas_json(gas_json: str, exp_reps: int, bk_reps: int) -> List[GasDayRecord]:
    if not gas_json:
        return []

    rows = json.loads(gas_json)
    records: List[GasDayRecord] = []
    for row in rows:
        day_raw = row.get("day", "")
        if str(day_raw).strip() == "":
            continue

        exp_values = row.get("exp_values", [])
        bk_values = row.get("bk_values", [])

        exp_values = [parse_float_or_none(v) for v in exp_values[:exp_reps]]
        bk_values = [parse_float_or_none(v) for v in bk_values[:bk_reps]]

        while len(exp_values) < exp_reps:
            exp_values.append(None)
        while len(bk_values) < bk_reps:
            bk_values.append(None)

        records.append(
            GasDayRecord(
                day=int(day_raw),
                exp_values=exp_values,
                bk_values=bk_values,
            )
        )

    return records


def build_export_cumulative_df(raw_df: pd.DataFrame, result_df: pd.DataFrame, sample_name: str) -> pd.DataFrame:
    exp_cols = [c for c in raw_df.columns if c.startswith("exp_")]
    bk_cols = [c for c in raw_df.columns if c.startswith("bk_")]

    sampled_mask = raw_df[exp_cols + bk_cols].notna().any(axis=1)

    export_df = pd.DataFrame(
        {
            "Time": result_df["day"],
            sample_name: pd.to_numeric(result_df["cumulative_mean"], errors="coerce"),
        }
    )

    export_df.loc[~sampled_mask, sample_name] = float("nan")
    return export_df


def _simplify_fit_results(fit_results: dict) -> dict:
    payload = {}
    for model_key in FIT_MODEL_ORDER:
        result = fit_results.get(model_key, {})
        if result.get("success"):
            payload[model_key] = {
                "success": True,
                "model_key": model_key,
                "model_label": result["model_label"],
                "parameter_names": result["parameter_names"],
                "parameters": result["parameters"],
                "r_squared": float(result["r_squared"]),
                "rmse": float(result["rmse"]),
                "t": result["t"],
                "y_true": result["y_true"],
                "y_fit": result["y_fit"],
            }
        else:
            payload[model_key] = {
                "success": False,
                "model_key": model_key,
                "model_label": FIT_MODEL_LABELS[model_key],
                "error": result.get("error", "Fit failed"),
            }
    return payload


def build_plot_payload(
    raw_df: pd.DataFrame,
    result_df: pd.DataFrame,
    fit_results: dict,
    project_name: str,
    sample_name: str,
    default_model: str,
) -> dict:
    exp_cols = [c for c in raw_df.columns if c.startswith("exp_")]
    bk_cols = [c for c in raw_df.columns if c.startswith("bk_")]
    sampled_mask = raw_df[exp_cols + bk_cols].notna().any(axis=1).tolist()

    replicate_cols = [
        c for c in result_df.columns
        if c.startswith("cumulative_") and c.split("_")[-1].isdigit()
    ]

    replicates = []
    for col in replicate_cols:
        replicates.append(
            {
                "name": col,
                "x": result_df["day"].tolist(),
                "y": pd.to_numeric(result_df[col], errors="coerce").tolist(),
            }
        )

    model_options = [
        {"key": key, "label": FIT_MODEL_LABELS[key]}
        for key in FIT_MODEL_ORDER
    ]

    return {
        "project_name": project_name,
        "sample_name": sample_name,
        "days": result_df["day"].tolist(),
        "cumulative_mean": pd.to_numeric(result_df["cumulative_mean"], errors="coerce").tolist(),
        "sampled_mask": sampled_mask,
        "replicates": replicates,
        "fit_results": _simplify_fit_results(fit_results),
        "fit_model_options": model_options,
        "default_model": default_model,
    }


def get_default_plot_settings() -> dict:
    return {
        "width": 800,
        "height": 500,
        "mean_color": "#1f77b4",
        "fit_color": "#d62728",
        "marker_symbol": "circle",
        "marker_size": 8,
        "x_dtick": 5,
        "y_dtick": 100,
        "show_replicates": False,
        "show_fit": True,
        "fit_model": "gompertz",
        "mean_line_width": 3,
        "fit_line_width": 3,
        "x_title": "Time(day)",
        "y_title": "Yield(L/kg-VS)",
    }


def get_default_multi_curve_settings() -> dict:
    return {
        "width": 900,
        "height": 560,
        "x_title": "Time(day)",
        "y_title": "Yield(L/kg-VS)",
        "x_dtick": 5,
        "y_dtick": 100,
    }


def get_default_fit_compare_settings() -> dict:
    return {
        "width": 750,
        "height": 560,
        "x_title": "Time(day)",
        "y_title": "Yield(L/kg-VS)",
        "x_dtick": 5,
        "y_dtick": 100,
        "show_observed_markers": True,
    }


def get_demo_seed_data():
    demo_tsvs = [
        {
            "empty_crucible_g": "25.000",
            "wet_total_g": "30.000",
            "dry_total_g": "26.000",
            "ash_total_g": "25.300",
        },
        {
            "empty_crucible_g": "25.100",
            "wet_total_g": "30.100",
            "dry_total_g": "26.080",
            "ash_total_g": "25.360",
        },
    ]

    demo_gas = [
        {"day": 0, "exp_values": [0, 0, 0], "bk_values": [0, 0]},
        {"day": 1, "exp_values": [15.0, 14.5, 15.2], "bk_values": [2.5, 2.7]},
        {"day": 2, "exp_values": [22.0, 21.8, 22.5], "bk_values": [3.0, 2.9]},
        {"day": 3, "exp_values": [28.0, "", 27.5], "bk_values": [3.2, 3.1]},
        {"day": 4, "exp_values": [26.0, 25.8, 26.3], "bk_values": [2.8, 2.7]},
        {"day": 5, "exp_values": [20.0, 19.5, 20.1], "bk_values": [2.1, 2.2]},
        {"day": 6, "exp_values": [15.0, 14.8, 15.3], "bk_values": [1.8, 1.7]},
        {"day": 7, "exp_values": [10.2, 10.0, 10.1], "bk_values": [1.2, 1.1]},
    ]
    return demo_tsvs, demo_gas


def _clean_curve_name(name: str, fallback: str) -> str:
    text = str(name).strip()
    return text if text else fallback


def _curve_display_defaults(curve_idx: int, curve_name: str) -> dict:
    palette = [
        "#1f77b4",
        "#d62728",
        "#2ca02c",
        "#9467bd",
        "#ff7f0e",
        "#8c564b",
        "#17becf",
        "#e377c2",
        "#7f7f7f",
        "#bcbd22",
    ]
    marker_symbols = [
        "circle",
        "square",
        "diamond",
        "triangle-up",
        "triangle-down",
        "cross",
        "x",
        "star",
        "hexagon",
        "pentagon",
    ]

    return {
        "display_name": curve_name,
        "line_color": palette[curve_idx % len(palette)],
        "marker_symbol": marker_symbols[curve_idx % len(marker_symbols)],
        "marker_size": 7,
        "line_width": 3,
        "visible": True,
    }


def _curve_color(curve_idx: int) -> str:
    palette = [
        "#1f77b4",
        "#d62728",
        "#2ca02c",
        "#9467bd",
        "#ff7f0e",
        "#8c564b",
        "#17becf",
        "#e377c2",
        "#7f7f7f",
        "#bcbd22",
    ]
    return palette[curve_idx % len(palette)]


def parse_multi_curve_files(files) -> dict:
    curves = []
    curve_display_defaults = {}
    curve_count = 0

    for file in files:
        if not file or not file.filename:
            continue

        df = pd.read_csv(file, encoding="utf-8-sig")
        if df.empty or df.shape[1] < 2:
            continue

        time_col = df.columns[0]
        time_series = pd.to_numeric(df[time_col], errors="coerce")

        source_filename = str(file.filename).strip()
        source_stem = re.sub(r"\.[^.]+$", "", source_filename) if source_filename else "curve"

        valid_curve_columns = []
        for col in df.columns[1:]:
            y_series = pd.to_numeric(df[col], errors="coerce")
            valid_mask = time_series.notna() & y_series.notna()
            if valid_mask.sum() > 0:
                valid_curve_columns.append(col)

        for col in valid_curve_columns:
            y_series = pd.to_numeric(df[col], errors="coerce")
            valid_mask = time_series.notna() & y_series.notna()

            curve_count += 1
            curve_id = f"curve_{curve_count:03d}"
            curve_name = _clean_curve_name(col, f"Curve {curve_count}")

            if len(valid_curve_columns) == 1:
                selector_label = source_stem
            else:
                selector_label = f"{source_stem} | {curve_name}"

            curve_df = pd.DataFrame(
                {
                    "day": time_series[valid_mask],
                    "cumulative_mean": y_series[valid_mask],
                }
            ).sort_values("day")

            curve_df = curve_df.drop_duplicates(subset="day", keep="last").reset_index(drop=True)

            curves.append(
                {
                    "curve_id": curve_id,
                    "curve_name": curve_name,
                    "selector_label": selector_label,
                    "source_file": source_filename,
                    "x": pd.to_numeric(curve_df["day"], errors="coerce").tolist(),
                    "y": pd.to_numeric(curve_df["cumulative_mean"], errors="coerce").tolist(),
                }
            )

            curve_display_defaults[curve_id] = _curve_display_defaults(curve_count - 1, curve_name)

    if not curves:
        raise ValueError("沒有讀到有效的曲線資料。請確認上傳的是由BMP分析工具匯出的累積產氣CSV，且至少包含 Time 與一條曲線欄位。")

    return {
        "curves": curves,
        "curve_display_defaults": curve_display_defaults,
    }


def parse_fit_compare_files(files) -> dict:
    curves = []
    curve_count = 0

    for file in files:
        if not file or not file.filename:
            continue

        df = pd.read_csv(file, encoding="utf-8-sig")
        if df.empty or df.shape[1] < 2:
            continue

        time_col = df.columns[0]
        time_series = pd.to_numeric(df[time_col], errors="coerce")

        source_filename = str(file.filename).strip()
        source_stem = re.sub(r"\.[^.]+$", "", source_filename) if source_filename else "curve"

        valid_curve_columns = []
        for col in df.columns[1:]:
            y_series = pd.to_numeric(df[col], errors="coerce")
            valid_mask = time_series.notna() & y_series.notna()
            if valid_mask.sum() > 0:
                valid_curve_columns.append(col)

        for col in valid_curve_columns:
            y_series = pd.to_numeric(df[col], errors="coerce")
            valid_mask = time_series.notna() & y_series.notna()

            curve_count += 1
            curve_id = f"fit_curve_{curve_count:03d}"
            curve_name = _clean_curve_name(col, f"Curve {curve_count}")

            if len(valid_curve_columns) == 1:
                display_name = source_stem
            else:
                display_name = f"{source_stem} | {curve_name}"

            curve_df = pd.DataFrame(
                {
                    "day": time_series[valid_mask],
                    "cumulative_mean": y_series[valid_mask],
                }
            ).sort_values("day")

            curve_df = curve_df.drop_duplicates(subset="day", keep="last").reset_index(drop=True)

            fit_results = fit_all_supported_models(curve_df, target="mean")

            curves.append(
                {
                    "curve_id": curve_id,
                    "display_name": display_name,
                    "source_file": source_filename,
                    "color": _curve_color(curve_count - 1),
                    "x": pd.to_numeric(curve_df["day"], errors="coerce").tolist(),
                    "y": pd.to_numeric(curve_df["cumulative_mean"], errors="coerce").tolist(),
                    "fit_results": _simplify_fit_results(fit_results),
                }
            )

    if not curves:
        raise ValueError("沒有讀到有效的曲線資料。請確認上傳的是由BMP分析工具匯出的累積產氣CSV，且至少包含 Time 與一條曲線欄位。")

    model_options = [{"key": key, "label": FIT_MODEL_LABELS[key]} for key in FIT_MODEL_ORDER]

    return {
        "curves": curves,
        "fit_model_options": model_options,
    }

def parse_ratio_tool_json(payload_json: str) -> dict:
    if not payload_json:
        return {"project_name": "", "inocula": [], "substrates": []}
    return json.loads(payload_json)


def compute_tsvs_metrics(records: list[dict], wet_weight_g: float) -> dict:
    cleaned = []
    for row in records:
        if all(str(row.get(k, "")).strip() == "" for k in ["empty_crucible_g", "wet_total_g", "dry_total_g", "ash_total_g"]):
            continue

        empty_g = float(row["empty_crucible_g"])
        wet_total_g = float(row["wet_total_g"])
        dry_total_g = float(row["dry_total_g"])
        ash_total_g = float(row["ash_total_g"])

        wet_sample_g = wet_total_g - empty_g
        dry_sample_g = dry_total_g - empty_g
        ash_sample_g = ash_total_g - empty_g
        vs_sample_g = dry_sample_g - ash_sample_g

        if wet_sample_g <= 0:
            raise ValueError("TS/VS計算時，濕樣重必須大於0。")
        if dry_sample_g <= 0:
            raise ValueError("TS/VS計算時，乾樣重必須大於0。")
        if vs_sample_g < 0:
            raise ValueError("TS/VS計算時，VS質量不可為負值。")

        ts_fraction = dry_sample_g / wet_sample_g
        vs_ts_fraction = vs_sample_g / dry_sample_g
        vs_wet_fraction = vs_sample_g / wet_sample_g

        cleaned.append(
            {
                "empty_crucible_g": empty_g,
                "wet_total_g": wet_total_g,
                "dry_total_g": dry_total_g,
                "ash_total_g": ash_total_g,
                "wet_sample_g": wet_sample_g,
                "dry_sample_g": dry_sample_g,
                "ash_sample_g": ash_sample_g,
                "vs_sample_g": vs_sample_g,
                "ts_fraction": ts_fraction,
                "vs_ts_fraction": vs_ts_fraction,
                "vs_wet_fraction": vs_wet_fraction,
            }
        )

    if not cleaned:
        raise ValueError("至少需要一筆有效的TS/VS平行樣資料。")

    df = pd.DataFrame(cleaned)
    ts_mean = float(df["ts_fraction"].mean())
    vs_ts_mean = float(df["vs_ts_fraction"].mean())
    vs_wet_mean = float(df["vs_wet_fraction"].mean())
    added_vs_g = float(wet_weight_g) * vs_wet_mean

    return {
        "rows": cleaned,
        "ts_fraction_mean": ts_mean,
        "vs_ts_fraction_mean": vs_ts_mean,
        "vs_wet_fraction_mean": vs_wet_mean,
        "added_vs_g": added_vs_g,
    }


def normalize_ratio(values: list[float]) -> list[float]:
    positive_values = [v for v in values if v > 0]
    if not positive_values:
        return []
    base = min(positive_values)
    return [v / base for v in values]


def format_ratio(values: list[float]) -> str:
    if not values:
        return ""
    normalized = normalize_ratio(values)

    def fmt(v: float) -> str:
        if abs(v - round(v)) < 1e-9:
            return str(int(round(v)))
        return f"{v:.3f}".rstrip("0").rstrip(".")

    return ":".join(fmt(v) for v in normalized)


def run_ratio_tool_analysis(payload: dict) -> dict:
    project_name = payload.get("project_name", "").strip() or "Ratio Tool Project"
    inocula = payload.get("inocula", [])
    substrates = payload.get("substrates", [])

    if not inocula:
        raise ValueError("至少需要一個植種樣品。")
    if not substrates:
        raise ValueError("至少需要一個基質樣品。")

    inocula_summary = []
    substrates_summary = []

    for sample in inocula:
        name = str(sample.get("name", "")).strip() or "植種"
        wet_weight_g = float(sample.get("wet_weight_g", 0) or 0)
        if wet_weight_g <= 0:
            raise ValueError(f"{name} 的樣品添加量必須大於0。")

        metrics = compute_tsvs_metrics(sample.get("tsvs_rows", []), wet_weight_g)
        inocula_summary.append(
            {
                "name": name,
                "wet_weight_g": wet_weight_g,
                "replicate_count": int(sample.get("replicate_count", len(sample.get("tsvs_rows", [])) or 1)),
                "ts_fraction_mean": metrics["ts_fraction_mean"],
                "vs_ts_fraction_mean": metrics["vs_ts_fraction_mean"],
                "vs_wet_fraction_mean": metrics["vs_wet_fraction_mean"],
                "added_vs_g": metrics["added_vs_g"],
            }
        )

    for sample in substrates:
        name = str(sample.get("name", "")).strip() or "基質"
        wet_weight_g = float(sample.get("wet_weight_g", 0) or 0)
        if wet_weight_g <= 0:
            raise ValueError(f"{name} 的樣品添加量必須大於0。")

        metrics = compute_tsvs_metrics(sample.get("tsvs_rows", []), wet_weight_g)
        substrates_summary.append(
            {
                "name": name,
                "wet_weight_g": wet_weight_g,
                "replicate_count": int(sample.get("replicate_count", len(sample.get("tsvs_rows", [])) or 1)),
                "ts_fraction_mean": metrics["ts_fraction_mean"],
                "vs_ts_fraction_mean": metrics["vs_ts_fraction_mean"],
                "vs_wet_fraction_mean": metrics["vs_wet_fraction_mean"],
                "added_vs_g": metrics["added_vs_g"],
            }
        )

    inoculum_total_vs_g = float(sum(x["added_vs_g"] for x in inocula_summary))
    substrate_total_vs_g = float(sum(x["added_vs_g"] for x in substrates_summary))

    is_ratio_values = [inoculum_total_vs_g, substrate_total_vs_g]
    codigestion_ratio_values = [x["added_vs_g"] for x in substrates_summary]

    result = {
        "project_name": project_name,
        "inocula_summary": inocula_summary,
        "substrates_summary": substrates_summary,
        "inoculum_total_vs_g": inoculum_total_vs_g,
        "substrate_total_vs_g": substrate_total_vs_g,
        "is_ratio_values": is_ratio_values,
        "is_ratio_text": format_ratio(is_ratio_values),
        "codigestion_ratio_values": codigestion_ratio_values,
        "codigestion_ratio_text": format_ratio(codigestion_ratio_values),
    }

    inocula_df = pd.DataFrame(inocula_summary)
    substrates_df = pd.DataFrame(substrates_summary)

    csv_lines = []
    csv_lines.append("植種摘要")
    csv_lines.append(inocula_df.to_csv(index=False))
    csv_lines.append("基質摘要")
    csv_lines.append(substrates_df.to_csv(index=False))
    csv_lines.append("整體結果")
    overall_df = pd.DataFrame(
        [
            {
                "project_name": project_name,
                "inoculum_total_vs_g": inoculum_total_vs_g,
                "substrate_total_vs_g": substrate_total_vs_g,
                "I/S_ratio": result["is_ratio_text"],
                "Co-Digestion_ratio": result["codigestion_ratio_text"],
            }
        ]
    )
    csv_lines.append(overall_df.to_csv(index=False))
    result["export_csv_text"] = "\ufeff" + "\n".join(csv_lines)
    result["export_filename"] = f"{project_name}_ratio_report.csv"

    return result


@app.route("/", methods=["GET"])
def home():
    units = [
        {
            "title": "BMP分析工具",
            "icon": "🧪",
            "route": "/bmp",
            "description": "輸入BMP實驗原始數據，完成TS/VS換算、單位產氣量計算與模型擬合分析。",
            "status": "ready",
            "status_text": "可使用",
        },
        {
            "title": "多曲線製圖",
            "icon": "📈",
            "route": "/multi_curve",
            "description": "整合多條累積產氣曲線，進行同圖比較、單條曲線樣式編輯與匯出。",
            "status": "ready",
            "status_text": "可使用",
        },
        {
            "title": "植種與共醱酵比例計算工具",
            "icon": "⚖️",
            "route": "/ratio_tool",
            "description": "計算植種比(I/S)與基質共醱酵比例(Co-Digestion ratio)，並輸出報表。",
            "status": "ready",
            "status_text": "可使用",
        },
        {
            "title": "模型擬合工具",
            "icon": "📊",
            "route": "/fit_compare",
            "description": "上傳多條累積產氣曲線，比對不同模型下的擬合曲線與參數表。",
            "status": "ready",
            "status_text": "可使用",
        },
    ]
    return render_template("index.html", units=units)


@app.route("/bmp", methods=["GET"])
def bmp_index():
    demo_tsvs, demo_gas = get_demo_seed_data()
    return render_template(
        "bmp_index.html",
        demo_tsvs=demo_tsvs,
        demo_gas=demo_gas,
    )


@app.route("/multi_curve", methods=["GET", "POST"])
def multi_curve():
    if request.method == "GET":
        return render_template(
            "multi_curve.html",
            curve_payload=None,
            default_multi_curve_settings=get_default_multi_curve_settings(),
            error=None,
        )

    try:
        files = request.files.getlist("curve_files")
        parsed_payload = parse_multi_curve_files(files)

        return render_template(
            "multi_curve.html",
            curve_payload=parsed_payload,
            default_multi_curve_settings=get_default_multi_curve_settings(),
            error=None,
        )
    except Exception as e:
        return render_template(
            "multi_curve.html",
            curve_payload=None,
            default_multi_curve_settings=get_default_multi_curve_settings(),
            error=str(e),
        )


@app.route("/fit_compare", methods=["GET", "POST"])
def fit_compare():
    if request.method == "GET":
        return render_template(
            "fit_compare.html",
            fit_compare_payload=None,
            default_fit_compare_settings=get_default_fit_compare_settings(),
            error=None,
        )

    try:
        files = request.files.getlist("curve_files")
        parsed_payload = parse_fit_compare_files(files)

        return render_template(
            "fit_compare.html",
            fit_compare_payload=parsed_payload,
            default_fit_compare_settings=get_default_fit_compare_settings(),
            error=None,
        )
    except Exception as e:
        return render_template(
            "fit_compare.html",
            fit_compare_payload=None,
            default_fit_compare_settings=get_default_fit_compare_settings(),
            error=str(e),
        )


@app.route("/ratio_tool", methods=["GET", "POST"])
def ratio_tool():
    if request.method == "GET":
        return render_template(
            "ratio_tool.html",
            ratio_result=None,
            initial_ratio_payload=None,
            error=None,
        )

    ratio_payload_json = request.form.get("ratio_payload_json", "{}")

    try:
        payload = parse_ratio_tool_json(ratio_payload_json)
        result = run_ratio_tool_analysis(payload)

        return render_template(
            "ratio_tool.html",
            ratio_result=result,
            initial_ratio_payload=payload,
            error=None,
        )
    except Exception as e:
        payload = parse_ratio_tool_json(ratio_payload_json)
        return render_template(
            "ratio_tool.html",
            ratio_result=None,
            initial_ratio_payload=payload,
            error=str(e),
        )


@app.route("/analyze", methods=["POST"])
def analyze():
    try:
        project_name = request.form.get("project_name", "BMP Project")
        sample_name = request.form.get("sample_name", "Sample")
        sample_wet_weight_g = float(request.form.get("sample_wet_weight_g", 5.0))
        exp_replicates = int(request.form.get("exp_replicates", 3))
        bk_replicates = int(request.form.get("bk_replicates", 2))
        negative_policy = request.form.get("negative_policy", "keep")
        apply_bk_subtraction = request.form.get("apply_bk_subtraction", "yes") == "yes"

        tsvs_json = request.form.get("tsvs_json", "[]")
        gas_json = request.form.get("gas_json", "[]")

        tsvs_records = parse_tsvs_json(tsvs_json)
        gas_records = parse_gas_json(gas_json, exp_replicates, bk_replicates)

        project = BMPProject(
            project_name=project_name,
            sample_name=sample_name,
            sample_wet_weight_g=sample_wet_weight_g,
            exp_replicates=exp_replicates,
            bk_replicates=bk_replicates,
            tsvs_records=tsvs_records,
            gas_data=gas_records,
            settings=BMPSettings(
                blank_method="interval_average",
                negative_policy=negative_policy,
                apply_bk_subtraction=apply_bk_subtraction,
            ),
        )

        output = run_bmp_analysis(project)

        raw_df = output["raw_data"].copy()
        result_df = output["result_table"].copy()

        result_table_html = result_df.round(4).fillna("").to_html(
            classes="table table-striped",
            index=False,
        )

        export_df = build_export_cumulative_df(
            raw_df=raw_df,
            result_df=result_df,
            sample_name=project.sample_name,
        )
        export_csv_text = "\ufeff" + export_df.to_csv(index=False)
        export_filename = f"{project.project_name}_累積單位產氣量.csv"

        plot_payload = build_plot_payload(
            raw_df=raw_df,
            result_df=result_df,
            fit_results=output["fit_results"],
            project_name=project.project_name,
            sample_name=project.sample_name,
            default_model=output["fit_default_model"],
        )
        default_plot_settings = get_default_plot_settings()

        return render_template(
            "result.html",
            project=output["project"],
            tsvs_summary=output["tsvs_summary"],
            added_vs_g=output["added_vs_g"],
            result_table_html=result_table_html,
            export_csv_text=export_csv_text,
            export_filename=export_filename,
            plot_payload=plot_payload,
            default_plot_settings=default_plot_settings,
        )

    except Exception as e:
        return render_template("result.html", error=str(e))


if __name__ == "__main__":
    from config import HOST, PORT, DEBUG
    app.run(host=HOST, port=PORT, debug=DEBUG)