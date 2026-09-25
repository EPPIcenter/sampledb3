---
title: Studies
description: Create and manage research studies
---

A study is the top-level unit for a research project or clinical trial. Subjects belong to a study. Specimens belong to subjects.

## Study fields

The create form heading is **Create Study**. Required fields:

- **Title.** Name shown in lists, for example Namibia Malaria Study 2024.
- **Short code.** Unique identifier used in CSV import, export, and search. Typically 3-6 characters, such as NAM15 or TCC08. Must be unique across all studies.
- **Lead Person.** Primary investigator or study coordinator.

Optional:

- **Description.** Protocol notes or other context.
- **Longitudinal study.** Select this checkbox if subjects can have specimens at more than one timepoint. You cannot change this after you create the study. If you are unsure, select it. A non-longitudinal study still allows multiple specimen types on the same collection date.

## Create a study

Open the form from any of these places:

- On the Dashboard, in **Quick Actions**, click **Create New Study**.
- On the Studies page, click **New Study**.
- Press Ctrl+Shift+K or Cmd+Shift+K and run **Create New Study**. That command is available on the Dashboard, the Studies page, and study detail pages. Ctrl+K or Cmd+K opens search, not the command palette.

Fill in the fields, then click **Create**. SampleDB opens the study detail page.

## Study detail page

A sticky header stays visible while you scroll. It shows title, short code, lead person, a **Longitudinal** badge when applicable, the description or **No description**, and counts for subjects, specimens, containers, and average specimens per subject.

Primary actions are **Create Subject** and **Export Data**. **More actions** includes **Edit study**, **Bulk import**, and **Merge subjects**. **Delete study** appears when you have permission.

Tabs:

- **Overview.** Subject count, specimen count, container count, collection date range, and specimen-type breakdown. A **Date Filter** card limits statistics and charts by collection date.
- **Subjects.** Table of subject name, specimen count, created date, and last updated. Click a row to open the subject.
- **Timeline.** Shown when the study is longitudinal or has collection dates.

## Edit or delete a study

On the study detail page, open **More actions** and click **Edit study**. You can change title, description, lead person, and short code if the new code is unique. You cannot change the longitudinal flag. If that flag is wrong, create a new study and migrate the data.

To delete a study, type the short code exactly in the confirmation dialog, then click **Delete study**.

## Short codes

Use the same short code in CSV files that you use in the UI. Avoid special characters that break CSV parsing. Many labs keep codes uppercase and 3-6 characters.

## Find studies

On the Studies page, search matches titles, short codes, and lead person names. You can filter and sort by creation date, title, and other attributes.

## Add subjects

On the study detail page, click **Create Subject** in the header or **Add subject** on the Subjects tab. In the command palette the same action is **Create New Subject**. For many subjects, see [Bulk import](/docs/guides/bulk-operations/import/).
