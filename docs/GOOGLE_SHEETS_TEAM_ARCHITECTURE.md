# BMP Pro — Team Google Sheets Integration Specification
Status: Architecture approved for implementation planning; **cloud authentication and writes are not deployed yet**.
Target: https://hwh0410.github.io/BMP-Pro/
Repo: https://github.com/hwh0410/BMP-Pro

## 1. Technical decision
- Keep GitHub Pages as the static frontend and the existing in-browser BMP analysis implementation; Python `bmp_core.py` stays the reference for parity testing. **Do not change underlying BMP formulas.**
- Use Google Identity Services (GIS) for browser OAuth authorization to Google Sheets API. Public OAuth **Client ID** and target spreadsheet ID can be in frontend configuration. Never embed client secrets, API keys granting data access, service account credentials, or long-lived refresh tokens in GitHub Pages.
- All members sign in with their own Google account. Real spreadsheet access is enforced by Google Drive file sharing (owner/editor/viewer), not by a client-side `Users` tab. App roles can customize UI but cannot secure data.
- No public anonymous Apps Script deployment running as owner. If fine-grained per-project RBAC, audit integrity, or hidden data becomes necessary, introduce a dedicated authenticated backend.

## 2. Google Drive sharing
- Owner / Admin: owns database spreadsheet, can manage sharing and schema. Project administrators with editor access alone may not necessarily be able to manage sharing.
- Editor: shared Google Sheet Editor, can read/write all worksheets and all projects; must be a trusted person. UI labels are not an enforcement boundary.
- Viewer: shared Google Sheet Viewer, can read all sheet contents and use in-browser calculations and local exports, but cannot save to cloud.
- Initial rollout: one spreadsheet, invited members only; restrict link access to specific accounts. Use dedicated team Google Workspace Shared Drive where feasible.
- Admin adds/removes access via spreadsheet Drive sharing. Protect formula columns and schema tabs against accidental edits, but do not treat protected ranges as full row-level authorization.
- Caution: Cloud data can be viewed outside BMP Pro in Google Sheets by members with access.

## 3. Proposed workbook: BMP_Pro_Database
`Projects`: project_id (UUID), name, description, owner_email, created_at, updated_at, archived_at, revision
`Materials`: material_id, name, category, source, notes, ts_percent_reference, vs_ts_percent_reference, created_at, updated_at
`Groups`: group_id, project_id, code, name, sample_name, substrate_wet_weight_g, material_description, mixing_ratio, is_ratio, temperature_c, notes, experiment_replicates, blank_replicates, negative_policy, blank_subtraction, created_at, updated_at, revision, deleted_at
`TSVS_Data`: record_id, group_id, replicate_index, empty_crucible_g, wet_total_g, dry_total_g, ash_total_g, updated_at
`Gas_Data`: record_id, group_id, day, series_type (exp/bk), replicate_index, daily_gas_ml, updated_at. Blank measurements are blank cells (not coerced to zero); use one row per replicate/day.
`Results`: result_id, group_id, input_revision, analyzed_at, analyzed_by, core_version, ts_percent, vs_ts_percent, added_vs_g, final_bmp_l_per_kg_vs, results_json, is_current
`Revisions`: revision_id, entity, entity_id, event_type, actor_email, timestamp, previous_revision, new_revision, notes

Optional later: `Group_Materials` with group_id, material_id, substrate_ratio_basis, ratio_value; `Fit_Results` with model/parameters/goodness-of-fit and `Result_Points` time-series for performant comparison. Avoid making huge JSON payloads the only queryable store.

## 4. Authorized session and flows
1. User clicks Google Sign-in / Connect. GIS obtains user-granted access token for the smallest required scope; require authorized Google account and target spreadsheet sharing permission. Use token in Authorization header; keep only in memory, handle expiry by renewed user interaction as needed.
2. On opening library, batch-read Projects, Groups and material summaries; fetch the selected group's TSVS_Data and Gas_Data only when needed.
3. Keep current editing buffer local; calculations run without network. Save triggers validation and batch write.
4. For saving a changed group, read current revision; if server revision does not match locally loaded revision, block overwrite and display conflict resolution. For data consistency, version results against a fixed input_revision; retain a revision event for traceability. **A simple sheet version check plus write is not fully atomic under concurrent edits**; stronger concurrency guarantees require an authenticated backend or transactional datastore.
5. Result curves and raw files can still export JSON and CSV. Sync remains optional; errors/offline should preserve unsaved local changes and allow retry.
6. Viewer can load and analyze/export but save button is disabled only as UX; Google file permissions are ultimate enforcement.
7. Migrate existing JSON group-library exports by parsing v2 format and generating Projects/Groups/TSVS_Data/Gas_Data rows; inspect counts and units before uploading, with idempotency checks.

## 5. Data integrity and scientific validation
- Match original Python core for missing-day interval average, blank correction, negative policies, TS/VS and specific BMP conversion.
- Existing UI input gas values are in mL; outputs mL/g-VS (same numeric quantity as L/kg-VS).
- Store `core_version`, `input_revision`, and analyzed timestamp for each saved result. Persist raw input independently of cached derived results.
- Never send untrusted spreadsheet formulas as RAW/USER_ENTERED in user-entered fields: use RAW values and CSV formula-injection hardening.
- No autosave per keystroke; use batch operations, paging, exponential backoff for 429/5xx, careful API retries (avoid duplicate appends), and a browser-side local draft.
- Back up workbook periodically in addition to the in-app JSON export. Spreadsheet is suitable for a small trusted team, not a transactional multi-tenant DB.

## 6. Deliverables and acceptance gates
Phase A: Create Google Cloud project / enable Sheets API / consent configuration / Web OAuth client, register https://hwh0410.github.io as authorized JavaScript origin, authorize appropriate accounts.
Phase B: Create team workbook with fixed headers, sheet protections, sharing ACL; configure known spreadsheet ID. Do not commit secrets.
Phase C: Build Google auth provider, Sheets data adapter and UI indicators: disconnected / connected / saving / synced / conflict / offline.
Phase D: Validate Editor versus Viewer access; new, edit, query, compare, delete/archive and JSON migration; test unauthorized account denial and cross-device access.
Phase E: Regression validation versus Python core, simultaneous edit stress testing, backup and recovery; only then replace browser-only persistence as primary.

## Config keys (public)
`GOOGLE_OAUTH_CLIENT_ID`: public Google OAuth Web Application client ID (NOT a secret).
`BMP_DATABASE_SPREADSHEET_ID`: team-controlled Google spreadsheet ID (access remains private via Drive sharing).

## Important security boundary
A web-only app cannot enforce independent administrator/editor/viewer **row or project** permissions if all editors have full spreadsheet editing privileges. For advanced roles, consider an authenticated server and service account with per-operation authorization checks; do not trust role flags stored in a browser or freely editable sheet.

## References
- Google client OAuth: https://developers.google.com/identity/protocols/oauth2/javascript-implicit-flow
- Google Sheets limits: https://developers.google.com/workspace/sheets/api/limits
- Google Apps Script execution identities: https://developers.google.com/apps-script/guides/web
