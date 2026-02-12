---
title: Initial Setup
description: Complete the initial setup wizard to configure your SampleDB instance
---

When you first access SampleDB, you'll be guided through a setup wizard that configures your system with the essential information needed to start managing samples. This setup process is completed once and ensures your system is properly configured for your laboratory's needs. Think of it as setting up the foundation that everything else will build upon.

The setup wizard walks you through four main steps, each focusing on a different aspect of your laboratory's configuration. You can take your time with each step, and the system will guide you through what's required versus what's optional.

## Step 1: Creating Your Administrator Account

The first step creates your administrator account, which will have full access to all system features. This account is important because it's the one you'll use to manage system-wide settings and make administrative decisions.

You'll need to provide your full name, which helps identify who made changes in the system. Your email address will serve as your login username, so make sure it's an email you'll have ongoing access to. The password must be at least 8 characters long, and you'll need to confirm it by entering it twice to ensure you typed it correctly.

Choose a strong password and keep it secure, as this account will have administrative privileges that allow you to modify system settings and access all features. Once you've entered all the required information and confirmed your password matches, you can proceed to the next step.

## Step 2: Defining Core Data Types

This step configures the fundamental data types your lab will use throughout SampleDB. These definitions become the building blocks for everything else you'll do in the system.

### Specimen Types

Specimen types define what kinds of biological samples you'll be managing. Common examples include Whole Blood, Plasma, Serum, DNA, RNA, and Blood Spot, but you should add all the specimen types your laboratory works with regularly.

For each specimen type, you can specify which container types are allowed. This helps ensure data quality by preventing mistakes—for example, you might allow Whole Blood to be stored in Cryovial Tubes but not in Papers, while Blood Spots would use Papers but not Cryovial Tubes. The available container types include Paper (for dried blood spots), Cryovial Tube (for liquid samples in vials), Micronix Tube (for small volume samples), and Static Well (for fixed-position containers).

Don't worry if you don't add every possible specimen type during setup. You can always add more later through the Reference Data section. However, it's helpful to set up your most common types during initial setup so they're ready when you start entering data.

### Units of Measurement

Units are the measurement units used throughout the system when recording quantities. You'll need units for volumes (like Milliliter or Microliter), masses (like Milligram or Gram), concentrations (like ng/µL or mg/mL), and counts (like pieces or spots).

Each unit requires a full name (like "Milliliter"), a symbol or abbreviation (like "mL"), and a category that groups similar units together (like "volume" or "mass"). This categorization helps the system organize and display units appropriately.

It's worth noting that container status in SampleDB is automatically determined by remaining quantity. Containers with remaining quantity greater than zero are marked as "In Use", while containers with zero remaining quantity are marked as "Exhausted". This automatic tracking helps you see at a glance which containers still have usable material.

Once you've added at least one specimen type and one unit, you can proceed to the next step.

## Step 3: Setting Up Your Lab Infrastructure

This step sets up your physical storage infrastructure, which helps you organize and locate your samples. The storage infrastructure you define here will be used throughout the system to track where collections are stored.

### Storage Types

Storage types represent the types of storage equipment in your lab. Common examples include -80°C Freezer, -20°C Freezer, 4°C Refrigerator, Room Temperature Storage, and Liquid Nitrogen storage. You should add all the storage types your laboratory uses.

For each storage type, provide a clear name and an optional description. The name should be descriptive enough that anyone in your lab would understand what it means. For example, "-80°C Freezer" is clearer than just "Freezer" because it specifies the temperature.

### Root Locations

Root locations are your top-level storage locations in the hierarchy. These might represent buildings, rooms, or major freezers depending on how your lab is organized. For example, you might have "Lab Building A" as a root location, or "Freezer Room 101", or even "Freezer A" if that's your top level.

For each root location, you'll specify a name (like "Lab 101" or "Freezer A"), select a storage type from the ones you've created, and optionally add a description. The storage type helps categorize the location and can be useful for filtering and reporting later.

You can add more locations later through the Locations page or Reference Data, so don't feel you need to create your entire location hierarchy during setup. However, setting up at least one root location during setup helps organize your storage from the start and gives you a place to assign collections when you begin entering data.

Once you've added at least one storage type, you can proceed to the final step.

## Step 4: Adding Biological Data (Optional)

This final step allows you to add biological data that may be relevant to your work, specifically bacterial or viral strains. This step is completely optional—you can skip it entirely and add strains later if needed.

Strains are useful if you work with control batches that contain specific bacterial or viral strains, or if you need to track strain information for your specimens. For each strain, you provide a name (like "E. coli K12" or "Influenza A") and an optional description.

If your work doesn't involve strains, or if you're not sure what strains you'll need, feel free to skip this step. You can always add strains later through the Reference Data section when you need them.

## Completing the Setup

Once you've completed all steps (or skipped the optional biology step), you're ready to finish setup. Click the **Finish Setup** button to initialize your SampleDB instance.

The system will create your administrator account, save all the configuration data you've entered, initialize the database, and then redirect you to the dashboard where you can begin using SampleDB.

It's important to review your information carefully before finishing, because after setup is complete, you cannot run the setup wizard again. While you can modify most settings later through Reference Data, some initial choices (like your administrator account details) are permanent.

## Verifying Your Setup

After setup completes, take a moment to verify everything is working correctly. Try logging in with your admin credentials to make sure the account was created properly. Check that the dashboard loads and displays correctly. Navigate to Reference Data and confirm that your specimen types, units, storage types, and locations are all visible and correct.

If everything looks good, you're ready to start using SampleDB! Consider creating your first study or exploring the dashboard to get familiar with the interface.

## What's Next?

Now that your system is configured, you might want to learn about the [Dashboard Overview](/docs/guides/getting-started/dashboard/) to understand how to navigate the interface, or jump right into [Studies Management](/docs/guides/workflows/studies/) to create your first study. You can also explore [Reference Data](/docs/guides/reference-data/overview/) to learn how to manage the system configuration you just set up.
