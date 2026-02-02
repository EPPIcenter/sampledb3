# qPCR Example Outputs – Data to Store in Database

Summary from exploring the example files with `explore_qpcr_outputs.py` (run with `uv run --with xlrd python explore_qpcr_outputs.py`). The two instruments (Biorad CFX, QuantStudio) produce different outputs; we capture whatever is available per file.

## File formats

| File | Format | Purpose |
|------|--------|---------|
| Biorad CFX 96 qPCR Plate Layout Template.csv | CSV | Template (plate layout for machine) |
| Biorad_varATS-IM-25-039-03-01-2025.csv | CSV | Biorad **result** (run output) |
| Quant Studio qPCR Plate Layout Template.xls | XLS | Template (plate layout for machine) |
| QuantStudio_varATS-IM-25-048-05-04-2025.xls | XLS | QuantStudio **result** (run output) |

---

## Data availability by instrument

| Data | Biorad CFX (CSV) | QuantStudio (XLS) |
|------|------------------|-------------------|
| Run metadata | ✓ (key-value rows) | ✓ (Amplification Data / Results header rows) |
| Per-well **results** (Cq/CT, Quantity) | ✓ | ✓ |
| **Amplification data** (cycle-by-cycle Rn) | ✗ (not in example CSV) | ✓ (Amplification Data sheet) |
| Standard curve (Slope, R², Efficiency) | — | ✓ (Results sheet) |
| Amp Status (Amp / No Amp) | — | ✓ |

---

## Biorad CFX result (CSV)

- **Metadata rows** (key-value): File Name, Created By User, Notes, ID, Run Started, Run Ended, Sample Vol, Lid Temp, Protocol File Name, Plate Setup File Name, Base Serial Number, Optical Head Serial Number, CFX Manager Version.
- **Results table** (from ~row 20):  
  `Well, Fluor, Target, Content, Sample, Cq, Starting Quantity (SQ), Cq Mean`
  - **Well**: A01, B01, … (row + column)
  - **Content**: Std-1, Std-2, Std-3, Std-4, Std-5, Neg Ctrl-6, Unkn (standard concentrations 10k→1, negative, unknown)
  - **Sample**: micronix tube barcode (e.g. 8076959997) or "Neg CTRL"
  - **Cq**: numeric or NaN
  - **Starting Quantity (SQ)**: parasite density (numeric or NaN)
  - **Cq Mean**: mean Cq for replicate wells (when applicable)

No cycle-by-cycle amplification data is present in the example Biorad CSV (only summary results).

---

## QuantStudio result (XLS)

### Sheet: Sample Setup (table starts ~row 46)

- **Columns**: Well, Well Position, Sample Name, Sample Color, Biogroup Name, Biogroup Color, Target Name, Target Color, Task, Reporter
- **Well Position**: A1, A2, …
- **Sample Name**: micronix barcode (e.g. 8078127887) or "Neg ctrl" or empty
- **Task**: STANDARD, NTC, UNKNOWN

### Sheet: Amplification Data (full amplification curves)

- **Table** starts after ~40 rows of metadata (key-value: Experiment Name, Experiment Run End Time, Chemistry, Instrument Type, etc.).
- **Columns**: Well, Well Position, **Cycle**, Target Name, **Rn**, **Delta Rn**
  - **Cycle**: cycle number (1, 2, 3, …)
  - **Rn**: fluorescence (normalized reporter)
  - **Delta Rn**: Rn minus baseline
- One row per well per cycle per target; many rows per run (e.g. 96 wells × ~40 cycles → thousands of rows). Store when available for curve visualization or re-analysis.

### Sheet: Results (table starts ~row 46)

- **Columns (full set observed)**: Well, Well Position, Omit, Sample Name, Target Name, Task, Reporter, Quencher, **CT**, Ct Mean, Ct SD, **Quantity**, Quantity Mean, Quantity SD, Y-Intercept, R², Slope, Efficiency, Automatic Ct Threshold, Ct Threshold, Automatic Baseline, Baseline Start, Baseline End, **Amp Status**, Comments, Cq Conf, …
- **CT**: cycle threshold (numeric or "Undetermined")
- **Quantity**: starting quantity / parasite density (numeric; for STANDARD wells this is the known concentration 1, 10, 100, 1000, 10000)
- **Amp Status**: Amp, No Amp
- **Standard curve**: Y-Intercept, R², Slope, Efficiency (per target / run)

### Metadata (Sample Setup / Results / Amplification Data, rows before each table)

- Experiment Name, Experiment Run End Time, Date Created, Experiment Type (e.g. "Standard Curve"), Chemistry (e.g. TAQMAN), Instrument Name/Serial, etc.

---

## Normalized data to store in DB

### Experiment run (one per uploaded result file)

| Field | Type | Notes |
|-------|------|--------|
| instrument_type | enum/text | `Biorad_CFX`, `QuantStudio` |
| run_started_at | timestamp | From file (e.g. Run Started, Experiment Run End Time) |
| run_ended_at | timestamp | Optional |
| experiment_name | text | e.g. varATS-IM-25-048 |
| file_name | text | Original filename for audit |
| plate_layout_id / qpcr_experiment_id | FK | Link to our qPCR experiment (plate layout + template) |

### Per-well results (one row per well per target)

| Field | Type | Notes |
|-------|------|--------|
| well_position | text | Normalized (e.g. A1, A01 → A1) |
| sample_barcode | text | Micronix tube barcode; empty if well empty |
| task | enum | STANDARD, NTC, UNKNOWN |
| target_name | text | e.g. Target 1, varATS |
| cq | decimal, nullable | Cycle threshold; null if Undetermined/NaN |
| quantity | decimal, nullable | Starting quantity / parasite density; null if NTC/empty |
| standard_quantity | decimal, nullable | For STANDARD only: 1, 10, 100, 1000, 10000 (parasites/µL) |
| amp_status | text, optional | Amp, No Amp (QuantStudio only) |

### Amplification data (optional; when present, e.g. QuantStudio)

| Field | Type | Notes |
|-------|------|--------|
| well_result_id | FK | Link to per-well result row |
| cycle | integer | Cycle number (1, 2, …) |
| rn | decimal, nullable | Rn (normalized reporter) |
| delta_rn | decimal, nullable | Delta Rn |

Store when the uploaded file contains cycle-by-cycle data (QuantStudio “Amplification Data” sheet). Omit or leave empty for Biorad CSV; no need to fail import if absent.

### Standard curve (optional, per run or per target)

- Slope, Y-Intercept, R², Efficiency — for audit or recomputation (QuantStudio Results sheet; map when available).

---

## Template files (for generating machine input)

- **Biorad template (CSV)**: Row, Column, *Target Name, *Sample Name → Sample Name = 10k, 1k, 100 p/ul, 10 p/ul, 1 p/ul, Neg ctrl, or empty.
- **QuantStudio template (XLS)**: Well, Sample Name, Target Name, Task, Reporter, Quencher → Sample Name and Task as above; STANDARD/NTC/UNKNOWN.

Standards are identified by **tube barcode** in the result file (controls go into barcoded micronix tubes); in the template they are placeholders (10k, 1k, …) replaced by actual barcodes when preparing the run. So in our system: plate upload gives (barcode, position); we infer STANDARD vs UNKNOWN from a mapping of barcode → standard concentration (or from template position). Unresolved barcodes → error and annotate on plate visualizer.

---

## Column mapping (scanner-config-style)

- **Plate upload (micronix layout)**: input file has barcode + position; column mapping (e.g. barcode column, row/column or well column) configurable.
- **Result import (Biorad CSV)**: map columns to Well, Content, Sample, Cq, Starting Quantity (SQ). No amplification table.
- **Result import (QuantStudio XLS)**:  
  - **Results** sheet: map sheet + start row, then columns to Well Position, Sample Name, Task, CT, Quantity (and optionally Quantity Mean, Ct SD, Amp Status, Slope, R², Efficiency).  
  - **Amplification Data** sheet (if present): map Well/Well Position, Cycle, Target Name, Rn, Delta Rn; store per-well-per-cycle rows when available.

Reusing the same scanner-config/column-mapping pattern for both plate upload and result import keeps configuration consistent and flexible across instruments.
