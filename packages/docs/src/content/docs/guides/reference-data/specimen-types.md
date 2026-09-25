---
title: Specimen types
description: Names and allowed container types
---

Open **Reference Data → Specimen Types**. Table columns are **Name**, **Allowed Container Types**, and **Created**. Administrators can toggle allowed container types in the table.

When you register or import a specimen, the type name must match a row here exactly, including capitalization. There is no description field.

## Allowed container types

Each type can allow **Paper (DBS Sheet)**, **Cryovial Tube**, **Micronix Tube**, and **Static Well**. Forms and import reject a container type that is not allowed.

Typical pairings: liquid samples with cryovial tubes; dried blood spots with paper; DNA with micronix or cryovial. Your lab can allow more than one type per specimen type.

## Add or edit

1. Click **Add New**. The **Add Specimen Types** modal asks only for a name.
2. Save. The type is available immediately.
3. Set **Allowed Container Types** in the table, or click **Edit**.

**Edit** shows toggles for the four container types. You can allow several. You cannot remove a type that already has containers for this specimen type. Usage indicators show which associations are in use.

You can rename a type only if it is not in use.

## Delete

You cannot delete a type that has specimens or other references. Change or remove those records first.

If **Add New** reports that the name already exists, use a different name or edit the existing row. If a type does not appear in a dropdown, check spelling and capitalization in this tab.
