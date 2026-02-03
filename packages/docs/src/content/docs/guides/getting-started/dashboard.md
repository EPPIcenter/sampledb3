---
title: Dashboard Overview
description: Understand the SampleDB dashboard and its key features
---

The dashboard is your home page in SampleDB, providing an overview of your system's activity, key metrics, and quick access to common tasks. When you log in, this is where you'll land, and it's designed to give you a quick sense of what's happening in your laboratory while providing easy access to the things you do most often.

Think of the dashboard as your command center. It shows you at a glance how many studies you're managing, how many specimens are in the system, and how your inventory is organized. It also provides shortcuts to common tasks so you don't have to navigate through multiple pages to get things done.

## Understanding the Dashboard Layout

The dashboard uses a "modern precision lab" theme with a workflow-first layout. At the top you'll see a **Lab Overview** title and the subtitle *Find samples, track activity, run workflows*. Below that is a **prominent search bar** where you can search by barcode, study code, subject name, or ID; a "Data as of" timestamp shows when the dashboard data was last loaded. Next, **primary actions** let you jump straight into common tasks: Register New Specimen, Create New Study, Bulk Import, and **Browse Storage** (view locations and collections). A **qPCR Experiments** section shows your recent qPCR experiments and a link to create a new one. **Key metrics** are grouped into Inventory (Specimens, Containers), Studies (Studies, Subjects), and Storage (Locations). Further down you'll see Recent Studies and Recent Activity side by side, then System Insights (charts), and optionally a Blood Controls summary. Each section uses consistent card styling and a teal accent for links and highlights.

### Hero Search Bar

The search bar at the top of the dashboard is the fastest way to find a specific sample, study, subject, or container. Type a barcode, study short code, subject name, or ID and press Enter or click Search. A search results panel opens so you can pick the matching item and jump to its detail page. You can also open search from anywhere using the command palette (Ctrl+K or Cmd+K).

### Primary Actions

The primary actions provide fast access to the tasks you perform most frequently. "Register New Specimen" opens the specimen registration form. "Create New Study" takes you to the study creation form. "Bulk Import" opens the import page where you can upload CSV files to import subjects, specimens, or both. **Browse Storage** takes you to the locations page so you can view your storage hierarchy and collections. If you have view-only access, you'll see Browse Storage and an explanation that create actions require member or admin access.

### qPCR Experiments (Next Steps)

If your lab uses qPCR experiments, the dashboard shows your five most recent experiments with their status (Setup, Template ready, or Results imported). Click an experiment to open it, or use "New qPCR experiment" to create one. If you don't have any qPCR experiments yet, the section shows an empty state with a link to create your first one.

### Key Metrics (Grouped)

Metrics are grouped to match how you think about your lab: **Inventory** (Specimens, Containers), **Studies** (Studies, Subjects), and **Storage** (Locations). Each metric card shows a count; some show trend indicators comparing the current count to 30 days ago. Each card is clickable and takes you to the relevant section (e.g. Specimens, Studies, or Locations).

### Recent Studies Overview

The Recent Studies section displays your most recently created or updated studies, showing you at a glance what's been happening lately. For each study, you'll see the title and short code, the lead person, how many subjects and specimens are in the study, and when it was last updated. This helps you stay aware of which studies are active and which might need attention.

Clicking on any study in this list takes you directly to its detail page, where you can see full information, add subjects, or review statistics. This section is particularly helpful when you're managing multiple studies and want to quickly return to work you were doing recently.

### Staying Informed with the Activity Feed

The activity feed shows recent system activity, giving you a timeline of what's been happening in SampleDB. You'll see when new specimens were registered, when studies were created or updated, when containers were added, when subjects were created, when control batches were created, and when locations changed. Each activity item shows what happened, when it happened, and provides context about the change.

This feed helps you stay aware of recent changes in the system, which is especially useful in team environments where multiple people might be working with the same data. You can quickly see if someone added specimens to a study you're working on, or if new collections were created that you should know about.

### System Insights and Statistics

The System Insights section provides information about storage utilization, specimen type distribution, container type usage, and other system-wide statistics. These insights help you understand how your samples are distributed across different types and locations, which can inform decisions about storage capacity, workflow optimization, and resource planning.

For example, you might see that most of your specimens are Whole Blood stored in Cryovial Tubes, which could help you plan freezer capacity. Or you might notice that certain specimen types are more common than others, which could inform your procurement decisions.

### Blood Controls Summary

If your system has blood control definitions or batches, a summary section will appear on the dashboard showing the total number of control definitions, total batches, and inventory counts. This gives you a quick view of your quality control sample inventory without having to navigate to the Blood Controls section.

## Making the Most of the Dashboard

Use the hero search bar whenever you need to find a specific item by barcode, study code, subject name, or ID. Use the primary actions to register a specimen, create a study, run a bulk import, or browse storage. If you use qPCR experiments, check the qPCR Experiments section to see recent runs and their status. The "Data as of" timestamp tells you when the dashboard numbers were last refreshed.

The dashboard updates when you load or refresh the page. For the most current counts, refresh the page; the "Data as of" line shows the time of the last load.

## Navigating the System

The sidebar provides access to all major sections of SampleDB. From the Dashboard, you can navigate to Studies to browse and manage your research projects, to Specimens to view all specimens in the system, or to Locations to manage your storage hierarchy. The Blood Controls section lets you manage control definitions and batches. Import and Export give you access to bulk operations. Container Movement helps you reorganize containers. Derivations tracks sample processing. Reference Data lets you manage system configuration. And Settings provides access to application preferences.

This navigation structure is consistent throughout the system, so once you learn where things are, you can move efficiently between different sections as you work.

## Understanding What the Metrics Mean

Each metric on the dashboard represents an important aspect of your laboratory's data. The Studies count shows how many distinct research projects or clinical trials you're managing. This number helps you understand the scope of work in your system.

The Specimens count represents the total number of biological samples registered in the system. This includes specimens from study subjects as well as specimens from control batches, giving you a complete picture of your sample inventory.

The Subjects count shows how many individual participants or sample sources are enrolled across all studies. Since each subject can have multiple specimens, this number helps you understand your enrollment while the specimens count shows your actual sample inventory.

The Containers count represents the physical storage units—tubes, papers, and other containers—that hold your specimens. This number helps you understand your physical inventory and storage needs.

The Locations count shows how many storage locations are in your hierarchy. This helps you understand the complexity of your storage infrastructure and how samples are distributed across different physical locations.

## Tips for Effective Dashboard Use

The dashboard is most useful when you make it a regular part of your workflow. Pay attention to the trend indicators on metrics to track how your system is growing over time. Use the quick actions frequently to save time on common tasks. Check the activity feed regularly to stay informed about changes in the system. And explore the system insights to understand patterns in your data that might inform your work.

The dashboard updates in real-time as data is added to the system, so you can always trust that you're seeing current information. This makes it a reliable source of truth for understanding what's happening in your laboratory at any given moment.

## What's Next?

Now that you understand the dashboard, you might want to learn about [Studies Management](/guides/workflows/studies/) to create and manage research studies, explore [Subjects & Specimens](/guides/workflows/subjects-specimens/) to start registering individual samples, or dive into [Bulk Import](/guides/bulk-operations/import/) to learn how to import data efficiently using CSV files.
