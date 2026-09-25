---
title: Dashboard
description: What you see on the SampleDB home page after you sign in
---

After you sign in, SampleDB opens the dashboard. The heading is **Lab Overview**. The subtitle is "Find samples, track activity, run workflows". A **Data as of** line shows when this page last loaded its numbers. Refresh the page to update the counts.

## Search

The search bar at the top finds a barcode, study short code, subject name, or ID. Press Enter or click **Search**. Results open in a panel so you can jump to the matching record. From any page, **Ctrl+K** / **Cmd+K** opens search. **Ctrl+Shift+K** / **Cmd+Shift+K** opens the command palette. See [Search and navigation](/docs/guides/advanced/search/).

## Quick Actions

The **Quick Actions** section links to common tasks.

If you can write data, you see:

- **Register New Specimen** (`/specimens/new`)
- **Create New Study** (`/studies/new`)
- **Bulk Import** (`/import`)
- **Browse Storage** (`/locations`)

If you have view-only access, you see **Browse Storage** and the note "You have view-only access. Contact an administrator or member to create or modify data."

## qPCR Experiments

This section lists your recent qPCR experiments. Status badges are **Setup**, **In progress**, and **Results imported**. Click a row to open it. If you can write data, **New qPCR experiment** creates one. If the list is empty, the page says there are no qPCR experiments yet.

## Key metrics

Metrics sit in three groups:

- **Inventory:** **Specimens** (opens `/specimens`) and **Containers** (opens **Locations**, `/locations`)
- **Studies:** **Studies** and **Subjects**
- **Storage:** **Locations**

Some cards show a 30-day trend. The section heading **Key metrics** is visually hidden; the group labels are what you read on the page.

## Recent Studies and Recent Activity

**Recent Studies** lists studies with title, short code, lead person, subject and specimen counts, and last update. Click a row to open the study.

**Recent Activity** lists recent creates and updates for specimens, studies, containers, subjects, control batches, and locations.

## System Insights

**System Insights** shows charts for storage use, specimen types, and container types.

## Blood Controls

If the instance has control definitions or batches, a **Blood Controls** summary appears with counts and a link to the Blood Controls page.

## Sidebar

The left sidebar is the main navigation. Labels match these groups:

- **Dashboard**, **Studies**, **Specimens**, **Locations**, **Collections**, **Blood Controls**, **qPCR Experiments**
- **Import**, **Export** (**Multi-Study Export**, **Micronix Barcode Export**)
- **Move Containers** (**Move Micronix Tubes**, **Move Cryovial Tubes**, **Move Papers**), **Move Collections**, **Validate Plate Scan**, **Derivations**
- **Statistics**
- **My Profile**, **Reference Data**, **Application Settings**, **Documentation**

Administrators also see **Admin Dashboard**, **User Management**, **System Settings**, **System Statistics**, **Error Logs**, and **Data Integrity**.
