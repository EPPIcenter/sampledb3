---
title: Studies Management
description: Create and manage research studies in SampleDB
---

Studies are the top-level organizational unit in SampleDB. Think of a study as a container that brings together all the related work for a research project, clinical trial, or other organized collection of samples. Studies contain subjects, and subjects have specimens, creating a clear hierarchy that helps you organize and track your laboratory work.

Each study represents a distinct piece of research with its own protocol, objectives, and timeline. Whether you're running a multi-year clinical trial or a short pilot study, SampleDB helps you keep everything organized at the study level while still allowing you to drill down into individual subjects and specimens when needed.

## Understanding How Studies Work

A study typically represents a research project with a specific protocol, a clinical trial with defined enrollment criteria, or a collection of samples with a common purpose. The study acts as the organizational container that groups related subjects together and provides context for all the specimens collected.

Each study has several key attributes. The title is a descriptive name that helps you identify the study at a glance—something like "Namibia Malaria Study 2024" or "Phase III Clinical Trial for Treatment X". The short code is a unique identifier (typically 3-6 characters like "NAM15" or "TCC08") that you'll use throughout the system in CSV imports, exports, and searches. The description field lets you add detailed information about the study's protocol, objectives, or other relevant details. The lead person field identifies the primary investigator or study coordinator responsible for the study.

Perhaps most importantly, each study has a longitudinal flag that indicates whether subjects in the study can have specimens collected at multiple timepoints. This setting cannot be changed after study creation, so it's important to think about your study design before creating it.

## Creating Your First Study

You can create a new study from several places in the interface. The Dashboard provides a "Create New Study" button in the Quick Actions section for quick access. The Studies page has a "New Study" button if you're already browsing studies. You can also use the command palette (press Ctrl+K or Cmd+K) and search for "Create New Study" to access it from anywhere.

When you open the study creation form, you'll see several fields to fill out. The title field is required and should be a descriptive name for your study. This is what you'll see in lists and when browsing, so make it clear and meaningful. For example, "Namibia Malaria Study 2024" is much more helpful than just "Study 1".

The short code is also required and serves as a unique identifier for the study. This code will appear in CSV imports and exports, so it needs to be something you can type consistently. Typically 3-6 alphanumeric characters work well, and many labs use all uppercase for consistency. Examples like "NAM15", "TCC08", or "PILOT1" are clear and memorable. The short code must be unique across all studies in your system, so if you try to use one that already exists, the system will let you know.

The description field is optional but can be very helpful for storing protocol details, study objectives, or other information that team members might need to reference. The lead person field is also optional and lets you record the name of the primary investigator or study coordinator.

The longitudinal study checkbox is an important decision point. Check this box if subjects in your study can have specimens collected at multiple timepoints over time. This is common in clinical trials with follow-up visits, cohort studies with repeated sampling, or any research tracking changes over time. If you leave it unchecked, the study is designed for single-timepoint collections, which works well for cross-sectional studies or situations where each subject provides one set of samples.

If you're unsure whether your study is longitudinal, it's generally safer to check the box. Longitudinal studies are more flexible and can accommodate single-timepoint collections, but non-longitudinal studies cannot be changed later if you discover you need multiple timepoints.

Once you've filled in the form, click "Create Study" to save it. You'll be redirected to the study detail page where you can see all the information you just entered and start adding subjects.

## Exploring the Study Detail Page

After creating a study, the study detail page becomes your central hub for everything related to that study. The top of the page uses a **sticky header** that stays visible as you scroll: study identity (title, short code, lead person, and a "Longitudinal" badge when applicable), an optional one-line description with "Show more" for longer text, and a **key metrics bar** showing at a glance the number of subjects, specimens, containers, and average specimens per subject. Primary actions (Create Subject, Export Data) appear here, with "More actions" for Edit study and Merge subjects, and a Delete study option when permitted. No API or workflow changes are required—the same data and actions are available in a more streamlined layout.

Below the header, you'll find study statistics that give you a quick overview of the study's scope. These include the total number of subjects enrolled, total specimens collected, total containers associated with those specimens, the date range of collections (earliest and latest), and a breakdown showing how many of each specimen type have been collected. These statistics update automatically as you add more data, giving you a real-time view of your study's progress.

The page also provides several actions you can take. You can add a new subject directly from the study page, edit the study details (though remember, the longitudinal flag cannot be changed), or browse all subjects in the study.

A table below shows all subjects currently in the study, including each subject's name, how many specimens they have, their first and last collection dates, and links to view their detail pages. This gives you a quick overview of your enrollment and helps you identify subjects who might need follow-up specimens.

## Making Changes to Studies

You can edit most study information after creation, with a few important exceptions. From the study detail page, click "Edit Study" to modify the title, description, or lead person. You can also change the short code, but only if no subjects have been added to the study yet. Once subjects exist, the short code becomes locked to prevent breaking references in your data.

The longitudinal flag cannot be changed after study creation under any circumstances. This is because the system uses this setting to validate data entry and manage specimen collections differently for longitudinal versus non-longitudinal studies. If you realize you set this incorrectly, you'll need to create a new study with the correct setting and potentially migrate your data.

## Understanding Study Short Codes

Study short codes are critical identifiers that appear throughout SampleDB. They're used in CSV imports to associate subjects and specimens with the correct study. They appear in exported data to identify which study each record belongs to. They can be used in searches to quickly find studies. And they're referenced in many other places throughout the system.

Because short codes are so important, it's worth establishing conventions for your laboratory. Many labs use all uppercase letters and numbers, keep them to 3-6 characters, and try to make them memorable and related to the study name. For example, "NAM15" for a Namibia study from 2015, or "TCC08" for a Trial Control Center study numbered 08. Avoid special characters that might cause issues in CSV files or exports, and document your conventions so team members can follow them consistently.

## Longitudinal Versus Non-Longitudinal Studies

The choice between longitudinal and non-longitudinal studies affects how the system handles specimen collections for subjects in that study.

Longitudinal studies are designed for research where subjects can have specimens collected at multiple timepoints. This is common in clinical trials where patients return for follow-up visits, cohort studies that track participants over time, or any research tracking changes or progression. In a longitudinal study, the same subject can have multiple specimens with different collection dates, and the system tracks all of them as part of that subject's record.

Non-longitudinal studies are designed for single-timepoint collections. This works well for cross-sectional studies where you collect one set of samples from each subject, pilot studies with limited collection points, or any research where each subject provides one set of samples. The system still allows multiple specimens per subject (for example, a subject might have both Whole Blood and Plasma collected on the same day), but the expectation is that all collections happen at a single timepoint.

The key difference is flexibility. If you're unsure which type your study should be, choose longitudinal. It's more flexible and can accommodate single-timepoint collections just fine. But if you choose non-longitudinal and later discover you need multiple timepoints, you'll need to create a new study.

## Managing Subjects Within Studies

From the study detail page, you have several options for managing subjects. You can add a new subject manually by clicking "Add Subject" and filling out the form. You can click on any subject in the list to view their detail page and see all their specimens. Or you can use the bulk import feature to add multiple subjects at once, which is much more efficient when you have many subjects to add.

The study detail page shows you at a glance how many subjects are enrolled and how many specimens have been collected, helping you track your study's progress. As you add more data, these statistics update automatically, giving you real-time insights into your study's scope.

## Using Study Statistics

The statistics displayed on the study detail page provide valuable insights into your study's progress and composition. The total subjects count shows how many participants or sample sources you've enrolled. The total specimens count shows how many biological samples have been collected. The total containers count shows how many physical storage units are associated with those specimens.

The collection date range shows you the earliest and latest dates when specimens were collected, helping you understand the timeline of your study. The specimen type breakdown shows how many of each type have been collected, which can help you identify if you're missing certain types or if collection is proceeding as planned.

These statistics help you understand the scope and progress of your study at a glance, making it easy to report on study status or identify areas that need attention.

## Finding and Organizing Studies

From the Studies page, you can search and filter to find specific studies quickly. The search function looks through study titles, short codes, and lead person names, so you can find studies by any of these attributes. You can also filter studies by various criteria and sort them by creation date, title, or other attributes to organize your view.

This becomes especially helpful as your laboratory accumulates more studies over time. Being able to quickly find the study you need saves time and helps maintain organization as your SampleDB instance grows.

## What's Next?

Now that you understand how studies work, you might want to learn about [Subjects & Specimens](/guides/workflows/subjects-specimens/) to start adding data to your study. If you have many subjects to add, consider using [Bulk Import](/guides/bulk-operations/import/) to add them efficiently. And when you're ready to export data, the [Bulk Export](/guides/bulk-operations/export/) guide shows you how to generate reports for your studies.
