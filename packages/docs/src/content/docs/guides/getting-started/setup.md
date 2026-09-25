---
title: Initial setup
description: Complete the setup wizard to create the admin account and starting reference data
---

The first time you open SampleDB, the setup wizard runs. It has four steps. You cannot run it again after you finish. Add or change specimen types, units, storage types, and strains later in **Reference Data**. Manage locations on **Browse Data → Locations**.

The wizard starts with preset specimen types, units, and storage types. Edit or remove those rows, or add your own, before you continue.

## Step 1 of 4: Admin Account

The heading on this step is **Create Administrator**.

1. Enter **Full Name**, **Email Address**, **Password**, and **Confirm Password**.
2. Use a password of at least 8 characters. The two password fields must match.
3. Click **Next**.

Email Address is the username you use to sign in.

## Step 2 of 4: Core Definitions

### Specimen Types

The list starts with Whole Blood, Plasma, Serum, Saliva, DBS, DNA (DBS), and DNA (WB). For each type you can allow **Paper (DBS Sheet)**, **Cryovial Tube**, **Micronix Tube**, and **Static Well**.

You need at least one specimen type to continue.

### Units

The list starts with volume, mass, count, and concentration units such as Milliliter (`mL`) and Microliter (`µL`). Each row has **Name**, **Symbol**, and **Category**.

You need at least one unit to continue.

Container status is derived from remaining quantity. Greater than zero is **In Use**. Zero is **Exhausted**. The wizard shows this note on the step.

Click **Next**.

## Step 3 of 4: Lab Infrastructure

### Storage Types

The list starts with **Freezer -80°C**, **Freezer -20°C**, **Liquid Nitrogen**, **Refrigerator 4°C**, and **Room Temperature**. You need at least one storage type to continue.

### Root Locations

Root locations are optional. If the list is empty, the wizard shows "No locations defined. You can add them later." To add one, enter **Name**, choose a **Type**, and click **Add**. You can build the rest of the hierarchy later on **Locations**.

Click **Next**.

## Step 4 of 4: Biology (Optional)

Add **Strains** if you track parasite strains on control batches. You can skip this step and add strains later in **Reference Data**.

Click **Finish Setup**. While the request runs, the button reads **Initializing...**

## After you finish

SampleDB does not open the dashboard yet. It sends you to **Sign in to SampleDB** with the message "Setup complete! Please sign in with your admin credentials."

Sign in with the email and password from step 1. Then open **Reference Data** and **Locations** to confirm what you saved.

Manage later users from **Admin** → **User Management**. See [User registration](/docs/guides/getting-started/user-registration/). After you sign in, see the [Dashboard](/docs/guides/getting-started/dashboard/) and the [tutorial walkthrough](/docs/guides/getting-started/user-journey/).
