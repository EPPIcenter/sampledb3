#!/usr/bin/env python3
"""Explore qPCR example output files to understand structure for database design."""
import csv
import sys
from pathlib import Path

# .xls is Excel 97-2003; xlrd handles it. .xlsx would need openpyxl.
try:
    import xlrd
except ImportError:
    print("Installing xlrd... run: uv pip install xlrd")
    sys.exit(1)


def explore_csv(path: Path) -> None:
    """Explore Biorad result CSV: metadata, results table, and any amplification/raw data."""
    print(f"\n{'='*60}\n{path.name}\n{'='*60}")
    with path.open(newline="", encoding="utf-8", errors="replace") as f:
        rows = list(csv.reader(f))
    print(f"Total rows: {len(rows)}")
    # Find results table (header with Well, Cq, etc.)
    results_start = None
    for i, row in enumerate(rows[:80]):
        if not row:
            continue
        row_str = " ".join(str(c) for c in row).lower()
        if "well" in row_str and ("cq" in row_str or "starting quantity" in row_str):
            results_start = i
            break
    if results_start is not None:
        print(f"\n--- Results table at row {results_start} ---")
        print("Header:", rows[results_start])
        for r in range(results_start + 1, min(results_start + 5, len(rows))):
            print(rows[r])
    # Show metadata (lines before results)
    print("\n--- Metadata (first 20 rows) ---")
    for i, row in enumerate(rows[:20]):
        print(row)
    # Check for any second table (e.g. amplification by cycle)
    if results_start is not None and results_start + 100 < len(rows):
        remainder = rows[results_start + 100 : results_start + 120]
        if any(r for r in remainder if r and len(r) > 2):
            print("\n--- Possible extra data after results (sample) ---")
            for row in remainder[:10]:
                if row:
                    print(row)


def explore_xls(path: Path) -> None:
    print(f"\n{'='*60}\n{path.name}\n{'='*60}")
    wb = xlrd.open_workbook(str(path))
    print(f"Sheets: {wb.sheet_names()}")
    for sheet_name in wb.sheet_names():
        sheet = wb.sheet_by_name(sheet_name)
        print(f"\n--- Sheet: {sheet_name} (rows={sheet.nrows}, cols={sheet.ncols}) ---")
        # Amplification (cycle-by-cycle) data: capture header + sample rows
        if "amplif" in sheet_name.lower() or "raw" in sheet_name.lower():
            print("  [Amplification / raw data sheet]")
            for row_idx in range(min(sheet.nrows, 50)):
                row = [sheet.cell_value(row_idx, c) for c in range(min(sheet.ncols, 20))]
                print(row)
            if sheet.nrows > 50:
                print("  ...")
        # For QuantStudio "Results", find where table starts
        elif sheet_name == "Results" and "QuantStudio" in path.name:
            for start in range(min(60, sheet.nrows)):
                row = [str(sheet.cell_value(start, c)).strip() for c in range(sheet.ncols)]
                if row and (row[0] == "Well" or "Well Position" in str(row)):
                    print(f"  [Results table at row {start}]")
                    print("  Header:", row)
                    for r in range(start + 1, min(start + 5, sheet.nrows)):
                        print([sheet.cell_value(r, c) for c in range(sheet.ncols)])
                    break
            else:
                for row_idx in range(min(sheet.nrows, 55)):
                    print([sheet.cell_value(row_idx, c) for c in range(min(10, sheet.ncols))])
        elif sheet_name == "Sample Setup" and "QuantStudio" in path.name:
            for start in range(min(60, sheet.nrows)):
                row = [str(sheet.cell_value(start, c)).strip() for c in range(sheet.ncols)]
                if row and ("Well" in str(row[0]) or "Sample Name" in str(row)):
                    print(f"  [Sample Setup table at row {start}]")
                    for r in range(start, min(start + 98, sheet.nrows)):
                        print([sheet.cell_value(r, c) for c in range(min(10, sheet.ncols))])
                    break
            else:
                for row_idx in range(min(sheet.nrows, 35)):
                    print([sheet.cell_value(row_idx, c) for c in range(min(6, sheet.ncols))])
        else:
            for row_idx in range(min(sheet.nrows, 35)):
                row = [sheet.cell_value(row_idx, c) for c in range(sheet.ncols)]
                print(row)


def main():
    examples_dir = Path(__file__).resolve().parent
    xls_files = [
        examples_dir / "Quant Studio qPCR Plate Layout Template.xls",
        examples_dir / "QuantStudio_varATS-IM-25-048-05-04-2025.xls",
    ]
    csv_files = [
        examples_dir / "Biorad_varATS-IM-25-039-03-01-2025.csv",
    ]
    for p in csv_files:
        if p.exists():
            explore_csv(p)
        else:
            print(f"Not found: {p}")
    for p in xls_files:
        if p.exists():
            explore_xls(p)
        else:
            print(f"Not found: {p}")


if __name__ == "__main__":
    main()
