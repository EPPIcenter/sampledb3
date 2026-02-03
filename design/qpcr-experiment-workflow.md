# qPCR Experiment Workflow

## Target flow (user journey)

1. **Define plate** – Upload a CSV describing the plate (micronix barcodes + well positions). This fully defines samples and controls. Required first step.
2. **Download template** – Once the plate is defined, download a template for the chosen machine (Bio-Rad CFX 96 or Quant Studio) based on that arrangement. Templates use **study subject name** for regular samples and **parasite density** for standard controls.
3. **Run experiment** – Load the template into the instrument and run the experiment. The instrument fits the standard curve when control densities are set.
4. **Import results** – Upload the instrument output file. We store amplification data when present for optional custom curve fitting later.

## Design decisions

- **Plate first, then template**: The experiment is initialized with optional name only. The plate layout (CSV upload) is the first action; template download is enabled only after the plate has wells. This enforces the correct order without locking steps after completion.
- **Subject name in templates**: For study samples we use the **study subject name** (from resolved specimen → subject). For controls we use **parasite density** (numeric) in the Quantity column and appropriate Content/Task values.
- **Multiple targets (multiplex)**: Each experiment has a **list of targets**. Each target has a **Target Name** and optional **Fluorophore** (Bio-Rad) or **Reporter** (Quant Studio). Templates emit **one row per well per target** (Bio-Rad: one row per fluorophore per well; Quant Studio: one row per target per well). Add or remove targets in the template settings; at least one target is required to download a template. See [qpcr-fluorophore-reporter.md](qpcr-fluorophore-reporter.md) for platform differences and dye name mapping (e.g. HEX vs VIC).
- **Targets locked after results**: Once the experiment status is `results_uploaded`, the list of targets cannot be changed (PATCH with `targets` returns 409). This keeps imported results aligned with the template. To change targets after importing results, delete the experiment and create a new one.
- **Extensibility**: A small **instrument registry** in code lists supported machines (id, displayName, template extension, result parser). Adding a new machine = add parser + template generator branch + one registry entry.
- **Template output**: Only well positions that have a tube (a record in the plate layout) appear in the template file; positions with no tube are omitted. The template includes **all** targets (multiplex): for each well and each target, one row is emitted.
- **Status**: `setup` (no plate yet), `in_progress` (plate uploaded; ready to download template, run, then import results), `results_uploaded` (run results imported). After a successful plate upload, status is set to `in_progress`. There is no separate “template exported” state.
- **Plate layout locked after upload**: Once the experiment status is beyond `setup` (i.e. `in_progress` or `results_uploaded`), plate upload is rejected (409) so results stay aligned with the layout. To change the plate, the user must delete the experiment and create a new one.
- **Delete experiment**: DELETE removes the experiment and all related data (plate wells, runs, well results, amplification data). Requires member or admin. UI shows a confirm dialog before delete.

## Machine specs

### Bio-Rad CFX Maestro Plate Map CSV (Import Plate)

- **Row logic**: One row per **fluorophore per well** (simplex = 1 row/well; multiplex = multiple rows per well).
- **Columns** (case-sensitive): `Well`, `Fluorophore`, `Target Name`, `Content`, `Sample Name`, `Quantity` (required when Content = `Std`).
- **Content**: `Unk` (unknown), `Std` (standard), `NTC`, `Pos`, `Neg`. **Quantity** = parasite density of the standard control (numeric only).
- **Well**: Alphanumeric (e.g. A1, A01, H12).

### Thermo Fisher QuantStudio Plate Map Import

- **File**: Tab-delimited .txt preferred; UTF-8 or ASCII. One row per **target per well**.
- **Structure**: Rows 1–5 = metadata header (each line starts with `*`); row 6 = column headers; row 7+ = data.
- **Metadata**: Block Type = 96-Well, Experiment Type = Standard Curve, Instrument Type = (configurable, e.g. QuantStudio 5), No. Of Wells = 96, Set Up Well Section Info =.
- **Data columns**: Well (integer 1–96), Well Position, Sample Name, Target Name, Task (UNKNOWN, STANDARD, NTC, PC), Reporter, Quencher, Quantity (parasite density when Task = STANDARD).
- **Task**: UNKNOWN, STANDARD, NTC, PC (case-sensitive). **Quantity** = parasite density when Task = STANDARD.
