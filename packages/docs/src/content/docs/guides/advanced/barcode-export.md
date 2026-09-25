---
title: Micronix barcode export
description: Export container data from a CSV of micronix barcodes
---

Open **Operations → Export → Micronix Barcode Export**. The page heading is **Micronix Barcode Export**. Command palette: **Open Barcode Export**.

This is a barcode list, not a subject list. For subjects across studies, see [Multi-study export](/docs/guides/bulk-operations/export/).

## Upload

Under **Upload CSV File**, select a `.csv` with one barcode per row. The column must be named `barcode`, `container barcode`, or `container_barcode`. There is no paste field and no scanner capture on this page. Save handheld scans to a CSV first.

## Format and columns

Choose **CSV download**, **XLSX download**, or **JSON download**. CSV uses plain quoted strings, not Excel formula wrappers. Use XLSX if Excel must keep leading zeros on barcodes. JSON is for programmatic import.

Pick an **export configuration** for columns. Manage presets in [Application Settings](/docs/guides/advanced/settings/).

## Summary

After download, **Export Summary** shows how many containers were exported, **Barcodes Found**, and **Barcodes Not Found**. Not-found usually means a typo or a tube that is not in the database.

If the same barcode appears more than once in results, that is a data-integrity problem (micronix barcodes must be unique). Contact an administrator.
