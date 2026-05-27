import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { setupApi } from '../lib/api/settings';// Types
type SpecimenTypeItem = { name: string; containerTypes?: string[] }
type UnitItem = { name: string; symbol: string; category: string }
// StateItem removed - status is now derived from remainingQuantity
type StorageTypeItem = { name: string; description: string; id?: string } // id temp for UI linkage
type LocationItem = { name: string; storageTypeId: string; description: string }
type StrainItem = { name: string; description: string }

// Container types available
const CONTAINER_TYPES = [
    { value: 'paper', label: 'Paper (DBS Sheet)' },
    { value: 'cryovial_tube', label: 'Cryovial Tube' },
    { value: 'micronix_tube', label: 'Micronix Tube' },
    { value: 'static_well', label: 'Static Well' },
] as const

// Import defaults from config
import {
    defaultSpecimenTypes as configDefaultSpecimenTypes,
    defaultUnits as configDefaultUnits,
    defaultStorageTypes as configDefaultStorageTypes,
} from '../config/setup-defaults'

// Map config types to frontend types
const defaultSpecimenTypes: SpecimenTypeItem[] = configDefaultSpecimenTypes.map((st: { name: string; containerTypes?: string[] }) => ({
    name: st.name,
    containerTypes: st.containerTypes || []
}))

const defaultUnits: UnitItem[] = configDefaultUnits

const defaultStorageTypes: StorageTypeItem[] = configDefaultStorageTypes

export default function Setup() {
    const navigate = useNavigate()
    const [step, setStep] = useState(1)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Admin Data
    const [adminData, setAdminData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    })

    // Config Data
    const [specimenTypes, setSpecimenTypes] = useState<SpecimenTypeItem[]>(defaultSpecimenTypes)
    const [units, setUnits] = useState<UnitItem[]>(defaultUnits)

    // Infrastructure Data
    const [storageTypes, setStorageTypes] = useState<StorageTypeItem[]>(defaultStorageTypes)
    const [locations, setLocations] = useState<LocationItem[]>([]) // Start empty, user defines roots

    // Biology Data
    const [strains, setStrains] = useState<StrainItem[]>([])

    // Check status on mount
    useEffect(() => {
        setupApi.status()
            .then(res => {
                if (res.data.initialized) navigate('/')
            })
            .catch((err) => {
                console.error('Failed to check setup status:', err)
                // Show error to user
                setError(err?.response?.data?.error || err?.message || 'Failed to check system status')
            })
    }, [navigate])

    const handleSubmit = async () => {
        setError(null)
        setLoading(true)

        try {
            const payload = {
                adminName: adminData.name,
                adminEmail: adminData.email,
                adminPassword: adminData.password,
                specimenTypes,
                units,
                storageTypes,
                locations,
                strains,
            }

            await setupApi.initialize(payload)
            navigate('/login', { state: { fromSetup: true } })
        } catch (err: any) {
            setError(err.response?.data?.error || err.message || 'Setup failed')
            setLoading(false)
        }
    }

    const nextStep = () => setStep(s => s + 1)
    const prevStep = () => setStep(s => s - 1)

    // Validation for Step 1
    const isStep1Valid = adminData.name && adminData.email && adminData.password && adminData.password === adminData.confirmPassword && adminData.password.length >= 8
    
    // Validation for Step 2 - ensure required data exists
    const isStep2Valid = specimenTypes.length > 0 && units.length > 0
    
    // Validation for Step 3 - storage types required
    const isStep3Valid = storageTypes.length > 0

    return (
        <div className="min-h-screen bg-app-surface flex flex-col py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="text-center text-3xl font-extrabold text-app-text">
                    Welcome to SampleDB
                </h2>
                <div className="mt-2 flex justify-center space-x-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-2 w-8 rounded ${step >= i ? 'bg-app-accent' : 'bg-app-surface'}`} />
                    ))}
                </div>
                <p className="mt-2 text-center text-sm text-app-text-muted">
                    Step {step} of 4: {
                        step === 1 ? 'Admin Account' :
                            step === 2 ? 'Core Definitions' :
                                step === 3 ? 'Lab Infrastructure' :
                                    'Biology (Optional)'
                    }
                </p>
                <p className="mt-1 text-center text-sm">
                  <a href="/docs/guides/getting-started/setup/" className="text-app-accent hover:text-app-accent-hover hover:underline">
                    Setup guide
                  </a>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-4xl">
                <div className="bg-app-card py-8 px-4 shadow sm:rounded-lg sm:px-10">

                    {error && (
                        <div className="mb-4 rounded-md bg-app-trend-down/10 p-4">
                            <h3 className="text-sm font-medium text-app-trend-down">{error}</h3>
                        </div>
                    )}

                    {/* STEP 1: ADMIN */}
                    {step === 1 && (
                        <div className="space-y-4 max-w-md mx-auto">
                            <h3 className="text-lg font-medium text-app-text">Create Administrator</h3>
                            <Input label="Full Name" name="name" value={adminData.name} onChange={(v: string) => setAdminData({ ...adminData, name: v })} required />
                            <Input label="Email Address" name="email" type="email" value={adminData.email} onChange={(v: string) => setAdminData({ ...adminData, email: v })} required />
                            <Input label="Password" name="password" type="password" value={adminData.password} onChange={(v: string) => setAdminData({ ...adminData, password: v })} required minLength={8} />
                            <Input label="Confirm Password" name="confirmPassword" type="password" value={adminData.confirmPassword} onChange={(v: string) => setAdminData({ ...adminData, confirmPassword: v })} required />
                        </div>
                    )}

                    {/* STEP 2: CORE DEFINITIONS */}
                    {step === 2 && (
                        <div className="space-y-8">
                            <SpecimenTypeEditor
                                title="Specimen Types"
                                description="What kind of samples will you collect? Select allowed container types for each."
                                items={specimenTypes}
                                onUpdate={setSpecimenTypes}
                            />
                            <ListEditor
                                title="Units"
                                description="Measurement units."
                                items={units}
                                onUpdate={setUnits}
                                fields={[
                                    { name: 'name', placeholder: 'Name (e.g. Milliliter)' },
                                    { name: 'symbol', placeholder: 'Symbol (e.g. mL)', width: 'w-24' },
                                    { name: 'category', placeholder: 'Category (e.g. volume)', width: 'w-32' },
                                ]}
                            />
                            <div className="bg-app-accent-muted border border-app-accent rounded-lg p-4">
                                <p className="text-sm text-app-accent-hover">
                                    <strong>Note:</strong> Container status is automatically determined by remaining quantity. 
                                    Containers with remaining quantity &gt; 0 are "In Use", otherwise "Exhausted".
                                </p>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: INFRASTRUCTURE */}
                    {step === 3 && (
                        <div className="space-y-8">
                            <ListEditor
                                title="Storage Types"
                                description="Types of storage equipment (Freezers, Fridges, etc.)"
                                items={storageTypes}
                                onUpdate={setStorageTypes}
                                fields={[
                                    { name: 'name', placeholder: 'Name (e.g. -80 Freezer)' },
                                    { name: 'description', placeholder: 'Description', width: 'flex-1' },
                                ]}
                            />

                            <div className="border-t pt-6">
                                <h3 className="text-lg font-medium text-app-text">Root Locations</h3>
                                <p className="text-sm text-app-text-muted mb-4">Define your top-level locations (Buildings, Rooms, or major Freezers).</p>

                                {locations.length === 0 && (
                                    <div className="text-sm text-app-text-muted italic mb-4">No locations defined. You can add them later.</div>
                                )}

                                <ul className="space-y-2 mb-4">
                                    {locations.map((loc, idx) => (
                                        <li key={idx} className="flex gap-2 items-center bg-app-surface p-2 rounded">
                                            <span className="font-medium flex-1">{loc.name}</span>
                                            <span className="text-sm text-app-text-muted bg-app-surface px-2 rounded">{loc.storageTypeId || 'N/A'}</span>
                                            <span className="text-sm text-app-text-muted">{loc.description}</span>
                                            <button onClick={() => setLocations(locations.filter((_, i) => i !== idx))} className="text-app-trend-down hover:text-app-trend-down/80 font-bold px-2">
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                <div className="flex gap-2 items-end bg-app-surface p-3 rounded border">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-app-text mb-1">Name</label>
                                        <input id="newLocName" className="w-full text-sm border-app-border rounded-md" placeholder="e.g. Lab 101" />
                                    </div>
                                    <div className="w-1/3">
                                        <label className="block text-xs font-medium text-app-text mb-1">Type</label>
                                        <select id="newLocType" className="w-full text-sm border-app-border rounded-md">
                                            <option value="">Select Type...</option>
                                            {storageTypes.map(st => <option key={st.name} value={st.name}>{st.name}</option>)}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        className="mb-[1px] inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-app-accent hover:bg-app-accent-hover"
                                        onClick={(e) => {
                                            const nameInput = document.getElementById('newLocName') as HTMLInputElement
                                            const typeInput = document.getElementById('newLocType') as HTMLSelectElement
                                            if (nameInput.value /* allow empty type */) {
                                                setLocations([...locations, {
                                                    name: nameInput.value,
                                                    storageTypeId: typeInput.value,
                                                    description: ''
                                                }])
                                                nameInput.value = ''
                                                typeInput.value = ''
                                            }
                                        }}
                                    >
                                        Add
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: BIOLOGY */}
                    {step === 4 && (
                        <div className="space-y-8">
                            <ListEditor
                                title="Strains"
                                description="Bacterial or Viral strains (Optional)"
                                items={strains}
                                onUpdate={setStrains}
                                fields={[
                                    { name: 'name', placeholder: 'Name (e.g. E. coli K12)' },
                                    { name: 'description', placeholder: 'Description', width: 'flex-1' },
                                ]}
                            />
                            
                        </div>
                    )}

                    {/* NAVIGATION */}
                    <div className="mt-8 flex justify-between border-t border-app-border pt-5">
                        {step > 1 ? (
                            <button onClick={prevStep} className="bg-app-card py-2 px-4 border border-app-border rounded-md shadow-sm text-sm font-medium text-app-text hover:bg-app-surface">
                                Back
                            </button>
                        ) : <div></div>}

                        {step < 4 ? (
                            <button
                                onClick={nextStep}
                                disabled={
                                    (step === 1 && !isStep1Valid) ||
                                    (step === 2 && !isStep2Valid) ||
                                    (step === 3 && !isStep3Valid)
                                }
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-app-accent hover:bg-app-accent-hover disabled:opacity-50"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-app-trend-up hover:bg-app-trend-up/90 disabled:opacity-50"
                            >
                                {loading ? 'Initializing...' : 'Finish Setup'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// Helpers

function SpecimenTypeEditor({ title, description, items, onUpdate }: {
    title: string,
    description: string,
    items: SpecimenTypeItem[],
    onUpdate: (items: SpecimenTypeItem[]) => void,
}) {
    const [newItem, setNewItem] = useState<SpecimenTypeItem>({ name: '', containerTypes: [] })
    const listRef = useRef<HTMLUListElement>(null)
    const prevItemsLengthRef = useRef(items.length)

    // Scroll to bottom when new items are added
    useEffect(() => {
        if (items.length > prevItemsLengthRef.current && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
        }
        prevItemsLengthRef.current = items.length
    }, [items.length])

    const handleAdd = () => {
        if (!newItem.name) return
        onUpdate([...items, { ...newItem, containerTypes: newItem.containerTypes || [] }])
        setNewItem({ name: '', containerTypes: [] })
    }

    const handleToggleContainerType = (itemIndex: number | null, containerType: string) => {
        if (itemIndex === null) {
            // Toggle for new item
            const currentTypes = newItem.containerTypes || []
            const newTypes = currentTypes.includes(containerType)
                ? currentTypes.filter(ct => ct !== containerType)
                : [...currentTypes, containerType]
            setNewItem({ ...newItem, containerTypes: newTypes })
        } else {
            // Toggle for existing item
            const updatedItems = [...items]
            const currentTypes = updatedItems[itemIndex].containerTypes || []
            const newTypes = currentTypes.includes(containerType)
                ? currentTypes.filter(ct => ct !== containerType)
                : [...currentTypes, containerType]
            updatedItems[itemIndex] = { ...updatedItems[itemIndex], containerTypes: newTypes }
            onUpdate(updatedItems)
        }
    }

    return (
        <div>
            <h4 className="text-sm font-bold text-app-text">{title}</h4>
            <p className="text-xs text-app-text-muted mb-2">{description}</p>

            <ul ref={listRef} className="space-y-1.5 mb-3 max-h-80 overflow-y-auto">
                {items.length === 0 && <li className="text-xs text-app-text-muted italic py-2">No items defined</li>}
                {items.map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm p-1.5 bg-app-surface rounded border border-app-border hover:bg-app-surface">
                        <span className="font-medium min-w-[140px]">{item.name}</span>
                        <div className="flex-1 flex flex-wrap gap-1 items-center">
                            {CONTAINER_TYPES.map(ct => {
                                const isSelected = (item.containerTypes || []).includes(ct.value)
                                return (
                                    <button
                                        key={ct.value}
                                        type="button"
                                        onClick={() => handleToggleContainerType(idx, ct.value)}
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                            isSelected
                                                ? 'bg-app-accent text-white hover:bg-app-accent-hover'
                                                : 'bg-app-surface text-app-text-muted hover:bg-app-surface'
                                        }`}
                                        title={isSelected ? 'Click to remove' : 'Click to add'}
                                    >
                                        {ct.label}
                                    </button>
                                )
                            })}
                        </div>
                        <button 
                            onClick={() => onUpdate(items.filter((_, i) => i !== idx))} 
                            className="text-app-text-muted hover:text-app-trend-down font-bold px-1.5 text-lg leading-none"
                            title="Remove"
                        >
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            <div className="border-t pt-2 space-y-2">
                <div className="flex gap-2 items-center">
                    <input
                        className="flex-1 text-xs border-app-border rounded focus:ring-app-accent focus:border-app-accent p-1.5 shadow-sm"
                        placeholder="Specimen type name (e.g. Blood)"
                        value={newItem.name}
                        onChange={e => setNewItem({ ...newItem, name: e.target.value })}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                    <button
                        onClick={handleAdd}
                        disabled={!newItem.name}
                        className="p-1.5 border border-transparent rounded bg-app-accent-muted text-app-accent-hover hover:bg-app-accent-muted/80 disabled:opacity-50 font-bold px-2 text-sm"
                    >
                        +
                    </button>
                </div>
                {newItem.name && (
                    <div className="flex flex-wrap gap-1.5 pl-1">
                        <span className="text-xs text-app-text-muted self-center mr-1">Containers:</span>
                        {CONTAINER_TYPES.map(ct => {
                            const isSelected = (newItem.containerTypes || []).includes(ct.value)
                            return (
                                <button
                                    key={ct.value}
                                    type="button"
                                    onClick={() => handleToggleContainerType(null, ct.value)}
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                        isSelected
                                            ? 'bg-app-accent text-white hover:bg-app-accent-hover'
                                            : 'bg-app-surface text-app-text-muted hover:bg-app-surface'
                                    }`}
                                >
                                    {ct.label}
                                </button>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}

function Input({ label, onChange, ...props }: any) {
    const inputId = props.id || props.name || `input-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-app-text">{label}</label>
            <input 
                id={inputId} 
                className="mt-1 appearance-none block w-full px-3 py-2 border border-app-border rounded-md shadow-sm focus:ring-app-accent focus:border-app-accent sm:text-sm" 
                onChange={(e) => onChange?.(e.target.value)}
                {...props} 
            />
        </div>
    )
}

function ListEditor({ title, description, items, onUpdate, fields }: {
    title: string,
    description: string,
    items: any[],
    onUpdate: (items: any[]) => void,
    fields: { name: string, placeholder?: string, width?: string }[]
}) {
    const [newItem, setNewItem] = useState<any>({})
    const listRef = useRef<HTMLUListElement>(null)
    const prevItemsLengthRef = useRef(items.length)

    // Scroll to bottom when new items are added
    useEffect(() => {
        if (items.length > prevItemsLengthRef.current && listRef.current) {
            listRef.current.scrollTop = listRef.current.scrollHeight
        }
        prevItemsLengthRef.current = items.length
    }, [items.length])

    const handleAdd = () => {
        // Validate at least first field exists
        if (!newItem[fields[0].name]) return
        onUpdate([...items, newItem])
        setNewItem({})
        // Refocus first input? 
    }

    const handleChange = (field: string, value: string) => {
        setNewItem({ ...newItem, [field]: value })
    }

    return (
        <div>
            <h4 className="text-sm font-bold text-app-text">{title}</h4>
            <p className="text-xs text-app-text-muted mb-2">{description}</p>

            <ul ref={listRef} className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {items.length === 0 && <li className="text-xs text-app-text-muted italic">No items defined</li>}
                {items.map((item, idx) => (
                    <li key={idx} className="flex gap-2 items-center text-sm p-1 bg-app-surface rounded border border-app-border">
                        {fields.map(f => (
                            <span key={f.name} className={`${f.width || 'flex-1'} truncate px-1`} title={item[f.name]}>
                                {item[f.name]}
                            </span>
                        ))}
                        <button onClick={() => onUpdate(items.filter((_, i) => i !== idx))} className="text-app-text-muted hover:text-app-trend-down font-bold px-2">
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            <div className="flex gap-2 items-center">
                {fields.map(f => (
                    <input
                        key={f.name}
                        className={`${f.width || 'flex-1'} text-xs border-app-border rounded focus:ring-app-accent focus:border-app-accent p-1.5 shadow-sm`}
                        placeholder={f.placeholder || f.name}
                        value={newItem[f.name] || ''}
                        onChange={e => handleChange(f.name, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                ))}
                <button
                    onClick={handleAdd}
                    disabled={!newItem[fields[0].name]}
                    className="p-1.5 border border-transparent rounded bg-app-accent-muted text-app-accent-hover hover:bg-app-accent-muted/80 disabled:opacity-50 font-bold px-2"
                >
                    +
                </button>
            </div>
        </div>
    )
}

// Composition Editor Component
interface CompositionItem {
  label: string
  strains: CompositionStrainItem[]
}

interface CompositionStrainItem {
  strainId: number
  percentage: number
}

// Internal representation for UI (uses strain names)
interface CompositionStrainItemUI {
  strainName: string
  percentage: number
}

function CompositionEditor({ strains, onAdd }: { strains: StrainItem[], onAdd: (comp: CompositionItem) => void }) {
    const [label, setLabel] = useState('')
    const [compositionStrains, setCompositionStrains] = useState<CompositionStrainItemUI[]>([])
    const [selectedStrain, setSelectedStrain] = useState('')
    const [percentage, setPercentage] = useState('')

    // Get available strains (not already added)
    const availableStrains = strains.filter(s => 
        !compositionStrains.some(cs => cs.strainName === s.name)
    )

    const handleAddStrain = () => {
        if (!selectedStrain || !percentage) return
        const pct = parseFloat(percentage)
        if (isNaN(pct) || pct <= 0 || pct > 100) {
            alert('Percentage must be between 0 and 100')
            return
        }
        
        // Check if strain is already added
        if (compositionStrains.some(cs => cs.strainName === selectedStrain)) {
            alert('This strain is already in the composition')
            return
        }
        
        const total = compositionStrains.reduce((sum, s) => sum + s.percentage, 0) + pct
        if (total > 100) {
            alert(`Total percentage cannot exceed 100% (currently ${(total - pct).toFixed(1)}%, adding ${pct.toFixed(1)}% would make ${total.toFixed(1)}%)`)
            return
        }
        
        setCompositionStrains([...compositionStrains, { strainName: selectedStrain, percentage: pct }])
        setSelectedStrain('')
        setPercentage('')
    }

    const handleRemoveStrain = (strainName: string) => {
        setCompositionStrains(compositionStrains.filter(cs => cs.strainName !== strainName))
    }

    const handleAddComposition = () => {
        if (!label || compositionStrains.length === 0) return
        const total = compositionStrains.reduce((sum, s) => sum + s.percentage, 0)
        if (Math.abs(total - 100) > 0.01) {
            alert(`Total percentage must equal 100% (currently ${total.toFixed(2)}%)`)
            return
        }
        
        // Convert strain names to IDs (for now, use -1 as placeholder since strains are created during setup)
        // The actual conversion should happen when submitting to the backend
        const strainsWithIds: CompositionStrainItem[] = compositionStrains.map(cs => ({
            strainId: -1, // Placeholder - will need to be resolved when submitting
            percentage: cs.percentage
        }))
        
        onAdd({
            label,
            strains: strainsWithIds
        })
        setLabel('')
        setCompositionStrains([])
    }

    const totalPercentage = compositionStrains.reduce((sum, s) => sum + s.percentage, 0)
    const isTotalValid = Math.abs(totalPercentage - 100) < 0.01

    return (
        <div className="space-y-3 border border-app-border rounded p-3 bg-app-card">
            <div>
                <label className="block text-xs font-medium text-app-text mb-1">Composition Label</label>
                <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Mixed Strain Control"
                    className="w-full text-sm border-app-border rounded-md p-1.5"
                />
            </div>
            
            {/* Display added strains */}
            {compositionStrains.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-app-text">Strains in Composition:</div>
                    <ul className="space-y-1 max-h-32 overflow-y-auto bg-app-surface rounded p-2">
                        {compositionStrains.map((cs, idx) => (
                            <li key={idx} className="flex items-center justify-between text-xs bg-app-card p-2 rounded border border-app-border">
                                <span className="flex-1">
                                    <span className="font-medium">{cs.strainName}</span>
                                    <span className="text-app-text-muted ml-2">{cs.percentage}%</span>
                                </span>
                                <button
                                    onClick={() => handleRemoveStrain(cs.strainName)}
                                    className="text-app-trend-down hover:text-app-trend-down/80 font-bold px-2"
                                    title="Remove strain"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className={`text-xs font-medium ${isTotalValid ? 'text-app-trend-up' : 'text-app-trend-down'}`}>
                        Total: {totalPercentage.toFixed(2)}% {isTotalValid ? '✓' : `(need ${(100 - totalPercentage).toFixed(2)}% more)`}
                    </div>
                </div>
            )}
            
            {/* Add strain form */}
            <div className="space-y-2 border-t pt-2">
                <div className="text-xs font-medium text-app-text">Add Strain:</div>
                <div className="flex gap-2">
                    <select
                        value={selectedStrain}
                        onChange={e => setSelectedStrain(e.target.value)}
                        className="flex-1 text-sm border-app-border rounded-md p-1.5"
                        disabled={availableStrains.length === 0}
                    >
                        <option value="">
                            {strains.length === 0 
                                ? 'No strains available (add strains above first)' 
                                : availableStrains.length === 0
                                ? 'All strains added'
                                : 'Select Strain...'}
                        </option>
                        {availableStrains.map(s => (
                            <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                    </select>
                    <input
                        type="number"
                        value={percentage}
                        onChange={e => setPercentage(e.target.value)}
                        placeholder="%"
                        min="0"
                        max="100"
                        step="0.1"
                        className="w-24 text-sm border-app-border rounded-md p-1.5"
                        disabled={!selectedStrain}
                    />
                    <button
                        onClick={handleAddStrain}
                        disabled={!selectedStrain || !percentage || availableStrains.length === 0}
                        className="px-3 py-1.5 text-xs bg-app-accent-muted text-app-accent-hover rounded hover:bg-blue-200 disabled:opacity-50"
                    >
                        Add
                    </button>
                </div>
            </div>
            
            <button
                onClick={handleAddComposition}
                disabled={!label || compositionStrains.length === 0 || !isTotalValid}
                className="w-full px-3 py-2 text-sm bg-app-trend-up/10 text-app-trend-up rounded hover:bg-app-trend-up/20 disabled:opacity-50"
            >
                Add Composition
            </button>
        </div>
    )
}
