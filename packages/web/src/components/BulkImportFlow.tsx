import { useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { subjectsApi, specimensApi, collectionsApi, importsApi, type BulkCombinedAtomicMode } from '../lib/api'
import { type ContainerType } from './ContainerRegistration'
import LocationPicker from './LocationPicker'
import '../styles/storage.css'

export type ImportType = 'subjects' | 'specimens' | 'combined'
type Step = 'upload' | 'collections' | 'import'

interface CSVRow {
  [key: string]: string
}

interface ValidationError {
  row: number
  error: string
}

interface MissingCollection {
  name: string
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

export interface BulkImportFlowProps {
  /** When set, CSV does not require study_short_code; it is injected from this value. */
  fixedStudyShortCode?: string
  /** When set, show this link in the result step (e.g. "Back to study"). */
  backLink?: { to: string; label: string }
}

export default function BulkImportFlow({ fixedStudyShortCode, backLink }: BulkImportFlowProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as Step) || 'upload'

  const setCurrentStep = (step: Step) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  const [importType, setImportType] = useState<ImportType>('subjects')
  const [containerType, setContainerType] = useState<ContainerType | 'none' | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<CSVRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [importResult, setImportResult] = useState<{
    success: boolean
    created: number
    containersCreated?: number
    errors?: Array<{ index: number; error: string }>
  } | null>(null)
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [missingCollections, setMissingCollections] = useState<MissingCollection[]>([])
  const [validatedData, setValidatedData] = useState<Record<string, unknown>[]>([])
  const [atomicMode, setAtomicMode] = useState<BulkCombinedAtomicMode>('full_file')

  const getCollectionType = (): 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | null => {
    switch (containerType) {
      case 'micronix_tube':
      case 'static_well':
        return 'micronix_plate'
      case 'cryovial_tube':
        return 'cryovial_box'
      case 'paper':
        return 'box'
      default:
        return null
    }
  }

  const getRequiredFields = (): string[] => {
    const base = fixedStudyShortCode
      ? ['subject_name', 'specimen_type_name']
      : ['study_short_code', 'subject_name', 'specimen_type_name']
    if (!containerType || containerType === 'none' || importType === 'subjects') {
      return importType === 'subjects'
        ? fixedStudyShortCode
          ? ['subject_name']
          : ['study_short_code', 'subject_name']
        : base
    }

    const containerFields: Record<ContainerType, string[]> = {
      micronix_tube: ['plate_name', 'barcode', 'position'],
      cryovial_tube: ['box_name', 'position'],
      paper: ['bag_name', 'label'],
      static_well: ['plate_name', 'position'],
    }

    return [...base, ...(containerFields[containerType] || [])]
  }

  const getOptionalFields = (): string[] => {
    if (!containerType || containerType === 'none') return []

    const optionalFields: Record<ContainerType, string[]> = {
      micronix_tube: ['comment'],
      cryovial_tube: ['barcode', 'comment'],
      paper: ['comment'],
      static_well: ['comment'],
    }

    return optionalFields[containerType] || []
  }

  const getSpecimenOptionalFields = (): string[] => {
    if (importType === 'specimens' || importType === 'combined') return ['collection_date']
    return []
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreview([])
      setValidationErrors([])
      setImportResult(null)
      setCurrentStep('upload')
      setCsvRows([])
      setMissingCollections([])

      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length === 0) return

        const headers = lines[0].split(',').map(h => h.trim())
        const previewRows: CSVRow[] = []

        for (let i = 1; i < Math.min(6, lines.length); i++) {
          const values = lines[i].split(',')
          const row: CSVRow = {}
          headers.forEach((header, j) => {
            row[header] = values[j]?.trim() || ''
          })
          previewRows.push(row)
        }

        setPreview(previewRows)
      }
      reader.readAsText(selectedFile)
    }
  }

  const handleClearFile = () => {
    setFile(null)
    setPreview([])
    setValidationErrors([])
    setImportResult(null)
    setCsvRows([])
    setMissingCollections([])
    const fileInput = document.getElementById('import-csv-file') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const getContainerColumns = (type: ContainerType): string => {
    switch (type) {
      case 'micronix_tube':
        return 'plate_name,barcode,position,comment'
      case 'cryovial_tube':
        return 'box_name,barcode,position,comment'
      case 'paper':
        return 'bag_name,label,comment'
      case 'static_well':
        return 'plate_name,position,comment'
      default:
        return ''
    }
  }

  const getTemplateExample = (type: ContainerType): string => {
    const subjectExample = 'SUBJ-001'
    if (type === 'micronix_tube') {
      return fixedStudyShortCode
        ? `${subjectExample},Whole Blood,2024-01-15,PLATE-001,MTX-12345,A01,`
        : `NAM15,${subjectExample},Whole Blood,2024-01-15,PLATE-001,MTX-12345,A01,`
    }
    if (type === 'cryovial_tube') {
      return fixedStudyShortCode
        ? `${subjectExample},Plasma,2024-01-15,BOX-001,,B5,`
        : `NAM15,${subjectExample},Plasma,2024-01-15,BOX-001,,B5,`
    }
    if (type === 'paper') {
      return fixedStudyShortCode
        ? `${subjectExample},Blood Spot,2024-01-15,BOX-003,SPOT-001,`
        : `NAM15,${subjectExample},Blood Spot,2024-01-15,BOX-003,SPOT-001,`
    }
    if (type === 'static_well') {
      return fixedStudyShortCode
        ? `${subjectExample},Whole Blood,2024-01-15,PLATE-002,A01,`
        : `NAM15,${subjectExample},Whole Blood,2024-01-15,PLATE-002,A01,`
    }
    return fixedStudyShortCode
      ? `${subjectExample},Whole Blood,2024-01-15`
      : `NAM15,${subjectExample},Whole Blood,2024-01-15`
  }

  const getCollectionNameColumn = (type: ContainerType | 'none' | ''): string | null => {
    switch (type) {
      case 'micronix_tube':
      case 'static_well':
        return 'plate_name'
      case 'cryovial_tube':
        return 'box_name'
      case 'paper':
        return 'bag_name'
      default:
        return null
    }
  }

  const getRowCollectionName = (row: CSVRow): string | undefined => {
    const column = getCollectionNameColumn(containerType)
    const value = column ? row[column] : undefined
    const collectionNameValue = row.collection_name
    const resolved = (value && value.trim() !== '' ? value : undefined) ?? (collectionNameValue && collectionNameValue.trim() !== '' ? collectionNameValue : undefined)
    return resolved ?? undefined
  }

  const downloadTemplate = () => {
    let csvContent = ''
    let filename = ''

    if (importType === 'subjects') {
      if (fixedStudyShortCode) {
        csvContent = 'subject_name\nSUBJ-001\nSUBJ-002'
      } else {
        csvContent = 'study_short_code,subject_name\nNAM15,SUBJ-001\nNAM15,SUBJ-002'
      }
      filename = 'subjects_template.csv'
    } else {
      const baseColumns = fixedStudyShortCode
        ? 'subject_name,specimen_type_name,collection_date'
        : 'study_short_code,subject_name,specimen_type_name,collection_date'

      if (containerType === 'none') {
        csvContent = fixedStudyShortCode
          ? `${baseColumns}\nSUBJ-001,Whole Blood,2024-01-15\nSUBJ-001,Plasma,2024-01-15`
          : `${baseColumns}\nNAM15,SUBJ-001,Whole Blood,2024-01-15\nNAM15,SUBJ-001,Plasma,2024-01-15`
        filename = importType === 'specimens' ? 'specimens_template.csv' : 'combined_template.csv'
      } else {
        const containerColumns = getContainerColumns(containerType as ContainerType)
        csvContent = `${baseColumns},${containerColumns}\n${getTemplateExample(containerType as ContainerType)}`
        filename = importType === 'specimens' ? 'specimens_template.csv' : 'combined_template.csv'
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const normalizeHeader = (header: string): string => {
    const lower = header.trim().toLowerCase()
    if (lower === 'well_position' || lower === 'well') return 'position'
    return lower
  }

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const rawHeaders = lines[0].split(',').map(h => h.trim())
    const headers = rawHeaders.map(normalizeHeader)
    const rows: CSVRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',')
      const row: CSVRow = {}
      headers.forEach((header, j) => {
        (row as Record<string, string>)[header] = values[j]?.trim() || ''
      })
      rows.push(row)
    }

    return rows
  }

  const validateCSV = (rows: CSVRow[]): { valid: boolean; errors: ValidationError[]; data: Record<string, unknown>[] } => {
    const errors: ValidationError[] = []
    const data: Record<string, unknown>[] = []
    const requiredFields = getRequiredFields()
    const studyShortCode = fixedStudyShortCode ?? ''

    if (rows.length === 0) {
      return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }], data: [] }
    }

    const headers = Object.keys(rows[0])
    const collectionNameColumn = containerType && containerType !== 'none' ? getCollectionNameColumn(containerType) : null
    const missingColumns = requiredFields.filter((col) => {
      if (headers.includes(col)) return false
      if (collectionNameColumn && col === collectionNameColumn && headers.includes('collection_name')) return false
      return true
    })

    if (missingColumns.length > 0) {
      return {
        valid: false,
        errors: [{ row: 0, error: `Missing required columns: ${missingColumns.join(', ')}` }],
        data: [],
      }
    }

    if (containerType !== 'none' && headers.includes('container_type')) {
      const containerTypes = new Set(rows.map(row => row.container_type).filter(Boolean))
      if (containerTypes.size > 1) {
        errors.push({ row: 0, error: 'All rows must have the same container_type' })
      }
      if (containerTypes.size === 1 && !containerTypes.has(containerType)) {
        errors.push({ row: 0, error: `Container type mismatch: CSV has ${Array.from(containerTypes)[0]}, but selected type is ${containerType}` })
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowErrors: string[] = []

      for (const field of requiredFields) {
        const value = row[field]
        const hasCollectionName = collectionNameColumn && field === collectionNameColumn && (row.collection_name?.trim() ?? '') !== ''
        if (!hasCollectionName && (!value || (typeof value === 'string' && value.trim() === ''))) {
          rowErrors.push(`Missing required field: ${field}`)
        }
      }

      if (containerType !== 'none') {
        if (containerType === 'micronix_tube') {
          if (!row.barcode || row.barcode.trim() === '') {
            rowErrors.push('Barcode is required for micronix tubes')
          }
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for micronix tubes')
          }
        } else if (containerType === 'cryovial_tube') {
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for cryovial tubes')
          }
        } else if (containerType === 'static_well') {
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for static wells')
          }
        } else if (containerType === 'paper') {
          if (!row.label || row.label.trim() === '') {
            rowErrors.push('Label is required for papers')
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, error: rowErrors.join('; ') })
      } else {
        if (importType === 'subjects') {
          data.push({
            studyShortCode: fixedStudyShortCode ?? row.study_short_code,
            name: row.subject_name,
          })
        } else {
          const spec: Record<string, unknown> = {
            sourceType: 'subject' as const,
            studyShortCode: fixedStudyShortCode ?? row.study_short_code,
            subjectName: row.subject_name,
            specimenTypeName: row.specimen_type_name,
            collectionDate: row.collection_date || undefined,
          }

          if (containerType !== 'none') {
            spec.container = {
              containerType,
              collectionName: getRowCollectionName(row),
              collectionBarcode: row.collection_barcode || undefined,
              barcode: row.barcode || undefined,
              position: row.position || undefined,
              label: row.label || undefined,
              comment: row.comment || undefined,
            }
          }

          data.push(spec)
        }
      }
    }

    return { valid: errors.length === 0, errors, data }
  }

  const checkCollections = async (rows: CSVRow[]): Promise<MissingCollection[]> => {
    if (containerType === 'none' || importType === 'subjects') {
      return []
    }

    const collectionType = getCollectionType()
    if (!collectionType) return []

    const uniqueCollections = new Set<string>()
    rows.forEach(row => {
      const collectionName = getRowCollectionName(row)
      if (collectionName) {
        uniqueCollections.add(collectionName)
      }
      if (row.collection_barcode) {
        uniqueCollections.add(row.collection_barcode)
      }
    })

    if (uniqueCollections.size === 0) return []

    try {
      const checkData = Array.from(uniqueCollections).map(identifier => ({
        identifier,
        type: collectionType,
      }))

      const response = await collectionsApi.check({ collections: checkData })
      const results = response.data.results

      const missing: MissingCollection[] = []
      const found = new Set<string>()

      for (const result of results) {
        if (!result.exists) {
          const isBarcode = result.identifier.match(/^[A-Z0-9-]+$/) && result.identifier.length > 5

          if (!found.has(result.identifier)) {
            missing.push({
              name: isBarcode ? '' : result.identifier,
              barcode: isBarcode ? result.identifier : undefined,
              collectionBarcode: isBarcode ? result.identifier : undefined,
              locationId: null,
              status: 'pending',
            })
            found.add(result.identifier)
          }
        } else {
          found.add(result.identifier)
        }
      }

      return missing
    } catch (error) {
      console.error('Failed to check collections:', error)
      return Array.from(uniqueCollections).map(identifier => {
        const isBarcode = identifier.match(/^[A-Z0-9-]+$/) && identifier.length > 5
        return {
          name: isBarcode ? '' : identifier,
          barcode: isBarcode ? identifier : undefined,
          collectionBarcode: isBarcode ? identifier : undefined,
          locationId: null,
          status: 'pending' as const,
        }
      })
    }
  }

  const handleValidateAndCheck = async () => {
    if (!file) return

    setLoading(true)
    setValidationErrors([])

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      setCsvRows(rows)

      const validation = validateCSV(rows)

      if (!validation.valid) {
        setValidationErrors(validation.errors)
        setLoading(false)
        return
      }

      setValidatedData(validation.data)

      if (importType !== 'subjects' && containerType !== 'none') {
        const missing = await checkCollections(rows)
        setMissingCollections(missing)

        if (missing.length > 0) {
          setCurrentStep('collections')
        } else {
          setCurrentStep('import')
          handleImport(validation.data)
        }
      } else {
        setCurrentStep('import')
        handleImport(validation.data)
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Validation failed'
      setValidationErrors([{ row: 0, error: message }])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCollections = async () => {
    setLoading(true)
    const collectionType = getCollectionType()
    if (!collectionType) {
      setLoading(false)
      return
    }

    const updated = [...missingCollections]
    let allSuccess = true

    for (let i = 0; i < updated.length; i++) {
      const collection = updated[i]
      if (collection.status === 'success' || !collection.locationId) continue

      updated[i].status = 'creating'
      setMissingCollections([...updated])

      try {
        const name = collection.name || (collection.barcode ? `Collection-${collection.barcode}` : `Collection-${Date.now()}`)
        const barcode = collection.barcode || collection.collectionBarcode

        if (collectionType === 'micronix_plate') {
          await collectionsApi.createMicronixPlate({
            name,
            locationId: collection.locationId,
            barcode,
          })
        } else if (collectionType === 'cryovial_box') {
          await collectionsApi.createCryovialBox({
            name,
            locationId: collection.locationId,
            barcode,
          })
        } else if (collectionType === 'box') {
          await collectionsApi.createBox({
            name,
            locationId: collection.locationId,
          })
        } else if (collectionType === 'bag') {
          await collectionsApi.createBag({
            name,
            locationId: collection.locationId,
          })
        }

        updated[i].status = 'success'
        updated[i].name = name
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } }
        updated[i].status = 'error'
        updated[i].error = err.response?.data?.error || 'Failed to create collection'
        allSuccess = false
      }
    }

    setMissingCollections(updated)

    if (allSuccess && updated.every(c => c.status === 'success' || c.status === 'pending')) {
      setCurrentStep('import')
      handleImport(validatedData)
    } else {
      setLoading(false)
    }
  }

  const handleImport = async (data: Record<string, unknown>[]) => {
    setLoading(true)
    setImportResult(null)
    setValidationErrors([])

    try {
      if (importType === 'subjects') {
        const validateRes = await subjectsApi.validateBulk({ subjects: data as Array<{ studyShortCode: string; name: string }> })
        if (!validateRes.data.valid && validateRes.data.errors?.length) {
          setValidationErrors(validateRes.data.errors.map((e) => ({ row: e.index + 1, error: e.message })))
          setCurrentStep('import')
          setLoading(false)
          return
        }
        const response = await subjectsApi.createBulk({ subjects: data as Array<{ studyShortCode: string; name: string }> })
        setImportResult({
          success: true,
          created: response.data.created,
          errors: response.data.errors,
        })
      } else if (importType === 'specimens') {
        const collectionLocationMap = new Map<string, number>()
        for (const coll of missingCollections) {
          if (coll.locationId && coll.name) collectionLocationMap.set(coll.name, coll.locationId)
          if (coll.locationId && coll.barcode) collectionLocationMap.set(coll.barcode, coll.locationId)
        }
        const specimensWithLocations = data.map((spec: Record<string, unknown>) => {
          if (!spec.container) return spec
          const container = spec.container as Record<string, unknown>
          const locationId = container.collectionName
            ? collectionLocationMap.get(container.collectionName as string)
            : container.collectionBarcode
              ? collectionLocationMap.get(container.collectionBarcode as string)
              : undefined
          if (!locationId) return spec
          return {
            ...spec,
            container: { ...container, collectionLocationId: locationId },
          }
        })
        type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
        const validateRes = await specimensApi.validateBulk({ specimens: specimensWithLocations as SpecimenBulkItem[] })
        if (!validateRes.valid && validateRes.errors?.length) {
          setValidationErrors(validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message })))
          setCurrentStep('import')
          setLoading(false)
          return
        }
        const response = await specimensApi.createBulk({ specimens: specimensWithLocations as SpecimenBulkItem[] })
        setImportResult({
          success: true,
          created: response.created,
          containersCreated: response.containersCreated,
          errors: response.errors,
        })
      } else {
        const subjectMap = new Map<string, Record<string, unknown>[]>()
        const collectionLocationMap = new Map<string, number>()
        for (const coll of missingCollections) {
          if (coll.locationId && coll.name) {
            collectionLocationMap.set(coll.name, coll.locationId)
          }
          if (coll.locationId && coll.barcode) {
            collectionLocationMap.set(coll.barcode, coll.locationId)
          }
        }

        for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
          const spec = data[rowIndex]
          const studyShortCode = (spec.studyShortCode as string) ?? fixedStudyShortCode ?? ''
          const subjectName = spec.subjectName as string
          const key = `${studyShortCode}:${subjectName}`
          if (!subjectMap.has(key)) {
            subjectMap.set(key, [])
          }

          let containerData = spec.container as Record<string, unknown> | undefined
          if (containerData && containerData.collectionName) {
            const locationId = collectionLocationMap.get(containerData.collectionName as string)
            if (locationId) {
              containerData = {
                ...containerData,
                collectionLocationId: locationId,
              }
            }
          } else if (containerData && containerData.collectionBarcode) {
            const locationId = collectionLocationMap.get(containerData.collectionBarcode as string)
            if (locationId) {
              containerData = {
                ...containerData,
                collectionLocationId: locationId,
              }
            }
          }

          subjectMap.get(key)!.push({
            specimenTypeName: spec.specimenTypeName,
            collectionDate: spec.collectionDate,
            container: containerData,
            rowIndex: rowIndex + 1,
          })
        }

        const studyShortCode = fixedStudyShortCode ?? (data[0]?.studyShortCode as string) ?? ''
        const subjects = Array.from(subjectMap.entries()).map(([key, specimens]) => {
          const [, subjectName] = key.split(':')
          return {
            subjectName,
            specimens: specimens.map((s) => ({
              specimenTypeName: s.specimenTypeName as string,
              collectionDate: s.collectionDate as string | undefined,
              container: s.container as Parameters<typeof importsApi.bulkCombined>[0]['subjects'][0]['specimens'][0]['container'] | undefined,
              rowIndex: (s as { rowIndex?: number }).rowIndex,
            })),
          }
        })

        const createCollections =
          atomicMode === 'full_file' && missingCollections.some((c) => c.locationId)
            ? missingCollections
                .filter((c) => c.locationId != null)
                .map((c) => {
                  const name = c.name || (c.barcode ? `Collection-${c.barcode}` : `Collection-${Date.now()}`)
                  const colType = getCollectionType()
                  return {
                    type: colType! as 'box' | 'bag' | 'micronix_plate' | 'cryovial_box',
                    name,
                    locationId: c.locationId!,
                    barcode: c.barcode ?? c.collectionBarcode,
                  }
                })
            : undefined

        const validateRes = await importsApi.bulkCombinedValidate({
          studyShortCode,
          atomicMode,
          createCollections,
          subjects,
        })
        if (!validateRes.data.valid && validateRes.data.errors?.length) {
          setValidationErrors(
            validateRes.data.errors.map((e) => ({
              row: e.rowIndex ?? e.subjectIndex + 1,
              error: e.message,
            }))
          )
          setCurrentStep('import')
          setLoading(false)
          return
        }

        try {
          const response = await importsApi.bulkCombined({
            studyShortCode,
            atomicMode,
            createCollections,
            subjects,
          })
          const summary = response.data.summary
          setImportResult({
            success: !response.data.errors?.length,
            created: summary.subjectsCreated + summary.specimensCreated + summary.containersCreated,
            errors: response.data.errors,
          })
          setCurrentStep('import')
        } catch (err: unknown) {
          const error = err as { response?: { data?: { error?: string } } }
          setImportResult({
            success: false,
            created: 0,
            errors: [{ index: 0, error: error.response?.data?.error ?? 'Import failed' }],
          })
          setCurrentStep('import')
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; errors?: Array<{ index: number; error: string }> }; message?: string } }
      const data = err.response?.data
      const summaryError = data?.error || (err as Error).message || 'Import failed'
      setValidationErrors([{ row: 0, error: summaryError }])
      setImportResult({
        success: false,
        created: 0,
        errors: Array.isArray(data?.errors) ? data.errors : [{ index: 0, error: summaryError }],
      })
    } finally {
      setLoading(false)
    }
  }

  const getRequiredColumnsDisplay = () => {
    const required = getRequiredFields()
    const optional = getOptionalFields()
    const infoBoxStyle = { background: 'rgb(var(--dashboard-accent-muted))', border: '1px solid rgb(var(--dashboard-accent) / 0.3)', color: 'rgb(var(--dashboard-text))' } as const

    if (importType === 'subjects') {
      return (
        <div className="rounded p-4 text-sm" style={infoBoxStyle}>
          <h4 className="font-semibold mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium">Required:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>{required.join(', ')}</span>
            </div>
          </div>
        </div>
      )
    }

    if (!containerType || containerType === 'none') {
      const specimenOptional = getSpecimenOptionalFields()
      return (
        <div className="rounded p-4 text-sm" style={infoBoxStyle}>
          <h4 className="font-semibold mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium">Required:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>{required.join(', ')}</span>
            </div>
            {specimenOptional.length > 0 && (
              <div>
                <span className="font-medium">Optional:</span>
                <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>collection_date (YYYY-MM-DD)</span>
              </div>
            )}
          </div>
        </div>
      )
    }

    const baseRequired = required.filter(f => ['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))
    const containerSpecific = required.filter(f => !['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))
    const specimenOptional = getSpecimenOptionalFields()
    const allOptional = [...specimenOptional, ...optional]

    return (
      <div className="rounded p-4 text-sm" style={infoBoxStyle}>
        <h4 className="font-semibold mb-2">Required CSV Columns for {String(containerType).replace('_', ' ')}</h4>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Base Required:</span>
            <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>{baseRequired.join(', ')}</span>
          </div>
          <div>
            <span className="font-medium">Container Required:</span>
            <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>{containerSpecific.join(', ')}</span>
          </div>
          {allOptional.length > 0 && (
            <div>
              <span className="font-medium">Optional:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--dashboard-accent-on-tint))' }}>{allOptional.join(', ')}</span>
            </div>
          )}
          {(containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgb(var(--dashboard-accent) / 0.3)', color: 'rgb(var(--dashboard-accent-on-tint))' }}>
              <strong>Position format:</strong> A01, B12 (letter + 2 digits) - <strong>Required</strong>
            </div>
          )}
        </div>
      </div>
    )
  }

  const uploadHelperText = () => {
    if (fixedStudyShortCode) {
      return `This import is for study ${fixedStudyShortCode}. You do not need a study column. Upload a CSV with subject names, specimen type names, and container names/barcodes as needed.`
    }
    return `Upload a CSV file. Use study short codes, specimen type names, subject names, and container names/barcodes as identifiers.`
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10 max-w-4xl">
        {!fixedStudyShortCode && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Bulk Import</h1>
            <p className="text-sm text-gray-600 mt-1">
              <a href="/docs/guides/bulk-operations/import/" className="text-blue-600 hover:text-blue-800 hover:underline">
                Import guide
              </a>
            </p>
          </div>
        )}
        {(importType === 'specimens' || importType === 'combined') && (
          <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
            <div className="storage-step-indicator">
              <div className={`storage-step-item ${currentStep === 'upload' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">1</span>
                <span>Upload & Validate</span>
              </div>
              <div className="storage-step-connector" />
              <div className={`storage-step-item ${currentStep === 'collections' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">2</span>
                <span>Create Collections{missingCollections.length === 0 && currentStep === 'upload' ? ' (if needed)' : ''}</span>
              </div>
              <div className="storage-step-connector" />
              <div className={`storage-step-item ${currentStep === 'import' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">3</span>
                <span>Import</span>
              </div>
            </div>
          </div>
        )}

        <div className="storage-card p-6 storage-reveal storage-reveal-2">
          {currentStep === 'upload' && (
            <form onSubmit={(e) => { e.preventDefault(); handleValidateAndCheck(); }} className="space-y-6">
              <div>
                <label htmlFor="import-type" className="block text-sm font-medium text-gray-700 mb-2">
                  Import Type *
                </label>
                <select
                  id="import-type"
                  value={importType}
                  onChange={(e) => {
                    setImportType(e.target.value as ImportType)
                    setContainerType('')
                    setFile(null)
                    setPreview([])
                    setValidationErrors([])
                    setImportResult(null)
                  }}
                  className="form-select"
                >
                  <option value="subjects">Subjects Only</option>
                  <option value="specimens">Specimens Only</option>
                  <option value="combined">Subjects with Specimens (Combined)</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  {importType === 'subjects' && (fixedStudyShortCode ? 'Import subjects for this study.' : 'Import study subjects using study short codes and subject names')}
                  {importType === 'specimens' && (fixedStudyShortCode ? 'Import specimens for existing subjects in this study.' : 'Import specimens for existing subjects using study short codes, subject names, and specimen type names')}
                  {importType === 'combined' && (fixedStudyShortCode ? 'Create subjects and their specimens for this study. Subjects will be created if they don\'t exist.' : 'Create subjects and their specimens in one import. Subjects will be created if they don\'t exist.')}
                </p>
              </div>

              {(importType === 'specimens' || importType === 'combined') && (
                <div>
                  <label htmlFor="container-type" className="block text-sm font-medium text-gray-700 mb-2">
                    Container Type *
                  </label>
                  <select
                    id="container-type"
                    value={containerType}
                    onChange={(e) => {
                      setContainerType(e.target.value as ContainerType | 'none')
                      setFile(null)
                      setPreview([])
                      handleClearFile()
                    }}
                    className="form-select"
                    required
                  >
                    <option value="">Select container type...</option>
                    <option value="none">No Containers</option>
                    <option value="micronix_tube">Micronix Tubes</option>
                    <option value="cryovial_tube">Cryovial Tubes</option>
                    <option value="paper">Papers</option>
                    <option value="static_well">Static Wells</option>
                  </select>
                  <p className="text-sm text-gray-500 mt-1">
                    All specimens in this batch will use the same container type. Select the container type for containers, or "No Containers" to skip container creation.
                  </p>
                </div>
              )}

              {importType === 'combined' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Atomicity</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="atomicity"
                        checked={atomicMode === 'full_file'}
                        onChange={() => setAtomicMode('full_file')}
                        className="form-radio"
                      />
                      <span>Full file (all-or-nothing)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="atomicity"
                        checked={atomicMode === 'per_subject'}
                        onChange={() => setAtomicMode('per_subject')}
                        className="form-radio"
                      />
                      <span>Per subject</span>
                    </label>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    {atomicMode === 'full_file'
                      ? 'The entire file is imported in one transaction. If anything fails, nothing is committed.'
                      : 'Each subject is imported in its own transaction. Some subjects can succeed while others fail.'}
                  </p>
                </div>
              )}

              {(importType === 'subjects' || ((importType === 'specimens' || importType === 'combined') && containerType)) && (
                <div>
                  {getRequiredColumnsDisplay()}
                </div>
              )}

              {(importType === 'subjects' || ((importType === 'specimens' || importType === 'combined') && containerType)) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="import-csv-file" className="block text-sm font-medium text-gray-700">
                      CSV File *
                    </label>
                    <div className="flex items-center gap-3">
                      {file && (
                        <button type="button" onClick={handleClearFile} className="text-sm text-red-600 hover:text-red-700 underline">
                          Clear File
                        </button>
                      )}
                      <button type="button" onClick={downloadTemplate} className="storage-link text-sm underline bg-transparent border-0 cursor-pointer p-0">
                        Download Template
                      </button>
                    </div>
                  </div>
                  <input
                    id="import-csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="file-input-accent"
                    required
                  />
                  {file && (
                    <p className="text-sm text-green-600 mt-1">Selected: {file.name}</p>
                  )}
                  {!file && (
                    <p className="text-sm text-gray-500 mt-1">
                      {uploadHelperText()}
                      {(importType === 'specimens' || importType === 'combined') && ' Optional columns: collection_date (YYYY-MM-DD)' + (containerType && containerType !== 'none' ? '; comment (per container).' : '.')}
                    </p>
                  )}
                </div>
              )}

              {preview.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-gray-900">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(preview[0] ?? {}).map((key) => {
                            const required = getRequiredFields()
                            const isRequired = required.includes(key)
                            return (
                              <th key={key} className={`px-4 py-2 text-left border-b text-gray-700 font-medium ${isRequired ? 'bg-red-50' : ''}`}>
                                {key}
                                {isRequired && <span className="text-red-600 ml-1">*</span>}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50">
                            {Object.values(row).map((value, j) => (
                              <td key={j} className="px-4 py-2 border-b text-gray-900">
                                {String(value)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <h3 className="font-semibold text-red-800 mb-2">Validation Errors:</h3>
                  <ul className="list-disc list-inside text-red-700 space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>
                        {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="submit"
                disabled={!file || loading || ((importType === 'specimens' || importType === 'combined') && !containerType)}
                className="storage-btn-primary w-full py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Validating...' : 'Validate & Continue'}
              </button>
            </form>
          )}

          {currentStep === 'collections' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2 text-gray-900">Create Missing Collections</h2>
                <p className="text-sm text-gray-600">
                  The following collections need to be created. Please specify a location for each one.
                </p>
              </div>

              <div className="space-y-4">
                {missingCollections.map((collection, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {collection.name || collection.barcode || collection.collectionBarcode || `Collection ${index + 1}`}
                        </h3>
                        {(collection.barcode || collection.collectionBarcode) && (
                          <p className="text-sm text-gray-500">Barcode: {collection.barcode || collection.collectionBarcode}</p>
                        )}
                        {!collection.name && (collection.barcode || collection.collectionBarcode) && (
                          <p className="text-xs text-gray-400 mt-1">A name will be generated from the barcode</p>
                        )}
                      </div>
                      {collection.status === 'success' && <span className="text-green-600 text-sm font-medium">✓ Created</span>}
                      {collection.status === 'creating' && <span className="text-teal-600 text-sm">Creating...</span>}
                      {collection.status === 'error' && <span className="text-red-600 text-sm">Error</span>}
                    </div>

                    {collection.status === 'error' && collection.error && (
                      <div className="mb-3 text-sm text-red-600">{collection.error}</div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Location *</label>
                      <LocationPicker
                        value={collection.locationId ?? null}
                        onChange={(locationId) => {
                          const updated = [...missingCollections]
                          updated[index].locationId = locationId
                          setMissingCollections(updated)
                        }}
                        filterCollectionsOnly
                        disabled={collection.status === 'creating' || collection.status === 'success'}
                      />
                    </div>

                    {(getCollectionType() === 'micronix_plate' || getCollectionType() === 'cryovial_box') && !collection.barcode && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Barcode (Optional)</label>
                        <input
                          type="text"
                          value={collection.collectionBarcode || ''}
                          onChange={(e) => {
                            const updated = [...missingCollections]
                            updated[index].collectionBarcode = e.target.value
                            setMissingCollections(updated)
                          }}
                          disabled={collection.status === 'creating' || collection.status === 'success'}
                          className="form-input w-full"
                          placeholder="Enter barcode (optional)"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setCurrentStep('upload')} className="storage-btn-secondary">
                  Back
                </button>
                {importType === 'combined' && atomicMode === 'full_file' ? (
                  <button
                    type="button"
                    onClick={() => handleImport(validatedData)}
                    disabled={loading || missingCollections.some((c) => !c.locationId)}
                    className="storage-btn-primary py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? 'Importing...' : 'Import (creates collections in same transaction)'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateCollections}
                    disabled={loading || missingCollections.some((c) => !c.locationId && c.status !== 'success')}
                    className="storage-btn-primary flex-1 py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {loading ? 'Creating Collections...' : 'Create Collections & Continue'}
                  </button>
                )}
              </div>
            </div>
          )}

          {currentStep === 'import' && (
            <div className="space-y-6">
              {validationErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded p-4">
                  <h3 className="font-semibold text-red-800 mb-2">Validation Errors (fix before importing):</h3>
                  <p className="text-sm text-red-700 mb-2">The following issues were found. Update your CSV and run Validate & Continue again.</p>
                  <ul className="list-disc list-inside text-red-700 space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>
                        {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('upload')}
                    className="mt-3 storage-btn-secondary"
                  >
                    Back to Upload
                  </button>
                </div>
              )}
              {importResult && (
                <div className={`border rounded p-4 ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                  <h3 className={`font-semibold mb-2 ${importResult.success ? 'text-green-800' : 'text-yellow-800'}`}>
                    Import {importResult.success ? 'Successful' : 'Completed with Errors'}
                  </h3>
                  <p className={importResult.success ? 'text-green-700' : 'text-yellow-700'}>
                    {importResult.created === 0 && importResult.errors && importResult.errors.length > 0
                      ? 'No items were created. Please fix the errors below and try again.'
                      : importResult.containersCreated != null && importResult.containersCreated > 0
                        ? `Created: ${importResult.created} ${importResult.created === 1 ? 'specimen' : 'specimens'} and ${importResult.containersCreated} ${importResult.containersCreated === 1 ? 'container' : 'containers'}`
                        : `Created: ${importResult.created} ${importResult.created === 1 ? 'item' : 'items'}`}
                  </p>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-2">
                      <p className="font-medium text-yellow-800 mb-1">Errors:</p>
                      <ul className="list-disc list-inside text-yellow-700 space-y-1">
                        {importResult.errors.map((error, i) => (
                          <li key={i}>
                            Row {error.index + 1}: {error.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {!importResult && loading && (
                <div className="text-center py-4">
                  <p className="text-gray-600">Import in progress...</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {backLink && (
                  <Link to={backLink.to} className="storage-btn-secondary py-2 font-medium inline-block">
                    {backLink.label}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep('upload')
                    setFile(null)
                    setPreview([])
                    setImportResult(null)
                    setCsvRows([])
                    setMissingCollections([])
                    setValidatedData([])
                  }}
                  className="storage-btn-primary py-2 font-medium"
                >
                  Start New Import
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
