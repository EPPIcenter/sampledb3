# Coding standards

## Domain vocabulary

- Name a domain concept with the term `CONTEXT.md` defines for it, in code, test names, issue titles, and refactor proposals. Terms the glossary lists under _Avoid_ are synonyms to replace with the defined term.
- When a concept has no glossary entry, say so in the issue, PR, or proposal before introducing a term for it.

## ADRs

- A change that contradicts an ADR in `docs/adr/` names the ADR and gives the reason to reopen it, in the PR or proposal. For example: _Contradicts ADR-0006 (unified container inbound write), but worth reopening because…_
