---
title: Subjects and specimens
description: Create subjects and register specimens one at a time
---

A **subject** is a participant or sample source in a study. The name must be unique within that study. A **specimen** is the registered biological sample from one collection event. One subject can have many specimens. Each specimen belongs to one source, usually a subject.

This page covers one-at-a-time entry. For many rows, see [Bulk import](/docs/guides/bulk-operations/import/).

## Create a subject

Subjects are created from their study, or during specimen registration.

1. Open the study.
2. Click **Create Subject** in the header, or **Add subject** on the Subjects tab. In the command palette the same action is **Create New Subject**.
3. Enter the subject name, then click **Create Subject**.

If the name already exists in the study, SampleDB rejects it.

## Register a specimen

Open the form from any of these places:

- On the Dashboard, in **Quick Actions**, click **Register New Specimen**.
- On a subject detail page, click **Add Specimen**. The subject is already selected.
- On the Specimens page, click **New Specimen**.
- Press Ctrl+Shift+K or Cmd+Shift+K and run **Create New Specimen**. That command is available on the Dashboard, the Specimens page, and subject detail pages. Ctrl+K or Cmd+K opens search, not the command palette.

### Specimen fields

1. Select a source type. **Subject** is the usual choice. The other options are **Control**, **Reagent**, **Cell Line**, **Plasmid**, and **Standard**.
2. If the source is **Subject**, select the study or enter its short code, then select the subject. To create the subject in the same step, select the **Create New Subject** checkbox and enter the name.
3. Select a **Specimen Type** from Reference Data.
4. Optional: enter **Collection Date** as YYYY-MM-DD. If you leave it blank, the specimen is saved without a date. SampleDB does not default to today.

### Add a container

Select **Add Container** to create a container in the same step. Allowed types depend on the specimen type.

- **Micronix Tubes.** Collection name (plate), unique barcode, position such as `A01`.
- **Cryovial Tubes.** Collection name (box) and position. Barcode is optional.
- **Papers.** Box or bag collection name, **sheet name**, optional **spot label**. CSV and API still call that field `sublabel`.
- **Static Wells.** Collection name. Position is optional, same A01-H12 format as micronix.

You can pick an existing collection or create one and assign a location. The form also has **Unit (Optional)** and total and remaining quantity, prefilled for the container type.

Click **Create**. SampleDB creates the specimen, the subject if you asked for one, and the container if you filled those fields.

## Subject detail page

The header shows the subject name, study, **Edit Subject**, and **Add Specimen**.

Below that, specimens are grouped by collection date. Each entry shows specimen type and container information, with links to the records. Container notes appear under the specimen when they exist.

Statistics show specimen count, collection date range, and a breakdown by specimen type.

## Specimen detail page

The page shows specimen type, collection date, source, and study when the source is a subject.

For each container: type, barcode or sublabel, position for grid containers, collection, location, and status. Status is **In Use** when remaining quantity is greater than zero, and **Exhausted** when remaining quantity is zero. Container notes appear on each container card.

Derivation history is on the container detail page, not the specimen page. That page links to the parent container, derivation type, date, and protocol.

## Edit subjects and specimens

On the subject detail page, click **Edit Subject** to change the name. Downstream exports that used the old name will not match until you update them.

Specimen records cannot be edited in the app after creation. Ask an administrator if a correction is required.

## When to use bulk import

Use [Bulk import](/docs/guides/bulk-operations/import/) when you have more than a handful of subjects or specimens. Use this page for a few records or for cases that do not fit a CSV.

For storage after registration, see [Containers](/docs/guides/workflows/containers/).
