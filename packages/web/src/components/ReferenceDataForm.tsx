import { useState, useEffect, useRef } from 'react'
import { useModifierHotkey, useHotkey } from '../hooks/useHotkey'
import ModalPortal from './ModalPortal'

interface ReferenceDataFormProps<T> {
  item: T | null
  fields: Array<{
    key: keyof T
    label: string
    type?: 'text' | 'number' | 'textarea' | 'select' | 'checkbox' | 'custom'
    required?: boolean | ((formData: any) => boolean)
    hidden?: (formData: any) => boolean
    disabled?: (formData: any) => boolean
    options?: Array<{ value: any; label: string }>
    loadOptions?: () => Promise<Array<{ value: any; label: string }>>
    render?: (value: any, formData: any, onChange: (value: any) => void) => React.ReactNode
  }>
  onSave: (data: Partial<T>) => Promise<void>
  onCancel: () => void
  title: string
  /** Optional class for the modal root when opened from a themed page (e.g. Reference Data). */
  modalClassName?: string
}

export default function ReferenceDataForm<T extends { id?: number }>({
  item,
  fields,
  onSave,
  onCancel,
  title,
  modalClassName,
}: ReferenceDataFormProps<T>) {
  const [formData, setFormData] = useState<Partial<T>>(() => ({ ...(item ?? {}) } as Partial<T>))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldOptions, setFieldOptions] = useState<Record<string, Array<{ value: any; label: string }>>>({})
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({})
  const prevItemIdRef = useRef<number | undefined | null>(item?.id ?? null)

  // Sync form when item prop changes (during render to avoid extra pass). Parents can use key={item?.id} when switching items.
  if ((item?.id ?? null) !== prevItemIdRef.current) {
    prevItemIdRef.current = item?.id ?? null
    setFormData({ ...(item ?? {}) } as Partial<T>)
  }

  useEffect(() => {
    // Load async options for fields that have loadOptions
    const loadAsyncOptions = async () => {
      const optionsToLoad: Array<{ key: string; loader: () => Promise<Array<{ value: any; label: string }>> }> = []
      
      fields.forEach((field) => {
        if (field.loadOptions) {
          optionsToLoad.push({
            key: String(field.key),
            loader: field.loadOptions,
          })
        }
      })

      if (optionsToLoad.length > 0) {
        setLoadingOptions((prev) => {
          const newState = { ...prev }
          optionsToLoad.forEach(({ key }) => {
            newState[key] = true
          })
          return newState
        })

        try {
          const results = await Promise.all(
            optionsToLoad.map(({ key, loader }) => loader().then((options) => ({ key, options })))
          )

          const newOptions: Record<string, Array<{ value: any; label: string }>> = {}
          results.forEach(({ key, options }) => {
            newOptions[key] = options
          })

          setFieldOptions((prev) => ({ ...prev, ...newOptions }))
        } catch (error) {
          console.error('Failed to load options:', error)
        } finally {
          setLoadingOptions((prev) => {
            const newState = { ...prev }
            optionsToLoad.forEach(({ key }) => {
              newState[key] = false
            })
            return newState
          })
        }
      }
    }

    loadAsyncOptions()
  }, [fields])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Prepare data for submission
      const submitData: any = { ...formData }
      
      // Special handling for location form
      // Convert parentId from string to number if it's set, or null if empty
      if (submitData.parentId !== undefined && submitData.parentId !== null && submitData.parentId !== '') {
        // Convert string to number if needed
        submitData.parentId = typeof submitData.parentId === 'string' ? parseInt(submitData.parentId, 10) : submitData.parentId
        // Clear storageTypeId when parentId is set (storage type is inferred from parent)
        // Explicitly set to null (not undefined) so backend knows to clear it
        submitData.storageTypeId = null
      } else {
        // No parent selected - this is a root location
        submitData.parentId = null
        // For root locations, storageTypeId should be set (required by backend)
        // If it's undefined or empty string, remove it so validation error is clear
        if (submitData.storageTypeId === '' || submitData.storageTypeId === undefined) {
          delete submitData.storageTypeId
        }
      }
      
      await onSave(submitData)
    } catch (err: any) {
      // Extract error message from various possible error formats
      const errorMessage = err.response?.data?.error || 
                          (err.response?.data?.details && 
                           (Array.isArray(err.response.data.details) 
                             ? err.response.data.details.map((d: any) => d.message || d).join(', ')
                             : err.response.data.details)) ||
                          err.message ||
                          'Failed to save'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }
  
  // Helper function to check if a field is required
  const isFieldRequired = (field: typeof fields[0]): boolean => {
    if (typeof field.required === 'function') {
      return field.required(formData)
    }
    return field.required ?? false
  }
  
  // Helper function to check if a field should be hidden
  const isFieldHidden = (field: typeof fields[0]): boolean => {
    if (field.hidden) {
      return field.hidden(formData)
    }
    return false
  }
  
  // Helper function to check if a field should be disabled
  const isFieldDisabled = (field: typeof fields[0]): boolean => {
    if (field.disabled) {
      return field.disabled(formData)
    }
    return false
  }

  const handleChange = (key: keyof T, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [key]: value }
      
      // Special handling for location form: clear storageTypeId when parentId is set
      if (key === 'parentId') {
        if (value && value !== '' && value !== null && value !== undefined) {
          // If parent is selected, clear storageTypeId (it will be inferred from parent)
          ;(updated as any).storageTypeId = undefined
        }
      }
      
      return updated
    })
  }

  const formRef = useRef<HTMLFormElement>(null)

  // Escape to cancel
  useHotkey('escape', () => {
    onCancel()
  }, { preventDefault: true })

  // Cmd/Ctrl+Enter to submit
  useModifierHotkey('enter', (e) => {
    if (!loading && formRef.current) {
      e.preventDefault()
      formRef.current.requestSubmit()
    }
  }, { preventDefault: true, enableOnFormTags: true })

  return (
    <ModalPortal>
      <div
        className={
          modalClassName
            ? `fixed inset-0 z-[100] overflow-y-auto ${modalClassName}`.trim()
            : 'fixed inset-0 z-[100] overflow-y-auto'
        }
      >
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          {/* Background overlay */}
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-md"
            onClick={onCancel}
          />
        
        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full sm:max-h-[90vh]">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-y-auto max-h-[90vh]">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => {
              const fieldId = `field-${String(field.key)}`
              const isRequired = isFieldRequired(field)
              const isHidden = isFieldHidden(field)
              const isDisabled = isFieldDisabled(field) || loadingOptions[String(field.key)]
              
              // Skip rendering hidden fields
              if (isHidden) {
                return null
              }
              
              return (
                <div key={String(field.key)}>
                  <label htmlFor={fieldId} className="block text-sm font-medium text-gray-700 mb-2">
                    {field.label}
                    {isRequired && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  {field.type === 'custom' && field.render ? (
                    field.render(formData[field.key], formData, (value) => handleChange(field.key, value))
                  ) : field.type === 'textarea' ? (
                    <textarea
                      id={fieldId}
                      value={(formData[field.key] as string) || ''}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      required={isRequired}
                      disabled={isDisabled}
                      className="form-textarea disabled:bg-gray-100 disabled:cursor-not-allowed"
                      rows={3}
                    />
                  ) : field.options || fieldOptions[String(field.key)] ? (
                    <select
                      id={fieldId}
                      value={formData[field.key] === null || formData[field.key] === undefined ? '' : String(formData[field.key])}
                      onChange={(e) => {
                        const value = e.target.value
                        if (field.type === 'number') {
                          // For optional number fields, use null instead of undefined so updates can clear the value
                          handleChange(field.key, value === '' ? null : parseInt(value))
                        } else {
                          handleChange(field.key, value === '' ? undefined : value)
                        }
                      }}
                      required={isRequired}
                      disabled={isDisabled}
                      className="form-select disabled:bg-gray-100 disabled:cursor-not-allowed"
                    >
                      <option value="">Select...</option>
                      {(field.options || fieldOptions[String(field.key)] || []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input
                      id={fieldId}
                      type="checkbox"
                      checked={!!formData[field.key]}
                      onChange={(e) => handleChange(field.key, e.target.checked)}
                      disabled={isDisabled}
                      className="form-checkbox disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  ) : (
                    <input
                      id={fieldId}
                      type={field.type || 'text'}
                      value={(formData[field.key] as string | number) || ''}
                      onChange={(e) =>
                        handleChange(
                          field.key,
                          field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                        )
                      }
                      required={isRequired}
                      disabled={isDisabled}
                      className="form-input disabled:bg-gray-100 disabled:cursor-not-allowed"
                    />
                  )}
                </div>
              )
            })}

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Saving...' : item ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

