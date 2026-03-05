import { useState, useEffect, useRef } from 'react'
import {
  specimensApi,
  type Specimen,
  specimenTypesApi,
  type SpecimenType,
  studiesApi,
  type Study,
  type StudySubject,
  controlsApi,
  type ControlDefinition,
  reagentsApi,
  type Reagent,
  cellLinesApi,
  type CellLine,
  plasmidsApi,
  type Plasmid,
  standardsApi,
  type Standard,
} from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import StudyPicker from '../StudyPicker'
import ContainerRegistration, { type ContainerData } from '../ContainerRegistration'
import { subjectsApi } from '../../lib/api'
import { useModifierHotkey } from '../../hooks/useHotkey'

interface SpecimenFormProps {
  specimen?: Specimen
  subjectId?: number
  studyId?: number
  studyShortCode?: string
  subjectName?: string
  controlBatchId?: number
  controlBatchName?: string
  onSuccess?: () => void
  onCancel: () => void
}

export default function SpecimenForm({
  specimen,
  subjectId,
  studyId,
  studyShortCode,
  subjectName,
  controlBatchId,
  controlBatchName,
  onSuccess,
  onCancel
}: SpecimenFormProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [studies, setStudies] = useState<Study[]>([])
  const [subjects, setSubjects] = useState<StudySubject[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [controls, setControls] = useState<ControlDefinition[]>([])
  const [reagents, setReagents] = useState<Reagent[]>([])
  const [cellLines, setCellLines] = useState<CellLine[]>([])
  const [plasmids, setPlasmids] = useState<Plasmid[]>([])
  const [standards, setStandards] = useState<Standard[]>([])
  const [formData, setFormData] = useState({
    sourceType: (subjectId ? 'subject' : (controlBatchId ? 'control' : (specimen?.sourceType || 'subject'))) as 'subject' | 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard',
    sourceId: subjectId || controlBatchId || specimen?.sourceId || 0,
    studyId: studyId || 0,
    studyShortCode: studyShortCode || '',
    subjectName: subjectName || controlBatchName || '',
    createNewSubject: false,
    specimenTypeId: specimen?.specimenTypeId || 0,
    specimenTypeName: '',
    collectionDate: specimen?.collectionDate || '',
  })
  const [containerData, setContainerData] = useState<ContainerData | null>(null)
  const [containerValid, setContainerValid] = useState(true)

  useEffect(() => {
    loadStudies()
    loadSpecimenTypes()
  }, [])

  // Single effect: load subjects when study (prop or form) or source type changes
  useEffect(() => {
    if (formData.sourceType === 'subject') {
      const effectiveStudyId = (formData.studyId || studyId) ?? 0
      if (effectiveStudyId > 0) {
        loadSubjects(effectiveStudyId)
      }
    }
  }, [studyId, formData.studyId, formData.sourceType])

  useEffect(() => {
    if (formData.sourceType !== 'subject') {
      loadSourceEntities(formData.sourceType)
    }
  }, [formData.sourceType])

  const loadStudies = async () => {
    try {
      const response = await studiesApi.list()
      setStudies(response.studies)
    } catch (error) {
      console.error('Failed to load studies:', error)
    }
  }

  const loadSpecimenTypes = async () => {
    try {
      const response = await specimenTypesApi.list()
      setSpecimenTypes(response.data)
    } catch (error) {
      console.error('Failed to load specimen types:', error)
      setError('Failed to load specimen types. Please refresh the page.')
      setSpecimenTypes([]) // Clear on error
    }
  }

  const loadSubjects = async (studyId: number) => {
    try {
      const response = await studiesApi.getSubjects(studyId)
      setSubjects(response.subjects)
    } catch (error) {
      console.error('Failed to load subjects:', error)
    }
  }

  const loadSourceEntities = async (sourceType: 'control' | 'reagent' | 'cell_line' | 'plasmid' | 'standard') => {
    try {
      switch (sourceType) {
        case 'control':
          const controlsRes = await controlsApi.list()
          setControls(controlsRes.data.controls)
          break
        case 'reagent':
          const reagentsRes = await reagentsApi.list()
          setReagents(reagentsRes.data.reagents)
          break
        case 'cell_line':
          const cellLinesRes = await cellLinesApi.list()
          setCellLines(cellLinesRes.data.cellLines)
          break
        case 'plasmid':
          const plasmidsRes = await plasmidsApi.list()
          setPlasmids(plasmidsRes.data.plasmids)
          break
        case 'standard':
          const standardsRes = await standardsApi.list()
          setStandards(standardsRes.data.standards)
          break
      }
    } catch (error) {
      console.error(`Failed to load ${sourceType} entities:`, error)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (specimen) {
        setError('Update not yet implemented')
        setLoading(false)
        return
      }

      // If creating new subject, create it first
      let sourceId = formData.sourceId
      if (formData.sourceType === 'subject' && formData.createNewSubject) {
        if (!formData.studyId || !formData.subjectName.trim()) {
          setError('Please select a study and enter a subject name')
          setLoading(false)
          return
        }

        try {
          const subjectResponse = await subjectsApi.create({
            studyId: formData.studyId,
            name: formData.subjectName.trim(),
          })
          sourceId = subjectResponse.subject.id
        } catch (err: any) {
          setError(err.response?.data?.error || 'Failed to create subject')
          setLoading(false)
          return
        }
      }

      // Build specimen data using human-readable identifiers
      const data: any = {
        sourceType: formData.sourceType,
      }

      if (formData.sourceType === 'subject') {
        if (subjectId) {
          // Use the subjectId provided as prop (from context)
          data.sourceId = subjectId
        } else if (formData.createNewSubject) {
          // Use the newly created subject ID
          data.sourceId = sourceId
        } else if (formData.sourceId) {
          // Use existing subject ID
          data.sourceId = formData.sourceId
        } else if (formData.studyShortCode && formData.subjectName) {
          // Use human-readable identifiers
          data.studyShortCode = formData.studyShortCode
          data.subjectName = formData.subjectName
        } else {
          setError('Please select or create a subject')
          setLoading(false)
          return
        }
      } else if (formData.sourceType === 'control') {
        data.sourceId = controlBatchId || formData.sourceId
      } else {
        data.sourceId = formData.sourceId
      }

      // Use specimen type name if available, otherwise use ID
      if (formData.specimenTypeName) {
        data.specimenTypeName = formData.specimenTypeName
      } else if (formData.specimenTypeId) {
        data.specimenTypeId = formData.specimenTypeId
      } else {
        setError('Please select a specimen type')
        setLoading(false)
        return
      }

      if (formData.collectionDate) {
        data.collectionDate = formData.collectionDate
      }

      // Add container data if provided
      if (containerData) {
        data.container = containerData
      }

      const response = await specimensApi.create(data)
      if (onSuccess) {
        onSuccess()
      } else {
        // Navigate to the newly created specimen's detail page
        if (response.specimen.id) {
          navigate(`/specimens/${response.specimen.id}`)
        } else {
          navigate('/statistics')
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save specimen')
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl+Enter to submit
  useModifierHotkey('enter', (e) => {
    if (!loading && containerValid && formRef.current) {
      e.preventDefault()
      formRef.current.requestSubmit()
    }
  }, { preventDefault: true, enableOnFormTags: true })

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {!subjectId && !controlBatchId && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Source & Study</h2>
          <div>
            <label htmlFor="specimen-source-type" className="block text-sm font-medium text-gray-700 mb-2">
              Source Type *
            </label>
            <select
              id="specimen-source-type"
              value={formData.sourceType}
              onChange={(e) => setFormData({ ...formData, sourceType: e.target.value as any, sourceId: 0 })}
              required
              className="form-select"
            >
              <option value="subject">Subject</option>
              <option value="control">Control</option>
              <option value="reagent">Reagent</option>
              <option value="cell_line">Cell Line</option>
              <option value="plasmid">Plasmid</option>
              <option value="standard">Standard</option>
            </select>
          </div>

          {formData.sourceType === 'control' && (
            <div>
              <label htmlFor="specimen-source" className="block text-sm font-medium text-gray-700 mb-2">
                Control *
              </label>
              <select
                id="specimen-source"
                value={formData.sourceId || 0}
                onChange={(e) => setFormData({ ...formData, sourceId: parseInt(e.target.value) || 0 })}
                required
                className="form-select"
              >
                <option value={0}>Select a control</option>
                {controls.map((control) => (
                  <option key={control.id} value={control.id}>
                    {control.name} ({control.controlType})
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'reagent' && (
            <div>
              <label htmlFor="specimen-source" className="block text-sm font-medium text-gray-700 mb-2">
                Reagent *
              </label>
              <select
                id="specimen-source"
                value={formData.sourceId || 0}
                onChange={(e) => setFormData({ ...formData, sourceId: parseInt(e.target.value) || 0 })}
                required
                className="form-select"
              >
                <option value={0}>Select a reagent</option>
                {reagents.map((reagent) => (
                  <option key={reagent.id} value={reagent.id}>
                    {reagent.name} ({reagent.reagentType})
                    {reagent.catalogNumber && ` - ${reagent.catalogNumber}`}
                    {reagent.lotNumber && ` Lot: ${reagent.lotNumber}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'cell_line' && (
            <div>
              <label htmlFor="specimen-source" className="block text-sm font-medium text-gray-700 mb-2">
                Cell Line *
              </label>
              <select
                id="specimen-source"
                value={formData.sourceId || 0}
                onChange={(e) => setFormData({ ...formData, sourceId: parseInt(e.target.value) || 0 })}
                required
                className="form-select"
              >
                <option value={0}>Select a cell line</option>
                {cellLines.map((cellLine) => (
                  <option key={cellLine.id} value={cellLine.id}>
                    {cellLine.name} ({cellLine.species}
                    {cellLine.strain && ` - ${cellLine.strain}`})
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'plasmid' && (
            <div>
              <label htmlFor="specimen-source" className="block text-sm font-medium text-gray-700 mb-2">
                Plasmid *
              </label>
              <select
                id="specimen-source"
                value={formData.sourceId || 0}
                onChange={(e) => setFormData({ ...formData, sourceId: parseInt(e.target.value) || 0 })}
                required
                className="form-select"
              >
                <option value={0}>Select a plasmid</option>
                {plasmids.map((plasmid) => (
                  <option key={plasmid.id} value={plasmid.id}>
                    {plasmid.name}
                    {plasmid.insertName && ` - ${plasmid.insertName}`}
                    {plasmid.backbone && ` (${plasmid.backbone})`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'standard' && (
            <div>
              <label htmlFor="specimen-source" className="block text-sm font-medium text-gray-700 mb-2">
                Standard *
              </label>
              <select
                id="specimen-source"
                value={formData.sourceId || 0}
                onChange={(e) => setFormData({ ...formData, sourceId: parseInt(e.target.value) || 0 })}
                required
                className="form-select"
              >
                <option value={0}>Select a standard</option>
                {standards.map((standard) => (
                  <option key={standard.id} value={standard.id}>
                    {standard.name} ({standard.standardType})
                    {standard.manufacturer && ` - ${standard.manufacturer}`}
                    {standard.catalogNumber && ` ${standard.catalogNumber}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {formData.sourceType === 'subject' && (
            <div className="space-y-4">
              <div>
                <label htmlFor="specimen-study" className="block text-sm font-medium text-gray-700 mb-2">
                  Study *
                </label>
                <StudyPicker
                  value={formData.studyId || undefined}
                  onChange={(id) => {
                    const selectedStudy = studies.find(s => s.id === id)
                    setFormData({
                      ...formData,
                      studyId: id,
                      studyShortCode: selectedStudy?.shortCode || '',
                      sourceId: 0,
                      createNewSubject: false,
                    })
                  }}
                />
              </div>

              {formData.studyId > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="create-new-subject"
                      checked={formData.createNewSubject}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          createNewSubject: e.target.checked,
                          sourceId: 0,
                          subjectName: '',
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor="create-new-subject" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Create New Subject
                    </label>
                  </div>

                  {formData.createNewSubject ? (
                    <div>
                      <label htmlFor="new-subject-name" className="block text-sm font-medium text-gray-700 mb-2">
                        Subject Name *
                      </label>
                      <input
                        id="new-subject-name"
                        type="text"
                        value={formData.subjectName}
                        onChange={(e) =>
                          setFormData({ ...formData, subjectName: e.target.value })
                        }
                        required
                        className="form-input"
                        placeholder="Enter subject name"
                      />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="specimen-subject" className="block text-sm font-medium text-gray-700 mb-2">
                        Subject *
                      </label>
                      <select
                        id="specimen-subject"
                        value={formData.sourceId}
                        onChange={(e) => {
                          const selectedSubject = subjects.find(s => s.id === parseInt(e.target.value))
                          setFormData({
                            ...formData,
                            sourceId: parseInt(e.target.value),
                            subjectName: selectedSubject?.name || '',
                          })
                        }}
                        required
                        className="form-select"
                      >
                        <option value={0}>Select a subject</option>
                        {subjects
                          .slice()
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((subject) => (
                            <option key={subject.id} value={subject.id}>
                              {subject.name}
                              {typeof subject.specimenCount === 'number'
                                ? ` (${subject.specimenCount} specimens)`
                                : ''}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Specimen Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="specimen-type" className="block text-sm font-medium text-gray-700 mb-2">
              Specimen Type *
            </label>
            <select
              id="specimen-type"
              value={formData.specimenTypeName || formData.specimenTypeId || 0}
              onChange={(e) => {
                const selectedType = specimenTypes.find(t => t.id === parseInt(e.target.value) || t.name === e.target.value)
                setFormData({
                  ...formData,
                  specimenTypeId: selectedType?.id || 0,
                  specimenTypeName: selectedType?.name || '',
                })
              }}
              required
              className="form-select"
            >
              <option value={0}>Select a specimen type</option>
              {specimenTypes.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="collection-date" className="block text-sm font-medium text-gray-700 mb-2">
              Collection Date
            </label>
            <input
              id="collection-date"
              type="date"
              value={formData.collectionDate}
              onChange={(e) => setFormData({ ...formData, collectionDate: e.target.value })}
              className="form-input"
            />
          </div>
        </div>
      </div>

      <ContainerRegistration
        mode="optional"
        defaultValue={containerData || undefined}
        onChange={(data) => setContainerData(data)}
        onValidationChange={(isValid) => setContainerValid(isValid)}
      />

      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !containerValid}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Saving...' : specimen ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  )
}
