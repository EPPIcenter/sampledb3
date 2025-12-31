import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

// Types
type SpecimenTypeItem = { name: string }
type UnitItem = { name: string; symbol: string; category: string }
// StateItem removed - status is now derived from remainingQuantity
type StorageTypeItem = { name: string; description: string; id?: string } // id temp for UI linkage
type LocationItem = { name: string; storageTypeId: string; description: string }
type StrainItem = { name: string; description: string }
type CompositionStrainItem = { strainName: string; percentage: number }
type CompositionItem = { label: string; index?: number; legacy: number; strains: CompositionStrainItem[] }

// Defaults
const defaultSpecimenTypes: SpecimenTypeItem[] = [
    { name: 'Blood' }, { name: 'Plasma' }, { name: 'Serum' }, { name: 'Saliva' }, { name: 'DNA' }
]
const defaultUnits: UnitItem[] = [
    { name: 'Milliliter', symbol: 'mL', category: 'volume' },
    { name: 'Microliter', symbol: 'µL', category: 'volume' },
    { name: 'Gram', symbol: 'g', category: 'mass' },
    { name: 'Count', symbol: 'cnt', category: 'count' }
]
// States removed - status is now derived from remainingQuantity (In Use/Exhausted)
const defaultStorageTypes: StorageTypeItem[] = [
    { name: 'Freezer -80°C', description: 'Ultra-low temperature freezer' },
    { name: 'Freezer -20°C', description: 'Standard freezer' },
    { name: 'Refrigerator 4°C', description: 'Standard fridge' },
    { name: 'Room Temperature', description: 'Ambient storage' }
]

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
    const [compositions, setCompositions] = useState<CompositionItem[]>([])

    // Check status on mount
    useEffect(() => {
        fetch('/api/setup/status')
            .then(res => res.json())
            .then(data => {
                if (data.initialized) navigate('/')
            })
            .catch(console.error)
    }, [navigate])

    const handleSubmit = async () => {
        setError(null)
        setLoading(true)

        try {
            const payload = {
                adminName: adminData.name,
                adminEmail: adminData.email,
                adminPassword: adminData.password,
                seedData: false, // We exist as the source of truth now
                specimenTypes,
                units,
                storageTypes,
                locations,
                strains,
                compositions: compositions.length > 0 ? compositions : undefined
            }

            const response = await fetch('/api/setup/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.message || err.error || 'Setup failed')
            }

            navigate('/')
        } catch (err: any) {
            setError(err.message)
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
        <div className="min-h-screen bg-gray-50 flex flex-col py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <h2 className="text-center text-3xl font-extrabold text-gray-900">
                    Welcome to SampleDB
                </h2>
                <div className="mt-2 flex justify-center space-x-2">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className={`h-2 w-8 rounded ${step >= i ? 'bg-blue-600' : 'bg-gray-200'}`} />
                    ))}
                </div>
                <p className="mt-2 text-center text-sm text-gray-600">
                    Step {step} of 4: {
                        step === 1 ? 'Admin Account' :
                            step === 2 ? 'Core Definitions' :
                                step === 3 ? 'Lab Infrastructure' :
                                    'Biology (Optional)'
                    }
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-4xl">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">

                    {error && (
                        <div className="mb-4 rounded-md bg-red-50 p-4">
                            <h3 className="text-sm font-medium text-red-800">{error}</h3>
                        </div>
                    )}

                    {/* STEP 1: ADMIN */}
                    {step === 1 && (
                        <div className="space-y-4 max-w-md mx-auto">
                            <h3 className="text-lg font-medium text-gray-900">Create Administrator</h3>
                            <Input label="Full Name" name="name" value={adminData.name} onChange={v => setAdminData({ ...adminData, name: v })} required />
                            <Input label="Email Address" name="email" type="email" value={adminData.email} onChange={v => setAdminData({ ...adminData, email: v })} required />
                            <Input label="Password" name="password" type="password" value={adminData.password} onChange={v => setAdminData({ ...adminData, password: v })} required minLength={8} />
                            <Input label="Confirm Password" name="confirmPassword" type="password" value={adminData.confirmPassword} onChange={v => setAdminData({ ...adminData, confirmPassword: v })} required />
                        </div>
                    )}

                    {/* STEP 2: CORE DEFINITIONS */}
                    {step === 2 && (
                        <div className="space-y-8">
                            <ListEditor
                                title="Specimen Types"
                                description="What kind of samples will you collect?"
                                items={specimenTypes}
                                onUpdate={setSpecimenTypes}
                                fields={[{ name: 'name', placeholder: 'e.g. Blood' }]}
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
                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                                <p className="text-sm text-blue-800">
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
                                <h3 className="text-lg font-medium text-gray-900">Root Locations</h3>
                                <p className="text-sm text-gray-500 mb-4">Define your top-level locations (Buildings, Rooms, or major Freezers).</p>

                                {locations.length === 0 && (
                                    <div className="text-sm text-gray-500 italic mb-4">No locations defined. You can add them later.</div>
                                )}

                                <ul className="space-y-2 mb-4">
                                    {locations.map((loc, idx) => (
                                        <li key={idx} className="flex gap-2 items-center bg-gray-50 p-2 rounded">
                                            <span className="font-medium flex-1">{loc.name}</span>
                                            <span className="text-sm text-gray-600 bg-gray-200 px-2 rounded">{loc.storageTypeId || 'N/A'}</span>
                                            <span className="text-sm text-gray-500">{loc.description}</span>
                                            <button onClick={() => setLocations(locations.filter((_, i) => i !== idx))} className="text-red-600 hover:text-red-800 font-bold px-2">
                                                ×
                                            </button>
                                        </li>
                                    ))}
                                </ul>

                                <div className="flex gap-2 items-end bg-gray-50 p-3 rounded border">
                                    <div className="flex-1">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Name</label>
                                        <input id="newLocName" className="w-full text-sm border-gray-300 rounded-md" placeholder="e.g. Lab 101" />
                                    </div>
                                    <div className="w-1/3">
                                        <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                                        <select id="newLocType" className="w-full text-sm border-gray-300 rounded-md">
                                            <option value="">Select Type...</option>
                                            {storageTypes.map(st => <option key={st.name} value={st.name}>{st.name}</option>)}
                                        </select>
                                    </div>
                                    <button
                                        type="button"
                                        className="mb-[1px] inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
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
                            
                            <div className="border-t pt-6">
                                <h4 className="text-sm font-bold text-gray-900 mb-2">Compositions (Optional)</h4>
                                <p className="text-xs text-gray-500 mb-4">Define strain compositions for control definitions. Requires strains to be defined above.</p>
                                
                                {compositions.length === 0 && (
                                    <div className="text-sm text-gray-500 italic mb-4">No compositions defined. You can add them later.</div>
                                )}
                                
                                <ul className="space-y-3 mb-4 max-h-64 overflow-y-auto">
                                    {compositions.map((comp, idx) => (
                                        <li key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                                            <div className="flex justify-between items-start mb-2">
                                                <div className="flex-1">
                                                    <span className="font-medium text-sm">{comp.label}</span>
                                                    {comp.strains.length > 0 && (
                                                        <div className="text-xs text-gray-600 mt-1">
                                                            {comp.strains.map((s, i) => (
                                                                <span key={i}>
                                                                    {s.strainName} ({s.percentage}%){i < comp.strains.length - 1 ? ', ' : ''}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                                <button 
                                                    onClick={() => setCompositions(compositions.filter((_, i) => i !== idx))}
                                                    className="text-red-600 hover:text-red-800 font-bold px-2"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                                
                                <CompositionEditor
                                    strains={strains}
                                    onAdd={(comp) => setCompositions([...compositions, comp])}
                                />
                            </div>
                        </div>
                    )}

                    {/* NAVIGATION */}
                    <div className="mt-8 flex justify-between border-t border-gray-200 pt-5">
                        {step > 1 ? (
                            <button onClick={prevStep} className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50">
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
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                            >
                                Next
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={loading}
                                className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
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

function Input({ label, onChange, ...props }: any) {
    const inputId = props.id || props.name || `input-${label.toLowerCase().replace(/\s+/g, '-')}`
    return (
        <div>
            <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">{label}</label>
            <input 
                id={inputId} 
                className="mt-1 appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm" 
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
            <h4 className="text-sm font-bold text-gray-900">{title}</h4>
            <p className="text-xs text-gray-500 mb-2">{description}</p>

            <ul ref={listRef} className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                {items.length === 0 && <li className="text-xs text-gray-400 italic">No items defined</li>}
                {items.map((item, idx) => (
                    <li key={idx} className="flex gap-2 items-center text-sm p-1 bg-gray-50 rounded border border-gray-100">
                        {fields.map(f => (
                            <span key={f.name} className={`${f.width || 'flex-1'} truncate px-1`} title={item[f.name]}>
                                {item[f.name]}
                            </span>
                        ))}
                        <button onClick={() => onUpdate(items.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-600 font-bold px-2">
                            ×
                        </button>
                    </li>
                ))}
            </ul>

            <div className="flex gap-2 items-center">
                {fields.map(f => (
                    <input
                        key={f.name}
                        className={`${f.width || 'flex-1'} text-xs border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 p-1.5 shadow-sm`}
                        placeholder={f.placeholder || f.name}
                        value={newItem[f.name] || ''}
                        onChange={e => handleChange(f.name, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    />
                ))}
                <button
                    onClick={handleAdd}
                    disabled={!newItem[fields[0].name]}
                    className="p-1.5 border border-transparent rounded bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50 font-bold px-2"
                >
                    +
                </button>
            </div>
        </div>
    )
}

// Composition Editor Component
function CompositionEditor({ strains, onAdd }: { strains: StrainItem[], onAdd: (comp: CompositionItem) => void }) {
    const [label, setLabel] = useState('')
    const [compositionStrains, setCompositionStrains] = useState<CompositionStrainItem[]>([])
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
        
        onAdd({
            label,
            legacy: 0,
            strains: compositionStrains
        })
        setLabel('')
        setCompositionStrains([])
    }

    const totalPercentage = compositionStrains.reduce((sum, s) => sum + s.percentage, 0)
    const isTotalValid = Math.abs(totalPercentage - 100) < 0.01

    return (
        <div className="space-y-3 border border-gray-300 rounded p-3 bg-white">
            <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Composition Label</label>
                <input
                    type="text"
                    value={label}
                    onChange={e => setLabel(e.target.value)}
                    placeholder="e.g. Mixed Strain Control"
                    className="w-full text-sm border-gray-300 rounded-md p-1.5"
                />
            </div>
            
            {/* Display added strains */}
            {compositionStrains.length > 0 && (
                <div className="space-y-2">
                    <div className="text-xs font-medium text-gray-700">Strains in Composition:</div>
                    <ul className="space-y-1 max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                        {compositionStrains.map((cs, idx) => (
                            <li key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border border-gray-200">
                                <span className="flex-1">
                                    <span className="font-medium">{cs.strainName}</span>
                                    <span className="text-gray-600 ml-2">{cs.percentage}%</span>
                                </span>
                                <button
                                    onClick={() => handleRemoveStrain(cs.strainName)}
                                    className="text-red-600 hover:text-red-800 font-bold px-2"
                                    title="Remove strain"
                                >
                                    ×
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className={`text-xs font-medium ${isTotalValid ? 'text-green-600' : 'text-red-600'}`}>
                        Total: {totalPercentage.toFixed(2)}% {isTotalValid ? '✓' : `(need ${(100 - totalPercentage).toFixed(2)}% more)`}
                    </div>
                </div>
            )}
            
            {/* Add strain form */}
            <div className="space-y-2 border-t pt-2">
                <div className="text-xs font-medium text-gray-700">Add Strain:</div>
                <div className="flex gap-2">
                    <select
                        value={selectedStrain}
                        onChange={e => setSelectedStrain(e.target.value)}
                        className="flex-1 text-sm border-gray-300 rounded-md p-1.5"
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
                        className="w-24 text-sm border-gray-300 rounded-md p-1.5"
                        disabled={!selectedStrain}
                    />
                    <button
                        onClick={handleAddStrain}
                        disabled={!selectedStrain || !percentage || availableStrains.length === 0}
                        className="px-3 py-1.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                    >
                        Add
                    </button>
                </div>
            </div>
            
            <button
                onClick={handleAddComposition}
                disabled={!label || compositionStrains.length === 0 || !isTotalValid}
                className="w-full px-3 py-2 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
            >
                Add Composition
            </button>
        </div>
    )
}
