# SampleDB

A specimen inventory and workflow system for research and clinical labs. SampleDB tracks biological samples from study enrollment through physical storage, bulk data entry, quality controls, and selected assay workflows. Primary users are lab staff and biobank operators who need to know what they have, where it is, and which study or protocol it belongs to.

## Language

### People

**Lab staff**:
People who register, store, move, and retrieve biological specimens day to day.
_Avoid_: End user, operator (without context)

**Biobank operator**:
Lab staff responsible for long-term specimen storage, inventory accuracy, and sample retrieval.
_Avoid_: Curator (unless that is your org's term)

### Provenance hierarchy

**Study → Subject → Specimen** is the primary provenance chain. Most specimens trace back to a study participant or sample source through this path.

**Composition → Control definition → Control batch → Specimen** is the parallel provenance chain for quality control specimens (see **Controls** below).

**Study**:
The top-level organizational unit for a research project, clinical trial, or other coordinated collection of samples.
_Avoid_: Project (unless referring to non-study work), trial (as a synonym for study)

**Subject**:
A participant or sample source within a study, identified by a unique name within that study.
_Avoid_: Patient (unless the study is clinical and that is your org's term), donor (unless that is your org's term)

**Specimen**:
The collected unit — a registered biological material from a specific collection event. One collection event, one specimen record.
_Avoid_: Sample (as the domain term; see **Sample** below)

**Sample**:
Plain-language term for physical biological material in the lab. Once registered in SampleDB, the record is a **Specimen**; "sample" remains fine in marketing and casual prose.
_Avoid_: Using "sample" as the domain term in UI labels, CSV headers, or developer docs

**Aliquot**:
A portion of a specimen's material stored in its own **Container**. Multiple containers may hold the same specimen, each representing a distinct aliquot. Created by registering multiple containers for one specimen or using "Add container" — not via **Derivation**.
_Avoid_: Specimen; Derivation (aliquots do not require a transformation record)

**Source**:
Where a specimen's material originated. The primary source is a **Subject** (via a study). Alternate sources include **Control batch**, **Reagent**, **Cell line**, **Plasmid**, and **Standard**.
_Avoid_: Origin (too vague); parent (reserved for derivations — use **Parent container**)

### Controls (quality control specimens)

SampleDB supports multiple **Control** types for QC, calibration, and validation. Control specimens use the same **Specimen** and storage hierarchies as study specimens, but provenance runs through definitions and batches instead of studies and subjects.

**Control**:
A reference material used for quality control — registered as a **Specimen** whose source is a **Control batch**, not a study **Subject**.
_Avoid_: Standard (use **Standard** only for the reference-data entity); QC sample (plain language is fine)

**Composition**:
The top-level grouping for strain-mixture controls — a parasite strain mix (which strains and their percentages). One composition can have multiple **Control definitions** at different target densities.
_Avoid_: Mix (too vague); strain signature (implementation detail)

**Control definition**:
A specification for producing a control. For strain-mixture controls: a **Composition** plus target density. For other control types: a simpler template without the composition hierarchy.
_Avoid_: Recipe (plain language only); control type (use for the category field, e.g. blood, plasma)

**Control batch**:
A specific production run of a control definition. Contains the actual control **Specimens**. This is the **Source** when registering or referencing a control specimen.
_Avoid_: Lot (unless that is your org's term); batch (unqualified — conflicts with other uses)

**Blood Controls**:
The UI area for managing controls. Strain-mixture (synthetic parasite) controls require the full **Composition → Control definition → Control batch** hierarchy; other control types (plasma, antibody, extraction, etc.) are supported with a simpler definition-and-batch model.
_Avoid_: Controls page (UI label varies); implying all controls require compositions


### Processing

**Derivation**:
A tracked transformation from material in a **Parent container** to material in a **Child container**, usually with a new **Specimen** type (e.g. whole blood → DNA). Creates a new specimen, a new container, and a parent→child derivation record documenting the processing step.
_Avoid_: Aliquot (when splitting the same specimen without transformation)

**Parent container** / **Child container**:
The source and result containers linked by a derivation. The parent holds material before processing; the child holds material after.
_Avoid_: Source container / derived container (acceptable in UI copy, but prefer parent/child in domain docs)

_Note_: The derivation type labeled **Distribution** in the UI (`aliquot` in CSV imports and stored records) means distribution as a *tracked processing step* (parent → child, new specimen) — not the same as adding a second container to the same specimen.

### Configuration

**Reference data**:
System-wide configuration that defines what SampleDB can store and how it is organized — specimen types, units, storage types, locations, strains, tags, and related lookup entities. Set up during initial configuration; updated as lab needs evolve.
_Avoid_: Master data (unless that is your org's term), metadata (too vague)

**Operational data**:
Day-to-day records created through lab work — studies, subjects, specimens, containers, controls, derivations, and imports.
_Avoid_: Transactional data (acceptable in developer docs, but "operational" matches lab vocabulary)

### Physical storage hierarchy

**Specimen → Container → Collection → Location** describes where material is physically stored. A specimen may exist without a container. When stored, one specimen may have many containers — each container is an aliquot.

**Container**:
A physical storage unit holding all or part of one specimen's material (e.g. a micronix tube, cryovial, dried blood spot paper). Multiple containers may reference the same specimen.
_Avoid_: Vial, tube, well (use as container *types*, not as the domain term); Specimen

**Collection**:
A group of containers handled together as one physical unit — a plate, box, or bag. Not the act of collecting a sample from a subject.
_Avoid_: Sample collection, plate (when you mean the collection entity), batch (conflicts with control batch)

**Location**:
A place in the storage hierarchy where collections are kept (e.g. freezer, shelf, room).
_Avoid_: Site (unless referring to an external facility), storage (too vague)

### System

**SampleDB**:
The application — a specimen inventory and workflow system for research and clinical labs.
_Avoid_: LIMS (unless describing the broader category externally), ELN, SRA submission system (not available today)

## Scope

What SampleDB is and is not — for product descriptions and documentation.

**In scope today**:
Specimen inventory and provenance (studies, subjects, specimens), physical storage tracking (containers, collections, locations), bulk CSV import and export, blood controls, container derivations, and assay *preparation* workflows such as qPCR plate layout and template export. Plate scan validation for micronix collections.

**Out of scope today**:
Full LIMS or ELN replacement. Broad instrument integration. qPCR result import. SRA/NCBI submission management. General assay result storage (sequencing, qPCR runs, etc.).

**Roadmap** *(internal only — do not publish in README, user guide, or package metadata)*:
Full qPCR support including result import. SRA/NCBI submission management. **Assay result** tracking — storing and linking experimental outputs (qPCR results, sequencing data) to specimens, containers, or experiments.

### Planned domain terms

**Assay result** *(roadmap)*:
Experimental output from a lab assay (e.g. qPCR amplification data, sequencing read metrics), linked to the specimen, container, or experiment that was tested.
_Avoid_: Result (too vague), run (a run produces results; distinguish **Experiment** / **Run** when those terms are defined)

## Example dialogue

> **New lab staff:** Where do I start when we get a new clinical study?
>
> **Domain expert:** Create a **Study** first — that's the container for everything in that protocol. Then add **Subjects** (your participants). When blood comes in, you register a **Specimen** for each collection event and tie it to the subject.
>
> **New lab staff:** And when we put the tubes in the freezer?
>
> **Domain expert:** That's the storage side. Each tube becomes a **Container** linked to the specimen — if you split the draw into three tubes, that's three containers, three aliquots, still one specimen. Containers go into a **Collection** — say, a micronix plate — and the plate sits at a **Location** in your freezer hierarchy. Provenance first, storage second.
>
> **New lab staff:** What if we extract DNA from one of those tubes?
>
> **Domain expert:** That's a **Derivation** — a transformation we track. The original tube is the parent container; the extracted DNA goes in a child container with its own specimen record. Different from aliquoting, where you're just dividing the same collection across tubes.
