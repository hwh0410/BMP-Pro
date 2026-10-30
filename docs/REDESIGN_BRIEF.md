# BMP Pro 2.0 — UI/UX Redesign Brief

## Product goal
A browser-based BMP analysis workstation for lab users to import Excel/CSV data or enter measurements manually, run the original calculations, visualize and export results quickly.

## Design priorities
1. Spreadsheet-first workspace: drag/drop XLSX and CSV, paste ranges from Excel, edit and validate cells, map columns, control replicates.
2. Clear analysis steps: sample properties/TS-VS -> gas observations -> blank correction -> cumulative yield -> fitting -> plots/export.
3. Non-destructive preview: retain entered data while switching tools and charts; undo is desirable.
4. Scientific plot editing: multi-series graphs, fit overlays, axes, font sizes, symbols, line widths, errors, print/export quality.
5. Numerically equivalent algorithms: existing `bmp_core.py` is the regression oracle; create fixed reference fixtures before swapping out SciPy/NumPy/Pandas.
6. Responsive desktop/tablet/mobile layout. On phones, tabbed/narrow editable tables rather than compressed wide spreadsheet grids.

## Planned architecture
- GitHub Pages static app (HTML/CSS/JavaScript) after migration.
- Client-side XLSX parser and CSV import; no compulsory upload to a remote server.
- Charting using Plotly.js.
- Local save/export with JSON/CSV/XLSX formats.
- Client-side nonlinear least-squares fitting with regression parity tests.

## Migration status (2026-10-30)
- Imported the original Python, HTML, JavaScript and CSS *text files* from Hugging Face Space `hwh0410/BMP_Pro_v1` into repo root.
- Preserved Flask routes and the existing `bmp_core.py` for benchmarking, **not** for direct GitHub Pages execution.
- Original binary LFS image files `static/images/logo.png` and `static/images/background.png` have **not** yet been imported.
- No live GitHub Pages deployment or UI redesign implemented yet.

## Acceptance criteria for analysis parity
- Identical TS/VS computations for replicate inputs.
- Identical treatment of missing daily values and blank correction.
- Identical normalized cumulative BMP yield within floating-point tolerance.
- Compare Pmax, rate and lag estimates and residual metrics on a battery of representative real/synthetic curves; explicitly document optimizer limitations and mismatch cases.
