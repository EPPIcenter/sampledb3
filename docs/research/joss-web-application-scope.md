# JOSS web-application scope

Research for [JOSS web-application scope](https://github.com/EPPIcenter/sampledb3/issues/78), part of [Way to a JOSS-submittable SampleDB](https://github.com/EPPIcenter/sampledb3/issues/76). Captured 2026-08-27. Primary sources are JOSS author and reviewer docs, public review issues, and accepted papers. This repo is used only to map the current architecture onto those rules.

## Claim

JOSS will take a local-installable specimen-inventory web app if the paper argues **criterion 2** of the web-software note (a tested domain model in a real application architecture), not **criterion 1** (a reusable core library with a web skin). Reviewers must be able to run it on their own machine. The closest accepted analogs are Jülich SampleDB (Flask, Docker, sample metadata and locations), eLabFTW (PHP ELN with lab-asset inventory), Taguette (local web app with SQLite), and Castellum (Django, intranet install). The handling editor's desk-reject of "just a website" is a wrapper with no domain core, or a hosted page the reviewer cannot run locally. This codebase is the former risk if the software-design section lists React and Hono as the contribution. It is the latter risk if Docker or `bun` install is not one command.

## What JOSS requires of web-based software

JOSS's own definition of research software includes software that "supports the functioning of research instruments or the execution of research experiments." ([Submitting a paper to JOSS](https://joss.readthedocs.io/en/latest/submitting.html#what-we-mean-by-research-software)) Specimen inventory sits there. It is not a modeling library. It is the system a lab uses while experiments happen.

The web-specific gate is a short note under pre-review screening. Quote, because editors quote it back at authors:

> Many web-based research tools are out of scope for JOSS due to a lack of modularity and challenges testing and maintaining the code. Web-based tools may be considered ‘in scope’ for JOSS, provided that they meet one or both of the following criteria: 1) they are built around and expose a ‘core library’ through a web-based experience (e.g., R/Shiny applications) or 2) the web application demonstrates a high-level of rigor with respect to domain modeling and testing (e.g., adopts and implements a design pattern such as MVC using a framework such as Django).
>
> Similar to other categories of submission to JOSS, it’s essential that any web-based tool can be tested easily by reviewers locally (i.e., on their local machine).
>
> ([A note on web-based software](https://joss.readthedocs.io/en/latest/submitting.html#a-note-on-web-based-software))

Three tests, not two. The local-install sentence is mandatory for every web submission. Criteria 1 and 2 are alternatives. Django and Shiny are examples, not a stack whitelist.

The rest of scope is the same as for a Python package. Feature-complete, not a half-baked demo. Not a "minor utility" or a "thin" API client. ([Scope and significance](https://joss.readthedocs.io/en/latest/submitting.html#scope-and-significance)) Public history of at least six months, evidence the software is already used for research, and ordinary open-source hygiene. Aspirational "labs will use this" is a desk reject by itself. ([Pre-review screening criteria](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)) The Track EiC is told to reject on those hard gates before a handling editor hunts reviewers. ([Editorial Guide](https://joss.readthedocs.io/en/latest/editing.html))

The paper format now requires a labeled **Software design** section. Reviewers grade it on trade-offs, the architecture chosen and why, and why those choices matter for the research application. "Generic code structure description without explaining design reasoning" is the explicit fail. ([Review criteria, Software design](https://joss.readthedocs.io/en/latest/review_criteria.html#software-design-required); [JOSS paper format](https://joss.readthedocs.io/en/latest/paper.html#what-should-my-paper-contain)) Older accepted web papers often lack that heading. eLabFTW (2017) is a one-page summary. Jülich SampleDB (2021) mixes design into the summary. A 2026 submission does not get that leniency.

## How editors actually desk-reject web apps

They do not use the phrase "just a website." They say "web apps / wrappers are out of scope" and then quote the note above.

[BrightWebApp](https://github.com/openjournals/joss-reviews/issues/8684) is the cleanest recent example. Managing EiC Kyle Niemeyer flagged it on day one: "typically web apps / wrappers are out of scope for us, though the underlying software (in this case, Brightway) *would* certainly be in scope." The authors argued criterion 1. Brightway is a JOSS paper. The web app exposes it through Holoviz Panel and can be run locally. The board still rejected. Niemeyer's follow-up:

> So, while Brightway itself is in scope, a web app wrapped around it / showing it off would not be in scope.
>
> The other issue is that it was not clear how this web app itself would be used in research; complexity was not the problem.

That is the failure mode to avoid. Criterion 1 does not save a UI over someone else's library. "We have a core package, the SPA is just the experience" reads as the BrightWebApp defense.

Other rejects in the same neighborhood:

- [BTS](https://github.com/openjournals/joss-reviews/issues/7046), an R/Shiny stats tool. Board comments included "More of an educational tool than research software" and "Lacks a core research-driven package."
- [Muse-it](https://github.com/openjournals/joss-reviews/issues/8653), rejected on the web-software packaging note plus substantial scholarly effort.
- [visual-gestures.js](https://github.com/openjournals/joss-reviews/issues/8394), authors claimed a core npm library behind a demo GUI. Rejected for no obvious research application, no tests, and reusability concerns.

The pattern is consistent. A web UI is in scope when the **domain rules are the software**. It is out of scope when the UI demonstrates, wraps, or teaches a library that could have been the submission.

## Closest accepted analogs

Ranked by how much an editor would nod while reading our paper. None is a Hono + React + SQLite freezer LIMS. Several are local-installable research web apps that survived review.

### 1. Jülich SampleDB (closest domain, name collision)

[Rhiem, F. (2021). SampleDB: A sample and measurement metadata database. *Journal of Open Source Software*, 6(58), 2107.](https://doi.org/10.21105/joss.02107) Review: [openjournals/joss-reviews#2107](https://github.com/openjournals/joss-reviews/issues/2107). Repo: [sciapp/sampledb](https://github.com/sciapp/sampledb).

Flask + SQLAlchemy + PostgreSQL. Docker is the recommended install. Scientists store sample and measurement metadata, track storage locations and responsibilities, and view lifecycles. A JSON schema editor lets users define process metadata without changing application code. There is a Web API for instrument integration and Jupyter notebook templates for analysis.

This is the paper an editor will find first, because of the title. It is a web application. JOSS accepted it. The scholarly claim in that paper is the schema system (users define processes; the app generates forms and validates) versus JuliaBase, which bakes instruments into application code, and versus Bika LIMS / SENAITE, which ship built-in calculations. Install is local (Docker + Postgres), not a marketing site.

It is **not** a small-lab freezer and plate inventory. It is a metadata RDM system for a neutron-science institute. That difference is the build-vs-contribute sentence for [State of the field for the paper](https://github.com/EPPIcenter/sampledb3/issues/82). For *this* ticket, the analog is: JOSS already published a sample-tracking web app installed with Docker. A second SampleDB has to disambiguate on first mention.

### 2. eLabFTW (closest lab-operations analog)

[CARPi, N., Minges, A., & Piel, M. (2017). eLabFTW: An open source laboratory notebook for research labs. *Journal of Open Source Software*, 2(12), 146.](https://doi.org/10.21105/joss.00146) Review: [openjournals/joss-reviews#146](https://github.com/openjournals/joss-reviews/issues/146).

PHP/MySQL electronic lab notebook. Server install, Docker recommended. Experiments, plus inventory of lab assets (antibodies, mice, siRNAs, proteins), plus equipment booking. During review the author said the philosophy is server software, though a personal computer works. Reviewer friction was Mac/OpenSSL, not "this is a website."

This is JOSS accepting a multi-user lab web app whose research job is keeping the lab's records, not computing an orbit. The 2017 paper has no Software design section. Do not copy its length.

### 3. Taguette (closest architecture analog)

[Rampin, R., & Rampin, V. (2021). Taguette: open-source qualitative data analysis. *Journal of Open Source Software*, 6(68), 3522.](https://doi.org/10.21105/joss.03522) Review: [openjournals/joss-reviews#3522](https://github.com/openjournals/joss-reviews/issues/3522).

Python + Tornado web app. Runs on a desktop in single-user mode or on a server for collaboration. Default store is SQLite in the user's home directory, with automatic schema migrations. Other SQLAlchemy backends are optional. Installers for macOS and Windows, Docker, and PyPI. The paper spends a paragraph on that choice.

This is the stack rhyme: a browser UI, a local process, a SQLite file, optional server mode. Domain is qualitative coding, not specimens. Steal the *install story*, not the domain.

### 4. Castellum (criterion 2 textbook)

[Bengfort, T., Hayat, T., & Göttel, T. (2022). Castellum: A participant management tool for scientific studies. *Journal of Open Source Software*, 7(79), 4600.](https://doi.org/10.21105/joss.04600) Review: [openjournals/joss-reviews#4600](https://github.com/openjournals/joss-reviews/issues/4600).

Django web app for participant lifecycle, recruitment, appointments, and a pseudonym service. Design focus is GDPR and IT security. The paper tells institutes to host it on the intranet, not on the public internet. That is criterion 2 as written: MVC, Django, domain model (consent, pseudonyms, recruitment), local/intranet install.

Domain is people in studies, not tubes in freezers. The architecture argument is the analog.

### 5. Coordinate (domain-adjacent, not web)

[Rife, T. W., Courtney, C., Kamath, P., Ellerbrock, B., & Poland, J. A. (2025). Coordinate: An Android application to organize samples into grids. *Journal of Open Source Software*, 10(113), 8263.](https://doi.org/10.21105/joss.08263)

Android app. Barcode or text into Cartesian grids (DNA plate, seed tray). CSV export. JOSS will publish sample-organization software that is not a library. It does not prove the web note. It proves "physical sample workflow tool" is a research application.

### Nearby, weaker analogs

- [NOMAD](https://doi.org/10.21105/joss.05388) is a materials-science data platform with a web UI, Docker images, a Python client, and self-hosted "Oasis" installs. Too large and too much of a hosted service to cite as the shape of this product.
- [MatD3](https://doi.org/10.21105/joss.01945) is a Django database and web app for materials data. Criterion 2 shape, wrong domain.
- [Seed Database Manager](https://github.com/openjournals/joss-reviews/issues/8835) is a Shiny germplasm inventory still in review as of this note. Reviewers asked for Docker or SQLite so they could run it locally without standing up PostgreSQL. Treat it as evidence of the local-install sentence, not as an accepted analog.

I did not find an accepted JOSS paper that is a Hono + React + SQLite LIMS. The editor will analogize from Flask/Django/PHP/Tornado web apps, not from a missing React precedent.

## How this repo maps onto the two criteria

Architecture as it stands (not as the paper will later claim):

- **Model.** SQLite file per deployment. Schema evolution with a snapshot plus numbered SQL deltas. ([ADR 0003](../adr/0003-sqlite-schema-evolution.md); `packages/api/src/db/`) Shared TypeScript contract for wire and write shapes (`packages/contract`). Domain language in [`CONTEXT.md`](../../CONTEXT.md): Study → Subject → Specimen, Container placement, Derivation, Control batch.
- **Controller.** Hono app in `packages/api`. Routes under `/api/...`, middleware (auth, CORS, omit-on-wire), OpenAPI. Domain behavior lives in `packages/api/src/lib/` (provenance, container write/placement, scan validation, derivations, search). Tests hit those modules and routes without a browser. As of this note: 126 `*.test.ts` files under `packages/api`, 9 under `packages/contract`.
- **View.** React SPA in `packages/web`. Production: Hono serves the built SPA from the same process (`serveStatic` in `packages/api/src/index.ts`). Some workflow cores have already been pulled out of pages (scan-move reducer, [ADR 0008](../adr/0008-scan-move-workflow-core.md)). As of this note: 247 web test files (`*.test.ts` + `*.test.tsx`).
- **Local run.** [`docker-compose.yml`](../../docker-compose.yml) publishes `127.0.0.1:${PORT:-3000}:3000` and mounts one SQLite file. Dev path is `bun` in the monorepo.

**Criterion 1 is a weak fit.** There is no public library a bioinformatician imports to "do SampleDB" the way they import Brightway or an R package. `@sampledb/contract` is an internal package. Calling the Hono API a "core library" is the BrightWebApp move. Do not make it.

**Criterion 2 is the fit.** JOSS's example is "MVC using a framework such as Django." This repo is the same split with different names: SQLite + contract types as the model, Hono routes as the controller, React as the view. Domain rules are written down (CONTEXT.md, ten ADRs) and tested. Placement, source resolution, and scan-move exist as modules *because* the UI used to own them and that failed. That is domain modeling, not a marketing site.

**Local testability is currently the easy part** of the web note, assuming a reviewer can `docker compose up` or run the documented `bun` tests. The compose file binding to localhost is the right default. GHCR image visibility is a later checklist question ([map issue 76](https://github.com/EPPIcenter/sampledb3/issues/76) already flags it).

## What a handling editor expects in Software design

The Software design section is where the web-scope argument has to live. Statement of need covers *why labs*. State of the field covers *why not Jülich SampleDB / eLabFTW / OpenSpecimen*. Software design has to answer *why this is research software in application form, not a website*.

Reviewers are told to look for trade-offs, the architecture chosen and why, and why it matters for the research application. ([Review criteria](https://joss.readthedocs.io/en/latest/review_criteria.html#software-design-required)) The Gala example paper talks about API consistency and C-for-speed, not folder layout. ([Example paper](https://joss.readthedocs.io/en/latest/example_paper.html))

An editor scanning for "website" will bounce if the section is:

- "We used React, Hono, and SQLite, a modern stack."
- A box diagram of packages with no trade-off.
- Criterion 1 stretching ("the API is a reusable core library").

The section that survives pre-review looks like the following argument. A later grilling ticket should accept or reject this text, not a milder paraphrase.

## Design-section argument (grill this)

SampleDB is in JOSS scope under the web-software note's **second** criterion: a locally installable application whose contribution is a tested domain model of specimen inventory for research labs, not a wrapper around another library and not a hosted site.

**Research application.** JOSS publishes software that supports the execution of research experiments. Lab staff and biobank operators use SampleDB to know which specimen they have, which container holds it, and which study or control batch it came from. That is experiment infrastructure. It is the same class of research application as eLabFTW's lab inventory and Jülich SampleDB's location tracking, aimed at small labs rather than an institute metadata warehouse.

**Not criterion 1.** There is no separable analysis library being "exposed through a web experience." The inventory rules *are* the software. A handling editor who has just rejected a Panel wrapper around Brightway should see the difference: nothing underneath this UI was already a JOSS paper. If we cannot say that in one sentence, we should not submit.

**Architecture as MVC in this stack.** Persistence is one SQLite file per lab, with explicit schema versions, because a small lab's backup is a file copy and a reviewer should not have to install PostgreSQL. The typed contract (`packages/contract`) is the model boundary shared by API and UI, so placement and identity cannot drift between CSV import, HTTP writes, and screens. Hono routes are the controller. They call domain modules (source resolution, container writes, scan-move, derivations) that the test suite exercises without a browser. The React SPA is the view, including plate grids and barcode-driven moves that a CLI cannot replace for this user. Hono serving the SPA from one process is the Taguette-style "one local program" install, not a fleet of web services.

**Trade-offs that belong in the paper.**

1. SQLite rather than PostgreSQL. Jülich SampleDB chose Postgres for JSONB search across institute-scale metadata. Reviewers of other inventory web apps have asked authors to add SQLite or Docker specifically so they can test locally. We take the small-lab side of that trade: one file, localhost bind, `docker compose up`. We give up multi-writer hosting and warehouse query features.
2. Domain modules rather than page-owned logic. Scan-move and specimen source used to live in React pages and duplicated SQL. Pulling them into tested cores is the domain-modeling claim. If the paper cannot point at a rule (grid occupancy, parent/child derivation, Study→Subject vs Control-batch provenance) that the tests own, the claim is empty.
3. Browser UI rather than an R/Python package. The research object is physical state in freezers, boxes, and plates. Lab staff do not script that. A library-shaped submission would fail the "obvious research application" test for this audience, the way a cursor-gesture npm package failed it for JOSS.

**What would make this argument false.** If a reviewer cannot start the app on a laptop from the README. If domain rules still live only in React event handlers. If the paper's design section names the stack and stops. If we pitch `@sampledb/contract` as a community library it is not. If we ignore Jülich SampleDB and look like we named the product without reading the journal.

Cite in the paper, at minimum: the JOSS web-software note; Rhiem 2021 (disambiguate the name); CARPi et al. 2017; Rampin & Rampin 2021; Bengfort et al. 2022.
