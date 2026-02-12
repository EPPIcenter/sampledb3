---
title: Generating a Demo Database
description: Seed a database with sample data demonstrating all SampleDB capabilities
---

The demo seed script populates a database with studies, subjects, specimens, controls, and reference data so you can explore SampleDB without entering data manually.

## Prerequisites

- A **fresh, empty** database. The script refuses to run if users already exist.
- For local use: no existing `sampledb_demo.sqlite` (or use a different path).

## Local (bun)

```bash
bun run demo:seed
```

This creates `./sampledb_demo.sqlite` with demo data. To use a different path:

```bash
DATABASE_PATH=./my-demo.sqlite bun run demo:seed
```

**Admin login:** `admin` / `DemoAdmin1!`

## Docker

```bash
docker compose build
docker compose run --rm demo-seed
```

This seeds the main database file at `/data/sampledb.sqlite` (the default volume). Then start the app:

```bash
docker compose up -d
```

To seed a different file:

```bash
DATABASE_PATH=/data/sampledb_demo.sqlite docker compose run --rm demo-seed
```

## fly.io

After deploying (`fly deploy`), run the seed on the app machine:

```bash
fly ssh console -C "bun /app/packages/api/dist/lib/demo-seed.js"
```

The app must be running. Refresh the browser to see the demo data.

## What the demo includes

- **Users:** Admin user (login: `admin` / `DemoAdmin1!`)
- **Study:** DEMO01 with 5 subjects
- **Specimens:** DNA (DBS) in Micronix tubes on plate DEMO-PLATE-001
- **Controls:** Negative and plasma-positive control batches (Plasma in Micronix tubes on plates), plus blood control batch (Whole Blood in cryovial tubes in CTRL-BOX-BLOOD) with strains W2/U659 at 50/50 and 10k p/uL, plus derived DBS and DNA (DBS)
- **Locations:** Freezer hierarchy with shelf that can hold collections
- **Reference data:** Specimen types, units, storage types, export and scanner defaults
