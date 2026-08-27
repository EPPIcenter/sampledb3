# JOSS criteria versus EPPIcenter/sampledb3

Research for [JOSS criteria versus this repo](https://github.com/EPPIcenter/sampledb3/issues/77), part of [Way to a JOSS-submittable SampleDB](https://github.com/EPPIcenter/sampledb3/issues/76). Snapshot date: 27 August 2026. No LICENSE, `paper.md`, CI, or README work was done for this note.

## Verdict

SampleDB would not survive JOSS pre-review today. The hard misses are an actual license file, a `paper.md`, contribution guidelines, and unit tests in CI. Public git history and the existing test suite are already in the shape JOSS wants. Research impact and the web-application clause are not fail-on-the-repo; they are arguments this map still has to lock.

| Gate | Result | Why in one line |
| --- | --- | --- |
| License file | fail | README and `package.json` say MIT. There is no `LICENSE` or `COPYING` file. GitHub reports `license: null`. |
| Public development history | pass | Public GitHub repo created 16 December 2025. 460 commits from 15 December 2025 through 26 August 2026. That is more than six months, not a dump. |
| Iterative development | pass | Commits across eight calendar months. Bursty, with a July 2026 hole. JOSS treats bursty-but-long as OK. |
| Research impact | unknown | Nothing in the public repo cites papers or names an external lab. The map already treats this as open. |
| Open-source practice | fail | Solo author. Releases and docs exist. No `CONTRIBUTING`, no stated support path, and CI does not run the test suite. |
| Documentation | pass | README plus a 37-page Starlight operator guide, install via Bun and Docker, and a tutorial walkthrough. API docs are a stub. |
| Tests and CI | fail | Large automated suite, documented to run locally. GitHub Actions never runs `bun run test`. CI only builds the container and hits `/health`. |
| Community guidelines | fail | No `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, or `SUPPORT` file. README has no contribute / report / seek-support section. |
| Web-application clause | unknown | This is a Hono + React web app. Criterion 1 (expose a core library) is weak. Criterion 2 (domain modeling and testing rigor, local review) is arguable. Editors decide. |
| `paper.md` | fail | No `paper.md` or `paper.bib` anywhere in the tree. Never added in git history. |

**Must meet (all four screening gates).** JOSS desk-rejects if any one fails ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)).

| Screening gate | Result |
| --- | --- |
| Sufficient public development history | pass |
| Demonstrated research impact | unknown |
| Good open source practices | fail |
| Iterative development over time | pass |

## Sources

Primary JOSS pages, retrieved 27 August 2026:

- [Submitting a paper to JOSS](https://joss.readthedocs.io/en/latest/submitting.html)
- [Review criteria](https://joss.readthedocs.io/en/latest/review_criteria.html)
- [JOSS paper format](https://joss.readthedocs.io/en/latest/paper.html)

Repo and GitHub evidence: `EPPIcenter/sampledb3` default branch `main` at `17fcbc1` (26 August 2026), `gh api` / `gh repo view` / `gh release list` / `git log` on that commit.

## License file

JOSS review item: "There should be an OSI approved license included in the repository." Acceptable is a plain-text `LICENSE` or `COPYING` file with the contents of an OSI-approved license. Not acceptable: a phrase such as "MIT license" in a README ([Review criteria, Software license](https://joss.readthedocs.io/en/latest/review_criteria.html#software-license)). Submission requirements also say the software must be open source as per the OSI definition, and "Make your software available in an open repository … and include an OSI approved open source license" ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#submission-requirements), [Submission process](https://joss.readthedocs.io/en/latest/submitting.html#submission-process)).

Evidence:

- No `LICENSE`, `LICENSE.md`, `COPYING`, or `COPYING.md` at repo root. `git log --all --diff-filter=A --summary` never added one.
- `README.md` ends with `## License` / `MIT`.
- Root `package.json` has `"license": "MIT"`. Nightly and release container workflows label the image `org.opencontainers.image.licenses=MIT`.
- `gh api repos/EPPIcenter/sampledb3` returns `"license": null`. `GET /repos/EPPIcenter/sampledb3/license` is 404.

MIT itself is OSI-approved ([OSI MIT](https://opensource.org/license/mit)). The map already records that UCSF authority exists and that adding the file is implementation after this map, not a ticket here.

**Result: fail.** Implementation after the map, not a remaining decision.

## Public development history and iterative development

Pre-review must-meet: the repository must have been public for more than six months prior to submission, with active development spanning that period. JOSS runs automated checks on commit distribution. A repo dump is not a history ([Submitting, Pre-review screening](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)).

Review criteria, development timeline ([Review criteria, Development timeline](https://joss.readthedocs.io/en/latest/review_criteria.html#development-timeline)):

- Good: commits distributed over 6+ months showing gradual feature development.
- OK: development spanning 6+ months but sporadic or bursty.
- Not acceptable: all or most commits concentrated in the last few weeks before submission.

Open development ([Review criteria, Open development](https://joss.readthedocs.io/en/latest/review_criteria.html#open-development)): for recently created public repositories, at least six months of public history with releases or tags and public issues and/or pull requests.

Evidence (27 August 2026):

| Fact | Value | Source |
| --- | --- | --- |
| Visibility | public | `gh repo view` → `visibility: PUBLIC`, `isPrivate: false` |
| GitHub `created_at` | 2025-12-16T03:50:57Z | `gh api repos/EPPIcenter/sampledb3` |
| First commit | 2025-12-15 `3bdddf9` Maxwell Murphy "initialize" | `git log --reverse` |
| HEAD on `main` | 2026-08-26 `17fcbc1` | `origin/main` |
| Commit count | 460 | `git rev-list --count origin/main` |
| Authors | 460 / 460 Maxwell Murphy `<mm@maxmurphy.dev>` | `git shortlog -sn`, `git log --format` |
| GitHub contributors | `m-murphy` only, 460 contributions | `gh api …/contributors` |
| Calendar months with commits | Dec 2025 (6), Jan 92, Feb 138, Mar 42, Apr 35, May 102, Jun 40, Jul 0, Aug 5 | `git log --date=format:%Y-%m` |
| Gap | last June commit 2026-06-11; next 2026-08-26. Zero July commits. | `git log` |
| Tags / releases | `v1.0.0-rc.1`, `v1.0.0` (22 Apr 2026), `v1.1.0` (11 May 2026, latest) | `gh release list` |
| Issues | 70 closed, 11 open, issue tracker on | `has_issues: true`; `gh issue list` |
| Pull requests | 5 closed, 0 open, all author `m-murphy` | `gh pr list` |

Age from GitHub `created_at` to this snapshot is about eight and a half months. That clears the six-month floor if the repo was public from creation. GitHub's public API does not expose "made public at". If the repo was private for part of that window, the clock starts when it became public, and that date is unknown here. The map already has [Public GitHub and docs presence](https://github.com/EPPIcenter/sampledb3/issues/84) for the public-presence story.

The July 2026 hole is the only awkward stretch. JOSS's "OK" bucket is exactly this: 6+ months with bursty activity. The map already lists "Whether the mid-2026 commit gap needs a sentence in the paper" under Not yet specified. That is a paper-wording decision, not a reason to fail the history gate.

**Result: pass** on both public history and iterative development, with the public-from-day-one date unproven and the July gap already queued for the paper.

## Research impact

Pre-review must-meet: evidence the software is being used for research, at minimum by the developers, ideally by others. Acceptable signals: papers or preprints, documented adoption by other groups, or clear integration into research workflows. Private workflows are acceptable if demonstrated to the editorial team. Aspirational future use is not enough ([Submitting, Demonstrated research impact](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)).

Review criteria repeat that list and add a required paper section, "Research impact statement", that must be specific, not aspirational ([Review criteria, Research impact statement](https://joss.readthedocs.io/en/latest/review_criteria.html#research-impact-statement-required); [Paper format](https://joss.readthedocs.io/en/latest/paper.html#what-should-my-paper-contain)).

Evidence in this repo:

- `README.md` and `packages/docs` describe a specimen inventory for research and clinical labs. That is an obvious research application under JOSS's "What we mean by research software" (supports research instruments / experiments) ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#what-we-mean-by-research-software)). Application is not the same as demonstrated impact.
- No `CITATION.cff`, no `paper.md`, no bibliography of papers that used SampleDB.
- `gh api` : 0 stars, 0 forks. Issue and PR authors are only `m-murphy`. GraphQL over 100 issues: comment authors unique set is `["m-murphy"]`.
- The map Notes already say: "Research impact: at least one lab besides EPPIcenter has run it. Which lab, and what we may print, is still open." Companion ticket: [Research impact we can claim](https://github.com/EPPIcenter/sampledb3/issues/80).

**Result: unknown.** This is a map decision. Do not treat "EPPIcenter built it" as enough. JOSS wants named use, ideally citable.

## Open-source practice

Pre-review must-meet, "Good open source practices" ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)):

> For multi-author projects this means evidence of issues, pull requests, and public discussion. For single-author projects, this bar can be met more broadly — but multiple indicators must be present at submission time: a meaningful public commit history over time, tagged releases or a changelog, tests and CI, clear documentation, a CONTRIBUTING file, and stated support or governance expectations. A solo project that is otherwise clearly open and well-maintained will not be rejected solely for lacking a PR workflow. However, a single-author project with none of these signals is not ready.

This repo is single-author on git and on GitHub (`m-murphy` / Maxwell Murphy). Authorship of the paper is a separate map ticket ([JOSS author list](https://github.com/EPPIcenter/sampledb3/issues/81)). JOSS will still score the git history as solo.

| Indicator JOSS lists for solo projects | Here |
| --- | --- |
| Meaningful public commit history over time | yes (see history gate) |
| Tagged releases or a changelog | yes: three GitHub releases; user-facing [Release notes](packages/docs/src/content/docs/guides/troubleshooting/release-notes.md) |
| Tests and CI | tests yes, unit-test CI no (see Tests and CI) |
| Clear documentation | yes (see Documentation) |
| A CONTRIBUTING file | no |
| Stated support or governance expectations | no |

Issues and PRs exist, but they are the author's own tracker, not community traffic. Community engagement beyond authors is a "strong positive signal (not a gate)" ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#pre-review-screening-criteria)). Missing it does not desk-reject by itself. Missing CONTRIBUTING plus missing support expectations plus CI that never runs tests is enough to fail the solo-project indicator list.

Review "Good practices" wants license, docs, QA, releases, and community pathways. Core elements present is "OK"; missing critical elements is "Bad (not acceptable)" ([Review criteria, Good practices](https://joss.readthedocs.io/en/latest/review_criteria.html#good-practices)). License file and community pathways are missing.

**Result: fail.** CONTRIBUTING and a support sentence are implementation after the map (repo hygiene). Whether unit-test CI is required for this gate is already a map ticket: [Unit-test CI as a JOSS gate](https://github.com/EPPIcenter/sampledb3/issues/86). On the current JOSS text, "tests and CI" is in the solo-project indicator list, so that ticket should treat CI as required rather than optional polish.

## Documentation

Review item ([Review criteria, Documentation](https://joss.readthedocs.io/en/latest/review_criteria.html#documentation)): enough documentation for a reviewer to understand core functionality, with a high-level overview in a README. Sub-items: statement of need, installation instructions, example usage, API documentation, community guidelines.

Evidence:

**Statement of need.** `README.md` opening paragraph: specimen inventory and workflow for research and clinical labs, tracking studies, specimens, containers, and storage. `packages/docs/src/content/docs/index.mdx` expands that for operators. Thin next to a JOSS paper "Statement of need", but the README bar is met.

**Installation.** README: Bun `>=1.0.0`, `bun install`, `bun run dev:api` / `dev:web` / `dev`, `docker compose up -d`. `docker-compose.yml` pulls `ghcr.io/eppicenter/sampledb3:1.1.0`. JOSS "Good" is language-native packaging. Bun workspaces plus Docker is the project's actual distribution, not `pip`. Reviewers can run it locally, which the web-app note also requires.

**Example usage.** [Tutorial walkthrough](packages/docs/src/content/docs/guides/getting-started/user-journey.md) (TUT01 study, import, delete). [Initial setup](packages/docs/src/content/docs/guides/getting-started/setup.md). `examples/workshop/`, `examples/derivation-control-dbs-to-dna/`, qPCR plate-scan CSVs.

**API documentation.** `packages/api/src/lib/openapi.ts` is a hand-written OpenAPI 3.0 info object (title, tags, generic Error schema). Comment in that file: full OpenAPI needs `@hono/zod-openapi` and route conversion; `createOpenApiRoute` returns that JSON. `/api/docs` is disabled in production unless `OPENAPI_ENABLED=true` (`packages/api/src/index.ts`). JOSS leaves API-doc depth to reviewer discretion. This is the weak documentation sub-item, not a missing README.

**Operator guide.** Astro Starlight under `packages/docs/src/content/docs/` (37 markdown/mdx pages: getting started, workflows, bulk operations, features, reference data, advanced, troubleshooting). Built into the app at `/docs`. `astro.config.mjs` `site` is `https://sampledb.fly.dev`, `base` `/docs`. GitHub Pages API is 404 (`has_pages: false`). The map wants GitHub Pages as the canonical URL for README, paper, and reviewers. That is [Public GitHub and docs presence](https://github.com/EPPIcenter/sampledb3/issues/84), implementation after the map.

**Result: pass** on the review documentation item except community guidelines (next section) and a stub API schema. GitHub Pages is hygiene after the map, not a JOSS file-format requirement.

## Tests and CI

Review item ([Review criteria, Tests](https://joss.readthedocs.io/en/latest/review_criteria.html#tests)):

- Good: automated test suite hooked up to continuous integration.
- OK: documented manual steps to check expected functionality.
- Bad: no way for the reviewer to objectively assess whether the software works.

Functionality: reviewers are expected to install the software and verify core functionality ([Review criteria, Functionality](https://joss.readthedocs.io/en/latest/review_criteria.html#functionality)). For web tools, local testing on the reviewer's machine is essential ([Submitting, A note on web-based software](https://joss.readthedocs.io/en/latest/submitting.html#a-note-on-web-based-software)).

Evidence:

- Root `package.json` scripts: `test` runs contract + api + web; `test:e2e` Playwright; `ci:verify` is typecheck + build + a docs stale-claim script, not tests.
- Test files at this snapshot: 125 `*.test.ts` under `packages/api`, 152 under `packages/web`, plus contract tests and `packages/e2e/tests/`. `packages/api/src/__tests__/README.md` documents Bun's runner and an in-memory SQLite fixture from `initial_schema.sql`.
- README "Testing" section tells a reviewer how to run the suite.
- `.github/workflows/`: `pr-container.yml` (Docker build + `curl` `/health`), `nightly-container.yml`, `release-container.yml`, `cleanup-container.yml`. None of them invoke `bun test` or `bun run test`. `Dockerfile` runs `bun run build` only.
- `pr-container.yml` comment: "Verifies the Dockerfile still builds… Does not push the image."

So: automated tests exist and a reviewer can run them. That is JOSS "OK". "Good" (suite hooked to CI) is not true. Pre-review solo-project language says "tests and CI" as one indicator. A handling editor who reads that list strictly can desk-reject.

**Result: fail** against the screening "tests and CI" indicator and against review "Good". The suite itself would pass review "OK". Wiring tests into Actions is implementation after the map; whether it is a submission blocker is [Unit-test CI as a JOSS gate](https://github.com/EPPIcenter/sampledb3/issues/86). This note's reading of the primary docs is that it is a blocker for a solo repo.

## Community guidelines

Review documentation sub-item ([Review criteria, Community guidelines](https://joss.readthedocs.io/en/latest/review_criteria.html#community-guidelines)): clear guidelines for third parties to contribute, report issues, and seek support. Solo-project screening also names a CONTRIBUTING file and stated support or governance expectations.

Evidence: no `CONTRIBUTING*`, `CODE_OF_CONDUCT*`, `SECURITY*`, or `SUPPORT*` in the tree. `rg` over markdown for "CONTRIBUTING", "CODE_OF_CONDUCT", or "community guideline" is empty. README has Development, Testing, Deployment, Backup, and a one-word License section. Issues are enabled, which covers "permit individuals to create issues" as a hosting requirement ([Submitting, Submission requirements](https://joss.readthedocs.io/en/latest/submitting.html#submission-requirements)), not the review item for written guidelines.

**Result: fail.** Adding `CONTRIBUTING` (contribute, file issues, how to get help) is implementation after the map. Content can stay short.

## Web-application clause

JOSS ([Submitting, A note on web-based software](https://joss.readthedocs.io/en/latest/submitting.html#a-note-on-web-based-software)):

> Many web-based research tools are out of scope for JOSS due to a lack of modularity and challenges testing and maintaining the code. Web-based tools may be considered ‘in scope’ for JOSS, provided that they meet one or both of the following criteria: 1) they are built around and expose a ‘core library’ through a web-based experience (e.g., R/ Shiny applications) or 2) the web application demonstrates a high-level of rigor with respect to domain modeling and testing (e.g., adopts and implements a design pattern such as MVC using a framework such as Django).
>
> Similar to other categories of submission to JOSS, it’s essential that any web-based tool can be tested easily by reviewers locally (i.e., on their local machine).

SampleDB is a web application: Hono TypeScript API, React SPA, SQLite, docs and UI served from one process (`README.md`, `packages/api/src/index.ts`). It is in the class this note is about.

**Criterion 1.** There is no separately published scientific library that the UI merely wraps. `@sampledb/contract` is a workspace package of wire/write types, not a pip/CRAN-style core library. Criterion 1 is a stretch. Do not hang the submission on it.

**Criterion 2.** Stronger:

- Domain model written down in `CONTEXT.md` (Study → Subject → Specimen, Container → Collection → Location, controls, derivations).
- Nine ADRs under `docs/adr/` (presentation module, wire DTOs, schema evolution, container writes, scan-move, and so on).
- Split: `packages/api` (Hono routes + `lib/` domain), `packages/web` (React), `packages/contract` (shared types). That is MVC-like, not Django.
- Automated tests at API, web, contract, and Playwright layers (see Tests).
- Local run: `bun run dev` or `docker compose up -d`. PR workflow smoke-tests `/health`.

**Local reviewability.** `docker-compose.yml` pins `ghcr.io/eppicenter/sampledb3:1.1.0`. Whether GHCR is pullable without auth is already on the map under Not yet specified. `bun install` from a public clone does not need GHCR.

Editors decide scope. Companion ticket: [JOSS web-application scope](https://github.com/EPPIcenter/sampledb3/issues/78).

**Result: unknown.** Map decision. The honest argument is criterion 2 plus local Docker/Bun, not "we exposed a core library."

## `paper.md`

Submission requirements: the paper (`paper.md` and BibTeX files, plus any figures) must live in a Git-based repository together with the software. A short-lived branch that is never merged is allowed if it is cut from the default branch so it includes the source ([Submitting](https://joss.readthedocs.io/en/latest/submitting.html#submission-requirements)).

Required paper sections ([Paper format](https://joss.readthedocs.io/en/latest/paper.html#what-should-my-paper-contain); [Review criteria, Software paper content](https://joss.readthedocs.io/en/latest/review_criteria.html#software-paper-content)):

- Summary (non-specialist)
- Statement of need
- State of the field (build vs contribute)
- Software design
- Research impact statement
- AI usage disclosure (required even if unused)
- Authors and affiliations, key references, acknowledgements of financial support
- Length 750–1750 words
- No API documentation in the paper

Evidence: no `paper.md` or `paper.bib`. Git history never added them.

The map destination is explicit: this map ends when nothing remains to decide before someone adds LICENSE, `paper.md`, GitHub Pages, and related hygiene. Writing the paper is implementation after the map. Outline and section arguments are map tickets: [JOSS paper outline](https://github.com/EPPIcenter/sampledb3/issues/85), [State of the field for the paper](https://github.com/EPPIcenter/sampledb3/issues/82), [Software design argument](https://github.com/EPPIcenter/sampledb3/issues/83), [JOSS author list](https://github.com/EPPIcenter/sampledb3/issues/81). Map Notes already lock AI disclosure of substantial use with human review of design and correctness, and "do not mention EPPIcenter predecessor systems in the paper."

**Result: fail.** Implementation after the map. Required section list is not a remaining invention; it is in the JOSS paper guide.

## Other submission facts (not named gates, still relevant)

| Requirement | Evidence | Notes |
| --- | --- | --- |
| Hosted where anyone can browse, open issues, propose changes without paid/approved accounts | Public GitHub, `has_issues: true` | Pass ([Submitting, Submission requirements](https://joss.readthedocs.io/en/latest/submitting.html#submission-requirements)) |
| Clone and browse without registration | `https://github.com/EPPIcenter/sampledb3` | Pass |
| Obvious research application | Specimen inventory for research labs | Pass as software-class; impact still unknown |
| Feature-complete, not a minor utility | v1.1.0, operator guide covering registration through qPCR | Looks like a full LIMS-class app, not a thin API client. Editors still judge "minor utility." |
| Submitter is a major contributor | Sole git author is Maxwell Murphy | Pass for that person; full author list is still open |
| Paper must not focus on new research results | N/A until `paper.md` exists | Follow the paper guide |

## Map decisions versus implementation after the map

The map ([Way to a JOSS-submittable SampleDB](https://github.com/EPPIcenter/sampledb3/issues/76)) ends when decisions are locked. It does not include writing LICENSE, `paper.md`, GitHub Pages, or sitting review.

**Already decided on the map, implement later**

- MIT `LICENSE` file. Authority exists. This repo still fails the license gate until the file is added.
- `paper.md` on a branch or on default, with the required JOSS sections. Title form and audience are already in map Notes.
- GitHub Pages as canonical docs URL. Operator `/docs` in the app can stay.
- AI usage disclosure in the paper.

**Still decisions for this map (can desk-reject if left fuzzy)**

- Research impact: which lab besides EPPIcenter, and what may be printed ([Research impact we can claim](https://github.com/EPPIcenter/sampledb3/issues/80)).
- Web-application in-scope argument: use criterion 2, not criterion 1 ([JOSS web-application scope](https://github.com/EPPIcenter/sampledb3/issues/78)).
- Whether the June–August 2026 commit gap needs a sentence in the paper (already on the map).
- Whether GHCR must be public for `docker compose pull` (already on the map; local `bun` path does not need it).
- Unit-test CI: JOSS solo-project text includes "tests and CI". Treat as required unless an editor says otherwise ([Unit-test CI as a JOSS gate](https://github.com/EPPIcenter/sampledb3/issues/86)).
- Author list ([JOSS author list](https://github.com/EPPIcenter/sampledb3/issues/81)), state of the field without predecessor-system history ([State of the field for the paper](https://github.com/EPPIcenter/sampledb3/issues/82), [Specimen-inventory comparators](https://github.com/EPPIcenter/sampledb3/issues/79)), software design section ([Software design argument](https://github.com/EPPIcenter/sampledb3/issues/83)).

**Implementation after the map, not new product decisions**

- `CONTRIBUTING` (and a short support paragraph): how to file issues, how to send a PR, how to ask for help. JOSS requires this in writing.
- Hook `bun run test` (or a documented subset) into GitHub Actions, in addition to the container smoke build.
- Optional: fill OpenAPI from real routes if a reviewer wants API docs. Not a named pre-review gate.
- Zenodo archive and a tagged release at submission time (already out of this map).
