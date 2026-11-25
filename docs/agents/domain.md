# Domain Docs

Read these before naming or changing domain concepts:

- **`CONTEXT.md`** is the domain glossary: entity names, hierarchies, and scope.
- **`docs/adr/`** records design decisions. Read the ADRs that touch the area you're changing.
- **`packages/docs/`** holds the user guide, for user-facing workflow detail.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a test name, a refactor proposal), use the term as `CONTEXT.md` defines it, not a synonym it lists under _Avoid_. If the concept isn't in the glossary, say so rather than inventing a term.

## Flag ADR conflicts

If your change contradicts an ADR, say so explicitly instead of silently overriding it:

> _Contradicts ADR-0006 (unified container inbound write), but worth reopening because…_
