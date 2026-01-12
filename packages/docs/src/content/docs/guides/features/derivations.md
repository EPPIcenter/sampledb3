---
title: Derivations
description: Track sample processing and transformations
---

Derivations track relationships between containers when materials are processed, extracted, diluted, or otherwise transformed. In laboratory work, samples often go through multiple processing steps—whole blood might be processed to extract DNA, DNA might be diluted for assays, or samples might be aliquoted for distribution. Derivations help you maintain a complete chain of custody and processing history, showing exactly how each sample was created and what processing it has undergone.

This tracking is valuable for several reasons. It provides a complete audit trail showing where samples came from and what was done to them. It helps you understand processing history when analyzing results. It enables quality control by tracking protocols and processing dates. And it maintains relationships that are important for regulatory compliance and scientific reproducibility.

## Understanding How Derivations Work

A derivation represents a processing step that creates a new sample from an existing one. Think of it as a transformation: you start with a parent container (the source material), perform some processing (like DNA extraction or dilution), and create a derived container (the result). The derivation record links these containers together and documents what processing was done.

The system supports several derivation types that cover common laboratory workflows. DNA Extraction represents extracting DNA from a source sample, which is common in molecular biology work. Dilution represents diluting a sample to a different concentration, which is frequently needed for assay preparation. Aliquot represents creating smaller portions from a larger sample, useful for sample distribution. And Other allows you to document any other type of processing or transformation that doesn't fit the standard categories.

## Derivation Chains and Relationships

Derivations create chains that show the complete processing history of samples. For example, you might start with a whole blood sample in Container A. That gets processed through DNA extraction, creating Container B with extracted DNA. That DNA might then be diluted, creating Container C. The derivation chain shows this complete history: Container A → DNA Extraction → Container B → Dilution → Container C.

This chain structure is powerful because it shows not just immediate parent-child relationships, but the complete ancestry and descendants of any container. You can see all the processing steps that led to a particular sample, and you can see all the samples that were created from a particular source. This complete picture is essential for understanding sample history and maintaining proper chain of custody.

## Creating Individual Derivations

When you need to create a derivation for a single container, the process starts from that container's detail page. Navigate to the container you want to derive from, and you'll see a Derivations section that shows any existing derivations involving this container.

Click "Create Derivation" or "Derive From This Container" to open the derivation form. The first thing you'll specify is the derivation type—what kind of processing you're performing. Select from DNA Extraction, Dilution, Aliquot, or Other depending on your workflow.

Next, you'll specify what the derived sample will be. The derived specimen type tells the system what kind of specimen the result is—if you're extracting DNA, you'd select "DNA" as the specimen type. The container type specifies what kind of container will hold the derived sample—Micronix Tube, Cryovial Tube, or Paper depending on your storage method.

You'll need to specify which collection the new container will belong to. You can select an existing collection or create a new one on the spot. Then provide the container-specific details: for Micronix tubes, you'll need a barcode and position; for Cryovial tubes, you'll need a position (barcode is optional); for Papers, you'll need a label.

The derivation details section lets you document the processing. The derivation date records when the processing actually occurred, which is important for tracking and quality control. The protocol field lets you record what protocol or method was used, which is valuable for reproducibility and troubleshooting. The notes field allows you to add any additional information that might be relevant.

Quantity management is an important consideration. When you create a derivation, you can choose whether to reduce the parent container's remaining quantity. This is useful when processing consumes material—for example, if you extract 50µL from a parent container that had 100µL remaining, you might want the parent to show 50µL remaining after the extraction. The system handles this automatically if you enable quantity reduction.

You'll also specify quantities for the derived container: the total quantity (how much material is in the new container) and the remaining quantity (which starts equal to the total but decreases as the derived material is used).

Once you've filled in all the information, click "Create Derivation" and the system will create the derived specimen, create the new container, link them with a derivation record, and optionally adjust the parent container's quantity. Everything is linked together correctly, maintaining the complete processing history.

## Viewing Derivation Information

From any container's detail page, you can see derivation information that shows how that container fits into processing chains. If the container was derived from another container, you'll see source derivation information showing the parent container, what type of derivation was performed, when it occurred, and what protocol was used.

If the container has been used to create other containers, you'll see a list of derived containers showing all the samples that were created from this one. For each derived container, you'll see the derivation type, date, and protocol, giving you a complete picture of what processing has been done.

Some containers show a complete derivation chain view that displays the entire processing history. This shows all ancestor containers (everything this sample came from, going back to the original source), all descendant containers (everything that was created from this sample), and the current container in the middle. This comprehensive view helps you understand the complete processing history at a glance.

## Bulk Derivation Import

When you're processing many samples at once—perhaps extracting DNA from an entire batch of samples—creating derivations individually would be tedious. The bulk derivation import feature lets you process many derivations at once using a CSV file.

The import process starts with configuring your settings, which tell the system how to interpret your CSV file. You'll specify the source type: are you deriving from control batch specimens or study subject specimens? This determines how the system will identify parent containers in your CSV.

You'll also specify the parent container type: are your source containers papers, cryovial tubes, or micronix tubes? This determines what columns your CSV needs and how the system will find the parent containers.

The derivation settings configure what the derived samples will be. You'll specify the derivation type (DNA Extraction, Dilution, etc.), what specimen type the derived samples will be, what container type they'll use, what protocol was used, and when the derivation occurred. You can also configure whether to reduce parent quantities and set validation options.

Once your settings are configured, you can download a template CSV file that's customized for your specific scenario. The template includes the correct column headers and shows example data, making it easy to prepare your CSV correctly. The columns you need depend on your source type and parent container type—deriving from control batch papers requires different columns than deriving from study subject cryovial tubes.

After you've prepared your CSV file, upload it to the system. The system validates the CSV, checking that parent containers exist, that they match your source type, that positions are in the correct format, that barcodes are unique, and that quantities are valid if you're reducing parent quantities.

You can run a dry run first, which validates everything and shows you what would be created without actually creating any data. This is useful for testing your CSV format and catching problems before you commit to the import. Once you're satisfied, you can run the actual import, which creates all the derivations, containers, and specimens in one operation.

## Managing Quantities Through Processing

Quantity management in derivations helps you track how much material is available at each step of processing. When you create a derivation, you can choose whether processing consumes material from the parent container. If you extract DNA from a whole blood sample, that processing might consume some of the blood, so you'd want the parent container's remaining quantity to decrease.

The system handles this automatically if you enable quantity reduction. When you specify how much material is in the derived container, the system can reduce the parent's remaining quantity by that amount (or by a different amount if you specify). This helps you track remaining usable material accurately.

Derived containers have their own quantities that track how much material is available. The total quantity represents how much was initially created, and the remaining quantity decreases as material is used. This gives you a complete picture of material availability through the entire processing chain.

## Editing and Managing Derivations

Some derivation details can be edited after creation, which is useful for correcting information or adding details. You can typically edit the derivation date (to correct when processing actually occurred), the protocol (to update protocol information), and notes (to add or modify additional information). Some systems also support custom properties that can be edited.

However, you typically cannot change the parent or derived containers after creation, as this would break the chain of custody. If you need to correct container associations, you may need to contact your administrator, as these changes require careful handling to maintain data integrity.

## Deleting Derivations

Derivations can be deleted if needed, though this should be done carefully. When you delete a derivation, the system removes the relationship record but doesn't delete the containers themselves. This means the parent and derived containers remain, but the link between them is removed.

Deleting derivations can affect chain of custody tracking, so it's generally better to correct information through editing rather than deletion. However, if a derivation was created in error, deletion may be the appropriate solution.

## Best Practices for Derivation Tracking

Effective derivation tracking starts with complete documentation. Always record the protocol used, as this is essential for reproducibility and quality control. Include accurate derivation dates, as these help you understand processing timelines. Add notes when relevant, especially for unusual processing steps or special considerations.

For chain of custody, create derivations for all processing steps. Don't skip steps just because they seem minor—complete chains are more valuable than partial ones. Verify parent containers are correct before creating derivations, as incorrect parent associations can create confusing chains.

When doing bulk processing, use the dry run feature to test your CSV format before importing. This catches problems early and saves time. Verify imported derivations after bulk import to ensure everything was created correctly, and review derivation chains to confirm they make sense.

## Troubleshooting Derivation Issues

If the system can't find a parent container, verify that the parent container identifier in your CSV is correct. Check that the parent container exists in the system, ensure the source type matches (control vs. subject), and verify that the parent container type matches your settings. Typos in identifiers are a common cause of "parent not found" errors.

Invalid position format errors usually mean positions don't match the required format. For micronix and static wells, use the "A01" format with two-digit columns. Check for typos, and verify positions match the collection layout.

Quantity errors can occur if you're trying to reduce parent quantity but the parent doesn't have enough remaining quantity. Check that parent containers have sufficient material, verify quantity values are valid numbers, and ensure the "Reduce Parent Quantity" setting is configured correctly.

## What's Next?

Now that you understand derivations, you might want to learn about [Container Management](/guides/workflows/containers/) to understand containers better, explore [Bulk Import](/guides/bulk-operations/import/) for other bulk operations, or check out [Blood Controls](/guides/features/blood-controls/) to see how controls can be used as derivation sources.
