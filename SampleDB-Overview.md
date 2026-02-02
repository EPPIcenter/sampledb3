# SampleDB: Laboratory Sample Management System

**A two-page overview for teams interested in using SampleDB**

---

## What Is SampleDB?

SampleDB is a **laboratory information management system (LIMS)** built for wet lab teams who need to track biological samples, containers, and storage from collection through long-term storage and analysis. It helps you maintain accurate, searchable records for studies, subjects, specimens, and physical storage so you can find any sample quickly and keep a clear chain of custody.

SampleDB is developed by **EPPIcenter** (Experimental & Population-based Pathogen Investigation Center) at the University of California, San Francisco. It is designed with input from laboratory staff to support real-world workflows—from small pilot studies to large multi-site research projects—and to scale as your inventory grows.

---

## Goals

- **Single source of truth** — Studies, subjects, specimens, containers, and locations live in one system so everyone works from the same data.
- **Traceability** — Track where each sample came from (subject or control batch), where it is stored (location and container), and how it was processed (derivations).
- **Efficiency** — Bulk import and export, collection-level moves, and global search reduce data entry and speed up daily tasks.
- **Flexibility** — Configure specimen types, units, storage types, and location hierarchies to match your lab; support for multiple container types (tubes, plates, papers, boxes, bags).
- **Integration with lab workflows** — Optional support for qPCR experiments (plate layout, instrument templates, result import) and blood control management.

---

## Core Concepts

The system is organized around a few linked concepts:

- **Studies** — Research projects or trials. Each study has a unique short code (e.g. `NAM15`) used in imports, exports, and search. Studies can be longitudinal (multiple timepoints per subject) or single-timepoint.
- **Subjects** — Participants or sample sources within a study (e.g. patients, animals). Each subject can have many specimens over time.
- **Specimens** — The biological samples you track (e.g. whole blood, plasma, DNA), with type, collection date, and optional link to a control batch.
- **Containers** — Physical storage units: Micronix tubes (in 96-well plates), cryovial tubes (in boxes), papers (e.g. DBS in boxes/bags), or static wells. Each container can hold one specimen and belongs to a collection.
- **Collections** — Plates, boxes, or bags that group containers (e.g. a Micronix plate, a cryovial box, a bag of papers).
- **Locations** — A hierarchical model of your storage (e.g. Building → Room → Freezer → Shelf). Each collection is assigned to a location so you know where it lives.

This structure supports “which subject, which specimen, in which container, in which collection, at which location”—so you can answer both “where is this tube?” and “what is in this tube?” from one place.

---

## Major Features and Functionality

### Study and Subject Management

- Create and edit studies (title, short code, description, lead person, longitudinal vs. single-timepoint).
- Add subjects to studies manually or in bulk.
- View study-level statistics: subject count, specimen count, containers, collection date range, and specimen-type breakdown.
- Study short codes are used consistently across import, export, and search.

### Specimen and Container Tracking

- Register specimens with type, collection date, and optional link to a study subject or control batch.
- Support for multiple container types: Micronix tubes (barcode + position in plate), cryovial tubes (position in box, optional barcode), papers (labels in box/bag), static wells (position in plate).
- Containers are grouped into collections (plates, boxes, bags); each collection is assigned to a location in your hierarchy.
- Move individual containers between positions or collections, or **move entire collections** between locations in one step (e.g. when relocating a freezer or reorganizing storage).

### Storage and Locations

- **Hierarchical locations** — Model your real storage (e.g. freezers, shelves, drawers). No fixed depth; you define the tree.
- **Storage types** — Tag locations (e.g. -80°C, -20°C, 4°C, room temp) for filtering and reporting.
- Browse locations in a tree view; see which collections (and thus which samples) are at each location.
- Collection move and location assignment keep records aligned with physical moves.

### Bulk Import and Export

- **Import** — CSV-based bulk import for:
  - **Subjects only** (study code + subject name).
  - **Specimens only** (for existing subjects).
  - **Combined** (subjects and specimens in one file; subjects are created if missing).
- Choose container type per import (or “no containers” to register specimens only). The system can create missing collections and assign locations during import.
- Validation before commit: required columns, valid study codes, date formats, positions, and uniqueness (e.g. barcodes) are checked with clear error messages.
- **Export** — Export container-level data by providing a subject list (study code + subject name) in CSV. Optional filters (e.g. specimen type, date range) and configurable columns. Supports barcode-focused exports for scanning workflows.

### Derivations (Processing and Chain of Custody)

- Record **derivations** when a new sample is created from an existing one (e.g. DNA extraction, dilution, aliquot).
- Link parent container → derivation type → derived container; optional protocol, date, and quantity tracking.
- **Bulk derivation import** via CSV for high-throughput processing (e.g. a full plate of extractions).
- Derivation chains are visible from container detail pages, supporting audit trails and reproducibility.

### Blood Controls

- **Control definitions** — Describe a control type (e.g. strain composition, target density). Once defined, you can create multiple batches from the same definition.
- **Control batches** — Specific productions of a control; specimens are linked to batches. Inventory (e.g. spots or tubes per batch) is tracked.
- Control specimens can be used like study specimens in workflows (e.g. in containers, derivations, qPCR plates).

### qPCR Experiments (Optional Workflow)

- **Create an experiment** — Optionally name it (e.g. study or run ID).
- **Plate layout** — Upload a CSV mapping micronix barcodes (and optionally controls) to well positions. Same barcode resolution as elsewhere (e.g. container move).
- **Instrument templates** — Generate plate templates for **Bio-Rad CFX 96** (CSV) or **Thermo Fisher Quant Studio** (TXT). Configure target name, fluorophore/reporter, and (for Quant Studio) instrument type. Templates use subject names for unknowns and parasite density for standards.
- **Result import** — After the run, upload the instrument output file (Bio-Rad CSV or Quant Studio XLS). SampleDB stores run data (e.g. amplification) for optional analysis.
- Experiment states (e.g. setup, template ready, results imported) and plate locking after template export or result import keep layout and results consistent.

### Search, Dashboard, and Navigation

- **Global search** — One search box for studies, subjects, specimens, containers, locations, and control batches (e.g. by short code, name, barcode, ID). Jump directly to the matching entity.
- **Command palette** (e.g. Ctrl+K / Cmd+K) — Shortcuts to main sections, create actions, export, and bulk operations.
- **Dashboard** — Overview of key counts (studies, specimens, subjects, containers, locations), recent studies, recent activity, and system insights (e.g. storage and specimen-type distribution). Quick actions for registering a specimen, creating a study, bulk import, and search.
- **Settings** — Configurable options (e.g. session duration, export preferences). Reference data (specimen types, units, storage types, locations, strains, etc.) is managed through the Reference Data area so the system matches your lab’s vocabulary.

### User Roles and Security

- **Roles** (e.g. admin, member, viewer) control who can change reference data, delete studies, or only view. Authentication protects the API and web app so only authorized users can access or modify data.

---

## Technical Snapshot

- **API** — TypeScript (Hono) with SQLite and Drizzle ORM.
- **Web app** — React, Vite, Tailwind CSS; responsive UI with a consistent “precision lab” style for dashboard, studies, and storage pages.
- **Database** — Single SQLite database; schema supports studies, subjects, specimens, containers, collections, locations, derivations, control definitions/batches, and qPCR experiments.
- **Deployment** — Run API and web app together or separately; configure via environment variables (e.g. `DATABASE_PATH`, `PORT`).

---

## Summary

SampleDB gives wet lab teams a single place to manage **studies**, **subjects**, **specimens**, **containers**, **collections**, and **locations**, with **bulk import/export**, **derivations** for chain of custody, optional **blood control** and **qPCR experiment** workflows, and **search/dashboard** for daily use. Its goals are traceability, efficiency, and flexibility so you can keep accurate sample records and find any sample quickly, whether you’re running a small study or a large multi-site program.

For detailed steps and workflows, see the user guides in the documentation (setup, dashboard, studies, subjects and specimens, containers, locations, import, export, collection move, blood controls, derivations, qPCR experiments, reference data, and troubleshooting).
