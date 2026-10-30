from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Literal, Dict, Any, Tuple
import math

import numpy as np
import pandas as pd
from scipy.optimize import curve_fit


BlankMethod = Literal["interval_average"]
BkMethod = Literal["average", "paired"]
NegativePolicy = Literal["keep", "zero", "flag"]
FitTarget = Literal["mean", "replicate"]

FIT_MODEL_ORDER = [
    "logistic",
    "gompertz",
    "richards",
    "first_order",
    "transfer",
    "superimposed",
]

FIT_MODEL_LABELS = {
    "logistic": "Logistic",
    "gompertz": "Gompertz",
    "richards": "Richards",
    "first_order": "First-order",
    "transfer": "Transfer",
    "superimposed": "Superimposed Model (1st-order + Gompertz)",
}


@dataclass
class TSVSRecord:
    empty_crucible_g: float
    wet_total_g: float
    dry_total_g: float
    ash_total_g: float

    @property
    def wet_sample_g(self) -> float:
        return self.wet_total_g - self.empty_crucible_g

    @property
    def dry_sample_g(self) -> float:
        return self.dry_total_g - self.empty_crucible_g

    @property
    def ash_g(self) -> float:
        return self.ash_total_g - self.empty_crucible_g

    @property
    def vs_g(self) -> float:
        return self.dry_sample_g - self.ash_g

    @property
    def ts_fraction(self) -> float:
        if self.wet_sample_g <= 0:
            raise ValueError("Wet sample weight must be > 0")
        return self.dry_sample_g / self.wet_sample_g

    @property
    def ts_percent(self) -> float:
        return self.ts_fraction * 100

    @property
    def vs_ts_fraction(self) -> float:
        if self.dry_sample_g <= 0:
            raise ValueError("Dry sample weight must be > 0")
        return self.vs_g / self.dry_sample_g

    @property
    def vs_ts_percent(self) -> float:
        return self.vs_ts_fraction * 100

    @property
    def vs_wet_fraction(self) -> float:
        if self.wet_sample_g <= 0:
            raise ValueError("Wet sample weight must be > 0")
        return self.vs_g / self.wet_sample_g

    @property
    def vs_wet_percent(self) -> float:
        return self.vs_wet_fraction * 100


@dataclass
class GasDayRecord:
    day: int
    exp_values: List[Optional[float]]
    bk_values: List[Optional[float]]
    date: Optional[str] = None
    methane_percent_exp: Optional[List[Optional[float]]] = None
    methane_percent_bk: Optional[List[Optional[float]]] = None


@dataclass
class BMPSettings:
    blank_method: BlankMethod = "interval_average"
    bk_method: BkMethod = "average"
    negative_policy: NegativePolicy = "keep"
    apply_bk_subtraction: bool = True


@dataclass
class BMPProject:
    project_name: str
    sample_name: str
    sample_wet_weight_g: float
    exp_replicates: int
    bk_replicates: int
    tsvs_records: List[TSVSRecord] = field(default_factory=list)
    gas_data: List[GasDayRecord] = field(default_factory=list)
    settings: BMPSettings = field(default_factory=BMPSettings)
    notes: str = ""


def summarize_tsvs(records: List[TSVSRecord]) -> Dict[str, float]:
    if not records:
        raise ValueError("No TS/VS records provided")

    df = pd.DataFrame(
        {
            "wet_sample_g": [r.wet_sample_g for r in records],
            "dry_sample_g": [r.dry_sample_g for r in records],
            "ash_g": [r.ash_g for r in records],
            "vs_g": [r.vs_g for r in records],
            "ts_fraction": [r.ts_fraction for r in records],
            "vs_ts_fraction": [r.vs_ts_fraction for r in records],
            "vs_wet_fraction": [r.vs_wet_fraction for r in records],
        }
    )

    return {
        "n": float(len(df)),
        "ts_fraction_mean": float(df["ts_fraction"].mean()),
        "ts_fraction_std": float(df["ts_fraction"].std(ddof=1)) if len(df) > 1 else 0.0,
        "vs_ts_fraction_mean": float(df["vs_ts_fraction"].mean()),
        "vs_ts_fraction_std": float(df["vs_ts_fraction"].std(ddof=1)) if len(df) > 1 else 0.0,
        "vs_wet_fraction_mean": float(df["vs_wet_fraction"].mean()),
        "vs_wet_fraction_std": float(df["vs_wet_fraction"].std(ddof=1)) if len(df) > 1 else 0.0,
    }


def calc_added_vs_g(sample_wet_weight_g: float, records: List[TSVSRecord]) -> float:
    summary = summarize_tsvs(records)
    return float(
        sample_wet_weight_g
        * summary["ts_fraction_mean"]
        * summary["vs_ts_fraction_mean"]
    )


def project_gas_to_dataframe(project: BMPProject) -> pd.DataFrame:
    rows: List[Dict[str, Any]] = []
    for rec in sorted(project.gas_data, key=lambda x: x.day):
        row: Dict[str, Any] = {"day": rec.day, "date": rec.date}
        for i in range(project.exp_replicates):
            row[f"exp_{i+1}"] = rec.exp_values[i] if i < len(rec.exp_values) else None
        for i in range(project.bk_replicates):
            row[f"bk_{i+1}"] = rec.bk_values[i] if i < len(rec.bk_values) else None
        rows.append(row)

    df = pd.DataFrame(rows).sort_values("day").reset_index(drop=True)
    if df.empty:
        raise ValueError("No gas data found in project")
    return df


def fill_missing_daily_series(
    series: pd.Series,
    day_series: pd.Series,
) -> pd.Series:
    s = pd.to_numeric(series, errors="coerce").copy()
    d = pd.to_numeric(day_series, errors="coerce").copy()

    out = pd.Series(np.nan, index=s.index, dtype=float)
    valid_idx = s[s.notna()].index.tolist()

    if not valid_idx:
        return s.fillna(0.0)

    first_idx = valid_idx[0]
    out.loc[first_idx] = float(s.loc[first_idx])

    prev_idx = first_idx

    for curr_idx in valid_idx[1:]:
        prev_day = int(d.loc[prev_idx])
        curr_day = int(d.loc[curr_idx])
        total_value = float(s.loc[curr_idx])

        span_days = curr_day - prev_day

        if span_days <= 0:
            out.loc[curr_idx] = total_value
        else:
            avg_value = total_value / span_days
            mask = (d >= prev_day + 1) & (d <= curr_day)
            out.loc[mask] = avg_value

        prev_idx = curr_idx

    return out.fillna(0.0)


def apply_missing_value_processing(df: pd.DataFrame, project: BMPProject) -> pd.DataFrame:
    out = df.copy()

    for i in range(project.exp_replicates):
        col = f"exp_{i+1}"
        out[col] = fill_missing_daily_series(out[col], out["day"])

    for i in range(project.bk_replicates):
        col = f"bk_{i+1}"
        out[col] = fill_missing_daily_series(out[col], out["day"])

    return out


def build_bk_reference(df: pd.DataFrame, project: BMPProject) -> pd.Series:
    bk_cols = [f"bk_{i+1}" for i in range(project.bk_replicates)]
    if not bk_cols:
        return pd.Series(np.zeros(len(df)), index=df.index)
    return df[bk_cols].mean(axis=1)


def subtract_bk(df: pd.DataFrame, project: BMPProject) -> Tuple[pd.DataFrame, pd.DataFrame]:
    out = df.copy()
    flags = pd.DataFrame(index=df.index)

    if not project.settings.apply_bk_subtraction:
        for i in range(project.exp_replicates):
            out[f"net_{i+1}"] = out[f"exp_{i+1}"]
            flags[f"net_{i+1}_negative"] = False
        return out, flags

    bk_ref = build_bk_reference(df, project)
    out["bk_ref"] = bk_ref

    for i in range(project.exp_replicates):
        net_col = f"net_{i+1}"
        raw = out[f"exp_{i+1}"] - bk_ref
        negative_mask = raw < 0
        flags[f"{net_col}_negative"] = negative_mask

        if project.settings.negative_policy == "keep":
            out[net_col] = raw
        elif project.settings.negative_policy == "zero":
            out[net_col] = raw.clip(lower=0)
        elif project.settings.negative_policy == "flag":
            out[net_col] = raw
        else:
            raise ValueError(f"Unsupported negative policy: {project.settings.negative_policy}")

    return out, flags


def calc_specific_yield(df: pd.DataFrame, added_vs_g: float, project: BMPProject) -> pd.DataFrame:
    if added_vs_g <= 0:
        raise ValueError("Added VS must be > 0")

    out = df.copy()
    for i in range(project.exp_replicates):
        out[f"specific_{i+1}"] = out[f"net_{i+1}"] / added_vs_g
        out[f"cumulative_{i+1}"] = out[f"specific_{i+1}"].cumsum()

    specific_cols = [f"specific_{i+1}" for i in range(project.exp_replicates)]
    cumulative_cols = [f"cumulative_{i+1}" for i in range(project.exp_replicates)]

    out["specific_mean"] = out[specific_cols].mean(axis=1)
    out["specific_std"] = out[specific_cols].std(axis=1, ddof=1) if project.exp_replicates > 1 else 0.0
    out["cumulative_mean"] = out[cumulative_cols].mean(axis=1)
    out["cumulative_std"] = out[cumulative_cols].std(axis=1, ddof=1) if project.exp_replicates > 1 else 0.0
    return out


def _safe_positive(value: float, eps: float = 1e-12) -> float:
    return max(float(value), eps)


def logistic_model(t: np.ndarray, pmax: float, mu: float, lag: float) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p_safe = _safe_positive(pmax)
    return p_safe / (1.0 + np.exp(((4.0 * mu) / p_safe) * (lag - t) + 2.0))


def gompertz_model(t: np.ndarray, pmax: float, mu: float, lag: float) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p_safe = _safe_positive(pmax)
    return p_safe * np.exp(-np.exp(((mu * math.e) / p_safe) * (lag - t) + 1.0))


def richards_model(t: np.ndarray, pmax: float, mu: float, lag: float, d: float) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p_safe = _safe_positive(pmax)
    d_safe = _safe_positive(d, eps=1e-6)
    inner = 1.0 + d_safe * np.exp(1.0 + d_safe) * np.exp(
        ((mu / p_safe) * (1.0 + d_safe) * ((1.0 + d_safe) / d_safe)) * (lag - t)
    )
    return p_safe * np.power(inner, -1.0 / d_safe)


def first_order_model(t: np.ndarray, pmax: float, k: float) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p_safe = _safe_positive(pmax)
    k_safe = _safe_positive(k)
    return p_safe * (1.0 - np.exp(-k_safe * t))


def transfer_model(t: np.ndarray, pmax: float, mu: float, lag: float) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p_safe = _safe_positive(pmax)
    inner = ((mu * math.e) / p_safe) * (t - lag) - 1.0
    return p_safe * (1.0 - np.exp(-np.exp(inner)))


def superimposed_model(
    t: np.ndarray,
    p1max: float,
    k: float,
    p2max: float,
    mu: float,
    lag: float,
) -> np.ndarray:
    t = np.asarray(t, dtype=float)
    p1_safe = _safe_positive(p1max)
    p2_safe = _safe_positive(p2max)
    k_safe = _safe_positive(k)
    phase1 = p1_safe * (1.0 - np.exp(-k_safe * t))
    phase2 = p2_safe * np.exp(-np.exp(((mu * math.e) / p2_safe) * (lag - t) + 1.0))
    return phase1 + phase2


def calc_r_squared(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    ss_res = np.sum((y_true - y_pred) ** 2)
    ss_tot = np.sum((y_true - np.mean(y_true)) ** 2)
    if ss_tot == 0:
        return 1.0
    return float(1.0 - ss_res / ss_tot)


def calc_rmse(y_true: np.ndarray, y_pred: np.ndarray) -> float:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.sqrt(np.mean((y_true - y_pred) ** 2)))


def _prepare_fit_series(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Tuple[np.ndarray, np.ndarray, str]:
    t = df["day"].to_numpy(dtype=float)

    if target == "mean":
        y = df["cumulative_mean"].to_numpy(dtype=float)
        label = "cumulative_mean"
    else:
        label = f"cumulative_{replicate_index}"
        if label not in df.columns:
            raise ValueError(f"Replicate column not found: {label}")
        y = df[label].to_numpy(dtype=float)

    valid_mask = np.isfinite(t) & np.isfinite(y)
    t = t[valid_mask]
    y = y[valid_mask]

    if len(t) < 4:
        raise ValueError("Need at least 4 data points for model fitting")

    return t, y, label


def _estimate_mu_from_series(t: np.ndarray, y: np.ndarray) -> float:
    if len(t) < 2:
        return 0.1
    dy_dt = np.gradient(y, t)
    max_rate = float(np.nanmax(dy_dt))
    return max(max_rate, 0.1)


def _build_fit_result(
    model_key: str,
    target_label: str,
    param_names: List[str],
    params: np.ndarray,
    t: np.ndarray,
    y: np.ndarray,
    y_fit: np.ndarray,
) -> Dict[str, Any]:
    params = np.asarray(params, dtype=float)

    return {
        "success": True,
        "model_key": model_key,
        "model_label": FIT_MODEL_LABELS[model_key],
        "target": target_label,
        "parameter_names": param_names,
        "parameters": {name: float(value) for name, value in zip(param_names, params)},
        "r_squared": calc_r_squared(y, y_fit),
        "rmse": calc_rmse(y, y_fit),
        "t": t.tolist(),
        "y_true": y.tolist(),
        "y_fit": y_fit.tolist(),
    }


def _build_fit_error(model_key: str, error: Exception) -> Dict[str, Any]:
    return {
        "success": False,
        "model_key": model_key,
        "model_label": FIT_MODEL_LABELS[model_key],
        "error": str(error),
    }


def fit_logistic(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        mu_guess = _estimate_mu_from_series(t, y)
        lag_guess = 1.0
        p0 = [p_guess, mu_guess, lag_guess]
        bounds = ([0.0, 0.0, -np.inf], [np.inf, np.inf, np.inf])
        popt, _ = curve_fit(logistic_model, t, y, p0=p0, bounds=bounds, maxfev=100000)
        y_fit = logistic_model(t, *popt)
        return _build_fit_result("logistic", label, ["Pmax", "mu", "lag"], popt, t, y, y_fit)
    except Exception as e:
        return _build_fit_error("logistic", e)


def fit_gompertz(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        mu_guess = _estimate_mu_from_series(t, y)
        lag_guess = 1.0
        p0 = [p_guess, mu_guess, lag_guess]
        bounds = ([0.0, 0.0, -np.inf], [np.inf, np.inf, np.inf])
        popt, _ = curve_fit(gompertz_model, t, y, p0=p0, bounds=bounds, maxfev=100000)
        y_fit = gompertz_model(t, *popt)
        return _build_fit_result("gompertz", label, ["Pmax", "mu", "lag"], popt, t, y, y_fit)
    except Exception as e:
        return _build_fit_error("gompertz", e)


def fit_richards(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        mu_guess = _estimate_mu_from_series(t, y)
        lag_guess = 1.0
        d_guess = 1.0
        p0 = [p_guess, mu_guess, lag_guess, d_guess]
        bounds = ([0.0, 0.0, -np.inf, 0.01], [np.inf, np.inf, np.inf, 20.0])
        popt, _ = curve_fit(richards_model, t, y, p0=p0, bounds=bounds, maxfev=150000)
        y_fit = richards_model(t, *popt)
        return _build_fit_result("richards", label, ["Pmax", "mu", "lag", "d"], popt, t, y, y_fit)
    except Exception as e:
        return _build_fit_error("richards", e)


def fit_first_order(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        k_guess = 0.1
        p0 = [p_guess, k_guess]
        bounds = ([0.0, 0.0], [np.inf, np.inf])
        popt, _ = curve_fit(first_order_model, t, y, p0=p0, bounds=bounds, maxfev=100000)
        y_fit = first_order_model(t, *popt)
        return _build_fit_result("first_order", label, ["Pmax", "k"], popt, t, y, y_fit)
    except Exception as e:
        return _build_fit_error("first_order", e)


def fit_transfer(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        mu_guess = _estimate_mu_from_series(t, y)
        lag_guess = 1.0
        p0 = [p_guess, mu_guess, lag_guess]
        bounds = ([0.0, 0.0, -np.inf], [np.inf, np.inf, np.inf])
        popt, _ = curve_fit(transfer_model, t, y, p0=p0, bounds=bounds, maxfev=120000)
        y_fit = transfer_model(t, *popt)
        return _build_fit_result("transfer", label, ["Pmax", "mu", "lag"], popt, t, y, y_fit)
    except Exception as e:
        return _build_fit_error("transfer", e)


def fit_superimposed(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    try:
        t, y, label = _prepare_fit_series(df, target, replicate_index)
        p_guess = max(float(np.max(y)), 1.0)
        mu_guess = _estimate_mu_from_series(t, y)
        lag_guess = 1.0
        p0 = [p_guess * 0.4, 0.1, p_guess * 0.6, mu_guess, lag_guess]
        bounds = ([0.0, 0.0, 0.0, 0.0, -np.inf], [np.inf, np.inf, np.inf, np.inf, np.inf])
        popt, _ = curve_fit(superimposed_model, t, y, p0=p0, bounds=bounds, maxfev=200000)
        y_fit = superimposed_model(t, *popt)
        return _build_fit_result(
            "superimposed",
            label,
            ["P1max", "k", "P2max", "mu", "lag"],
            popt,
            t,
            y,
            y_fit,
        )
    except Exception as e:
        return _build_fit_error("superimposed", e)


def fit_model(
    df: pd.DataFrame,
    model_key: str,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Any]:
    if model_key == "logistic":
        return fit_logistic(df, target, replicate_index)
    if model_key == "gompertz":
        return fit_gompertz(df, target, replicate_index)
    if model_key == "richards":
        return fit_richards(df, target, replicate_index)
    if model_key == "first_order":
        return fit_first_order(df, target, replicate_index)
    if model_key == "transfer":
        return fit_transfer(df, target, replicate_index)
    if model_key == "superimposed":
        return fit_superimposed(df, target, replicate_index)
    raise ValueError(f"Unsupported model key: {model_key}")


def fit_all_supported_models(
    df: pd.DataFrame,
    target: FitTarget = "mean",
    replicate_index: int = 1,
) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {}
    for model_key in FIT_MODEL_ORDER:
        results[model_key] = fit_model(df, model_key, target, replicate_index)
    return results


def run_bmp_analysis(project: BMPProject) -> Dict[str, Any]:
    added_vs_g = calc_added_vs_g(project.sample_wet_weight_g, project.tsvs_records)

    raw_df = project_gas_to_dataframe(project)
    processed_df = apply_missing_value_processing(raw_df, project)
    bk_df, flag_df = subtract_bk(processed_df, project)
    result_df = calc_specific_yield(bk_df, added_vs_g, project)
    fit_results = fit_all_supported_models(result_df, target="mean")

    return {
        "project": {
            "project_name": project.project_name,
            "sample_name": project.sample_name,
            "sample_wet_weight_g": project.sample_wet_weight_g,
            "exp_replicates": project.exp_replicates,
            "bk_replicates": project.bk_replicates,
            "settings": asdict(project.settings),
        },
        "tsvs_summary": summarize_tsvs(project.tsvs_records),
        "added_vs_g": added_vs_g,
        "raw_data": raw_df,
        "processed_data": processed_df,
        "negative_flags": flag_df,
        "result_table": result_df,
        "fit_results": fit_results,
        "fit_default_model": "gompertz",
    }


if __name__ == "__main__":
    project = BMPProject(
        project_name="CowManure_BMP_Test",
        sample_name="Cow manure",
        sample_wet_weight_g=5.0,
        exp_replicates=3,
        bk_replicates=2,
        tsvs_records=[
            TSVSRecord(25.000, 30.000, 26.000, 25.300),
            TSVSRecord(25.100, 30.100, 26.080, 25.360),
        ],
        gas_data=[
            GasDayRecord(day=0, exp_values=[0.0, 0.0, 0.0], bk_values=[0.0, 0.0]),
            GasDayRecord(day=1, exp_values=[15.0, 14.5, 15.2], bk_values=[2.5, 2.7]),
            GasDayRecord(day=2, exp_values=[22.0, 21.8, 22.5], bk_values=[3.0, 2.9]),
            GasDayRecord(day=3, exp_values=[28.0, None, 27.5], bk_values=[3.2, 3.1]),
            GasDayRecord(day=4, exp_values=[26.0, 25.8, 26.3], bk_values=[2.8, 2.7]),
            GasDayRecord(day=5, exp_values=[20.0, 19.5, 20.1], bk_values=[2.1, 2.2]),
            GasDayRecord(day=6, exp_values=[15.0, 14.8, 15.3], bk_values=[1.8, 1.7]),
            GasDayRecord(day=7, exp_values=[10.2, 10.0, 10.1], bk_values=[1.2, 1.1]),
        ],
        settings=BMPSettings(
            blank_method="interval_average",
            bk_method="average",
            negative_policy="keep",
            apply_bk_subtraction=True,
        ),
    )

    output = run_bmp_analysis(project)

    print("=== TS/VS Summary ===")
    print(output["tsvs_summary"])
    print(f"Added VS (g): {output['added_vs_g']:.4f}")

    print("\n=== Result Table (head) ===")
    print(output["result_table"].head())

    print("\n=== Fit Results ===")
    for key, result in output["fit_results"].items():
        print(key, result["success"])