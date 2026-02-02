# qPCR: Fluorophore vs. Reporter (Concept vs. Implementation)

Both terms refer to the dye on the PCR probe (e.g. FAM), but the two platforms treat them differently in import files and in validation.

## 1. Column headers

| Platform        | Dye column | Quencher column |
|----------------|------------|-----------------|
| **Bio-Rad CFX** | `Fluorophore` | Not used |
| **QuantStudio** | `Reporter`    | `Quencher` (required) |

## 2. Logic difference

- **Bio-Rad CFX**
  - **Input:** Only `Fluorophore` is required.
  - **Logic:** Acts as a **channel selector**. The software does not use quencher chemistry (e.g. MGB vs TAMRA); it only cares which optical channel to use.
- **QuantStudio**
  - **Input:** Both `Reporter` and `Quencher` are required in the import file.
  - **Logic:** Reporter is the dye; Quencher must be paired (e.g. FAM + NFQ-MGB, or SYBR + `None`). We **infer** Quencher from Reporter: SYBR → `None`, all others → `NFQ-MGB`. No separate quencher field in the UI or PATCH API.

## 3. Dye name mapping (cross-platform)

When moving experiments between platforms, the same spectral channel can have different names:

| Channel       | Bio-Rad string | QuantStudio string | Note |
|---------------|----------------|-------------------|------|
| Blue          | `FAM`          | `FAM`             | Usually compatible. |
| Green/Yellow  | `HEX`          | `VIC`             | **Critical:** Bio-Rad is usually calibrated for HEX, QuantStudio for VIC. Spectrally similar; string must match the machine’s library. |
| Red           | `Cy5` / Texas Red | `Cy5` / `ROX` | Check instrument calibration. |
| DNA binding   | `SYBR`         | `SYBR`           | QuantStudio requires Quencher = `None`. |

**Implementation note:** If generating both Bio-Rad and QuantStudio files from one stored assay, consider translating e.g. VIC → HEX for the Bio-Rad CSV when the lab uses VIC reagents. Today we pass through the user’s choice per template; translation can be added in the template route if needed.

## 4. Validation source

- **Bio-Rad:** The CSV string must match the **Calibrated Dyes** list on that instrument. Unsupported names can be rejected or flagged.
- **QuantStudio:** The string must match the **Dye Library** in the software (e.g. spacing/case: `SYBR` vs `SYBR Green`).

Our UI dropdowns provide fluorophore/reporter options (including SYBR for SYBR Green); quencher is inferred in the template route and not shown or stored.

## Summary for implementation

1. **Bio-Rad:** Map stored dye to `Fluorophore` in the CSV. Do not emit or use Quencher.
2. **QuantStudio:** Map stored dye to `Reporter`; **infer** `Quencher` from Reporter: SYBR → `None`, else → `NFQ-MGB`. No quencher field in UI or PATCH.
3. **Translation:** Optionally map VIC ↔ HEX when generating the Bio-Rad template if the lab uses QuantStudio-style names; document or implement in the template route.
