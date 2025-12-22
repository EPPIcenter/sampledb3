import { useState, useEffect } from 'react'

interface ReferenceDataFormProps<T> {
  item: T | null
  fields: Array<{
    key: keyof T
    label: string
    type?: 'text' | 'number' | 'textarea'
    required?: boolean
    options?: Array<{ value: any; label: string }>
    loadOptions?: () => Promise<Array<{ value: any; label: string }>>
  }>
  onSave: (data: Partial<T>) => Promise<void>
  onCancel: () => void
  title: string
}

export default function ReferenceDataForm<T extends { id?: number }>({
  item,
  fields,
  onSave,
  onCancel,
  title,
}: ReferenceDataFormProps<T>) {
  const [formData, setFormData] = useState<Partial<T>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldOptions, setFieldOptions] = useState<Record<string, Array<{ value: any; label: string }>>>({})
  const [loadingOptions, setLoadingOptions] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (item) {
      setFormData(item)
    } else {
      setFormData({})
    }
  }, [item])

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
      await onSave(formData)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key: keyof T, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">{title}</h2>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((field) => (
              <div key={String(field.key)}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={(formData[field.key] as string) || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    required={field.required}
                    className="form-textarea"
                    rows={3}
                  />
                ) : field.options || fieldOptions[String(field.key)] ? (
                  <select
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
                    required={field.required}
                    disabled={loadingOptions[String(field.key)]}
                    className="form-select disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select...</option>
                    {(field.options || fieldOptions[String(field.key)] || []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={(formData[field.key] as string | number) || ''}
                    onChange={(e) =>
                      handleChange(
                        field.key,
                        field.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
                      )
                    }
                    required={field.required}
                    className="form-input"
                  />
                )}
              </div>
            ))}

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
  )
}

