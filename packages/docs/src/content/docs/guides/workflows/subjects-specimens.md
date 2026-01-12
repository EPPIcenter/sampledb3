---
title: Subjects & Specimens
description: Create subjects and register individual specimens
---

Subjects are the participants or sample sources within a study, and specimens are the actual biological samples collected from those subjects. This guide covers how to create subjects and register specimens individually, which is useful when you're adding a few items at a time or when you need to enter data that doesn't fit neatly into a bulk import workflow.

Understanding the relationship between subjects and specimens is key to using SampleDB effectively. A subject represents the source—whether that's a patient in a clinical trial, an animal in a research study, or any other sample source. Each subject can have multiple specimens collected over time, especially in longitudinal studies where you track samples across multiple collection dates.

## Understanding Subjects and Specimens

### What is a Subject?

A subject represents a study participant, an individual sample source, or a unique identifier within a study. In a clinical trial, each subject might be a patient. In a research study, subjects might be animals, cell lines, or other sources. The key is that each subject has a unique name within their study, and that subject can have multiple specimens associated with them.

Each subject has a name that serves as a unique identifier within the study. This name might be something like "SUBJ-001" or "P001" depending on your lab's naming conventions. The subject is associated with a specific study, and that association determines which study's data the subject belongs to. Over time, as you collect samples, the subject accumulates specimens that represent the biological materials collected from or associated with that subject.

### What is a Specimen?

A specimen represents an actual biological sample—the blood, plasma, DNA, or other material you're managing. Each specimen represents a specific collection event, so if you collect Whole Blood from a subject on Monday and Plasma from the same subject on Friday, those are two separate specimens even though they came from the same subject.

Each specimen has a specimen type that defines what kind of sample it is, like Whole Blood, Plasma, Serum, or DNA. It has a collection date that records when the sample was actually collected. It has a source that identifies where it came from—typically a subject, but it could also come from a control batch, reagent, cell line, plasmid, or standard. And optionally, it can be associated with a physical container for storage tracking.

The relationship between subjects and specimens is one-to-many: one subject can have many specimens, but each specimen belongs to one subject (or other source). This structure allows you to track all the samples collected from a single subject over time, which is especially valuable in longitudinal studies.

## Creating a Subject

You can create a subject from a couple of different places in the interface, depending on where you are and what workflow makes sense for your situation.

### Creating from the Study Detail Page

If you're already working with a specific study, the most natural place to add a subject is from that study's detail page. Navigate to the study you want to add a subject to, and you'll see an "Add Subject" or "Create New Subject" button. Click that button, and you'll see a simple form asking for the subject name.

Enter the subject name following your lab's naming conventions. The name must be unique within the study, so if you try to use a name that already exists, the system will let you know. Once you've entered the name, click "Create" and the subject will be added to the study immediately.

### Creating from the Subjects Page

If you prefer to work from a central subjects page, or if you're not sure which study you want to add the subject to, you can navigate to the Subjects section (if it's available in your navigation). From there, click "New Subject" and you'll see a form that asks you to select the study first, then enter the subject name.

This approach is useful when you're adding subjects to multiple studies or when you want to see all subjects in one place before deciding where to add a new one.

## Registering a Specimen

Registering specimens is one of the most common tasks you'll perform in SampleDB. The system provides several ways to access the specimen registration form, making it easy to add specimens from wherever you happen to be working.

### Finding the Registration Form

You can register a specimen from several places. The Dashboard provides a "Register New Specimen" button in the Quick Actions section, which is perfect when you're starting fresh and want to quickly add a specimen. If you're already viewing a subject's detail page, you'll see an "Add Specimen" button that's contextually aware of which subject you're working with. The Specimens page has a "New Specimen" button if you're browsing specimens. And you can always use the command palette (press Ctrl+K or Cmd+K) and search for "Create New Specimen" to access it from anywhere in the system.

### Filling Out the Specimen Form

The specimen registration form asks for several pieces of information, some required and some optional. The first thing you'll need to specify is the source type, which determines where the specimen came from. The most common choice is "Subject", which means the specimen came from a study subject. But you can also choose "Control" for specimens from control batches, "Reagent" for reagent samples, "Cell Line" for cell line samples, "Plasmid" for plasmid samples, or "Standard" for standard reference samples.

If you selected "Subject" as the source type, you'll need to specify which study the subject belongs to. You can either select the study from a dropdown or enter the study short code directly if you know it. Then you'll need to specify which subject the specimen came from. You can select an existing subject from a dropdown, or if the subject doesn't exist yet, you can enter the subject name and check the "Create new subject" box to create the subject automatically when you create the specimen.

Next, you'll need to specify the specimen type, which defines what kind of biological sample this is. You can select from available specimen types in a dropdown, or if you know the exact name, you can type it in. The specimen type must exist in your Reference Data, so if you're typing it in, make sure the spelling and capitalization match exactly.

The collection date is optional but highly recommended. This records when the specimen was actually collected, which is important for tracking, reporting, and understanding the timeline of your study. The date should be in YYYY-MM-DD format (like 2024-01-15). If you don't specify a collection date, the system will default to today's date, which is fine for same-day entries but should be corrected if the specimen was collected earlier.

### Creating Containers for Specimens

When registering a specimen, you have the option to create a container for it immediately. This is useful when you're entering data for specimens that are already physically stored, as it creates the complete record in one step.

If you choose to create a container, you'll need to select the container type. The options depend on what container types are allowed for the specimen type you selected. Micronix Tubes are small tubes typically stored in plates and require a collection name (the plate name), a barcode (which must be unique), and a position in the plate (like "A01" or "B12"). Cryovial Tubes are standard vials stored in boxes and require a collection name and position, with an optional barcode. Papers represent dried blood spot sheets and require a collection name and a label identifier. Static Wells are fixed-position containers in plates and require a collection name and position.

For the collection, you can either select an existing collection (plate, box, or bag) from a dropdown, or you can create a new collection on the spot. If you're creating a new collection, you'll need to specify where it's stored by selecting a location.

The container details vary by type. For Micronix tubes, you'll need to provide a unique barcode and a position. For Cryovial tubes, you'll need a position and can optionally provide a barcode. For Papers, you'll need a label identifier. For Static Wells, you'll need a position. The position format is important—for Micronix and Static Wells, use the format "A01" (letter followed by two digits), while Cryovial positions depend on your box layout.

Once you've filled in all the required information, click "Create Specimen" to save everything. The system will create the specimen, create the subject if needed, create the container if you specified one, and link everything together correctly.

## Viewing and Managing Subject Details

When you navigate to a subject's detail page, you'll see a comprehensive view of everything related to that subject. At the top, you'll see the basic subject information: the name, which study they belong to, and when the subject was created in the system.

Below that, you'll see a table showing all specimens that have been collected from this subject. The table shows the specimen type, collection date, container information if applicable, and provides links to view the full details of each specimen or container. This gives you a complete picture of what samples you have from this subject and when they were collected.

The page also shows subject statistics that summarize the data. You'll see the total number of specimens, the date range of collections (earliest and latest dates), and a breakdown showing how many of each specimen type have been collected. These statistics help you understand the subject's sample history at a glance.

From the subject detail page, you can take several actions. You can add another specimen by clicking "Add Specimen", which opens the registration form with the subject already selected. You can edit the subject name if needed, though you should be careful with this as subject names may be referenced in exports and other operations.

## Viewing Specimen Details

When you navigate to a specimen's detail page, you'll see all the information about that specific sample. The specimen information section shows the specimen type, collection date, source (whether it came from a subject or control batch), and the associated study if it came from a subject.

If the specimen has a container associated with it, you'll see container information including the container type, barcode if applicable, position or label, which collection it belongs to, where that collection is stored (the location), and the container's status (whether it's "In Use" or "Exhausted" based on remaining quantity).

If the specimen was derived from another container through processing, you'll see derivation information showing the parent container, what type of derivation was performed (like DNA extraction or dilution), when the derivation occurred, and what protocol was used. This helps you track the complete processing history of your samples.

## Making Changes to Subjects and Specimens

You can edit a subject's name after creation, which is useful if you discover a typo or need to update the identifier. Navigate to the subject detail page and click "Edit Subject" to modify the name. However, you should be careful with this, as subject names may be referenced in exports and other operations, so changing them could affect downstream processes.

Most specimen details cannot be edited after creation, which helps maintain data integrity. The collection date may be editable in some cases if you discover an error, but other details like specimen type and source are typically locked. If you need to make significant changes to specimen information, you should contact your administrator, as some corrections may require special handling.

## Best Practices for Data Entry

When creating subjects, use consistent naming conventions throughout your study. This makes it easier to find subjects later and ensures your data is organized. Document your naming scheme so team members can follow it, and avoid special characters that might cause issues in CSV exports or other operations.

For collection dates, always record them when available. They're important for tracking, reporting, and understanding the timeline of your study. Use consistent date formats (YYYY-MM-DD) throughout your data entry to avoid confusion.

When creating containers, do so when specimens are physically stored. This ensures your records match reality. Use consistent barcode formats if you're using barcodes, and make sure positions follow the correct format for your container type. Double-check positions before saving, as incorrect positions can make it difficult to locate samples later.

## When to Use Bulk Operations

While individual entry is perfect for adding a few items or handling special cases, if you have many subjects and specimens to add, consider using the bulk import feature instead. Bulk import allows you to upload a CSV file with all your data and process everything at once, which is much more efficient than creating items individually. The bulk import guide covers this process in detail and includes templates to help you format your data correctly.

## What's Next?

Now that you understand how to create subjects and register specimens individually, you might want to learn about [Container Management](/guides/workflows/containers/) to understand how to organize specimens in containers, explore [Bulk Import](/guides/bulk-operations/import/) to learn how to add multiple subjects and specimens efficiently, or return to [Studies Management](/guides/workflows/studies/) to continue organizing your research projects.
