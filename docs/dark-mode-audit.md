# Dark Mode Audit – Hardcoded Colors

Components and pages that still use Tailwind gray/white/blue/red instead of app design tokens (`--app-*`). Fix by replacing with `text-app-text`, `text-app-text-muted`, `bg-app-card`, `bg-app-surface`, `border-app-border`, `text-app-accent`, `text-app-trend-up`, `text-app-trend-down`, etc.

## Fixed (this audit pass)
- **App.tsx** – root `bg-gray-50` → `bg-app-bg`
- **StatCard.tsx** – card, titles, trend colors → app tokens
- **Pagination.tsx** – borders, text, buttons → app tokens
- **ContainerTypeToggle.tsx** – selected/unselected → app-accent / app-surface
- **Toast.tsx** – semantic borders and close button → app tokens
- **ContentCard.tsx** – card, badge fallback, text, icons → app tokens
- **ReferenceDataForm.tsx** – modal, error box, labels, buttons, disabled inputs → app tokens
- **ExportModalResultSummary.tsx** – panel, sections, success/warning/error → app tokens
- **CollectionTreePicker.tsx** – borders, text, hover, buttons, search input → app tokens
- **LocationHierarchyTree.tsx** – current/hover, text, borders → app tokens

---

## Root / layout (done)
- **App.tsx** – done

## Shared components (high impact) – remaining
- **ErrorBoundary.tsx** – error UI colors
- **HotkeyHelpModal.tsx** – kbd and text (gray)
- **SearchModal.tsx** – modal panel and list items
- **InfoTooltip.tsx** – tooltip background/text
- **PaginationSettingsForm.tsx** – form labels/inputs

## Pickers / trees (partially done)
- **CollectionTreePicker.tsx** – done
- **LocationHierarchyTree.tsx** – done
- **LocationTreePicker.tsx**, **LocationPicker.tsx**, **StudyPicker.tsx** – similar patterns
- **CollectionMoveTreePicker.tsx** – gray/blue
- **CryovialBoxPicker.tsx**, **MicronixPlatePicker.tsx** – gray/white

## Export flow
- **Export.tsx** – extensive gray/red/blue (labels, borders, error boxes, summary)
- **ExportModal.tsx** – gray skeletons, borders, text
- **ExportModalResultSummary.tsx** – done
- **ExportConfigurationsManager.tsx** – gray

## Reference data
- **ReferenceDataForm.tsx** – done
- **ReferenceDataTable.tsx** – already fixed

## Wizards / bulk
- **BulkImportFlow.tsx** – tables, headers, borders (gray)
- **wizards/ReviewStep.tsx** – table styling
- **wizards/CSVUploadStep.tsx**, **CollectionAssignment.tsx**, **ContainerConfigurationStep.tsx**, **BatchInfoStep.tsx**, **PapersSection.tsx**, **SheetCard.tsx**, **SpecimenTypesStep.tsx** – gray/white

## Detail / container pages
- **ContainerDefaultsForm.tsx** – table thead/tbody
- **ContainerEditModal.tsx**, **ContainerDerivationModal.tsx**, **AddContainerForSpecimenModal.tsx**
- **ContainerTypeManager.tsx**, **ContainerTypeUnitsManager.tsx**
- **ContainerRegistration.tsx**, **ContainerTypesCell.tsx**
- **CollectionSpecimenEntry.tsx** – table, heading
- **CompositionDetail.tsx** – skeleton bars, bar chart bg, blue badge
- **DerivationChainView.tsx** – `bg-gray-100`, `text-gray-600`

## Study / subject / specimen
- **StudyDetailHeader.tsx** – dropdown hover `hover:bg-gray-100`
- **StudyStats.tsx**, **StudyCard.tsx** (already tokenized), **StudyCardSkeleton.tsx** (already tokenized)
- **StudyTimeline.tsx**, **SimpleTimeline.tsx** – timeline colors (some overridden in page CSS)
- **ContentCard.tsx**
- **DateFilterControls.tsx**
- **StatisticsFilter.tsx**
- **forms/SpecimenForm.tsx**, **SubjectForm.tsx**, **StudyForm.tsx**, **ControlDefinitionForm.tsx**

## Storage / locations
- **LocationForm.tsx** – `disabled:bg-gray-100`
- **LocationHierarchyStats.tsx**
- **CollectionTableWithExport.tsx**, **CollectionGrid.tsx**
- **CollectionSelectOrCreate.tsx**

## Admin
- **AdminDashboard.tsx** – error box red, docs link blue (admin.css overrides blue; ensure red uses app-trend-down if desired)
- **AdminDataIntegrityOverview.tsx** – error red
- **AdminDataIntegrityEmptyCollections.tsx**, **AdminDataIntegrityReport.tsx** (partially tokenized)
- **AdminErrorLogs.tsx**, **AdminUsers.tsx**
- **AdminGuard.tsx**, **AuthGuard.tsx**, **SetupGuard.tsx**

## Other pages
- **Export.tsx** (see Export flow)
- **PlateScanValidation.tsx** – inputs border-gray-300, some already use rgb(var(--app-*))
- **Login.tsx**, **Register.tsx**, **Profile.tsx**, **Settings.tsx** – form and card colors (settings/profile have page CSS overrides)
- **BloodControls.tsx** – progress bars `bg-gray-100`, SkeletonCard already fixed
- **BoxDetail.tsx**, **BagDetail.tsx**, **CryovialBoxDetail.tsx**, **SheetDetail.tsx**, **MicronixPlateDetail.tsx** – view mode tabs, labels
- **Setup.tsx** – step indicator, gray badges
- **ReferenceData.tsx**, **Locations.tsx**, **Collections.tsx**, **ControlDefinitionDetail.tsx**
- **DerivationsBulkImport.tsx** – code blocks `bg-gray-100`, tables
- **EntityBreadcrumbs.tsx**, **SessionSettingsForm.tsx**, **TableViewConfigurationsManager.tsx**
- **ScannerConfigurationsManager.tsx**, **PasswordRequirementsForm.tsx**, **SpecimenCard.tsx**, **UserBadge.tsx**
- **dashboard/StorageOverview.tsx**, **ActivityFeed.tsx**, **MetricCard.tsx**

## Page-scoped CSS (already override gray/blue inside wrapper)
These files already map `.text-gray-*`, `.bg-gray-*`, etc. to tokens when inside their page class. Ensure dark theme tokens are used:
- **subject-specimen.css** – simple-timeline, breadcrumb, buttons
- **blood-controls.css** – simple-timeline
- **admin.css** – admin-table, admin-skeleton, blue overrides
- **storage.css** – storage-grid-table, storage-skeleton
- **settings.css** – settings-card, settings-skeleton
- **reference-data.css** – reference-data-page, reference-data-form-modal
- **profile.css** – profile-page

## Semantic colors
- **Error/destructive**: Prefer `text-app-trend-down`, `bg-app-trend-down` with muted bg, or keep `text-red-*` for semantic “error” if design system keeps red for errors.
- **Success/positive**: `text-app-trend-up` for positive trends.
- **Links/primary actions**: `text-app-accent`, `hover:text-app-accent-hover`, `bg-app-accent`.
