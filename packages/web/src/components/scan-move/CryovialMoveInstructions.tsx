export default function CryovialMoveInstructions({ createStepUsed }: { createStepUsed: boolean }) {
  return (
    <>
      <div>
        <h3 className="font-semibold text-app-text mb-2">Overview</h3>
        <p>
          Upload one or more CSV files with cryovial tube move operations. Each file should be named after the destination box it represents. The system will infer the destination box from the filename, or you can select it manually.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">CSV Format</h3>
        <p className="mb-2">The required columns are:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li><strong>source_collection_name:</strong> Name of the source cryovial box</li>
          <li><strong>source_position:</strong> Position of the tube in the source box (e.g., &quot;B05&quot;, &quot;C02&quot;)</li>
          <li><strong>target_position:</strong> Target position in the destination box (e.g., &quot;C03&quot;, &quot;D01&quot;)</li>
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">Filename Convention</h3>
        <p className="mb-2">Name your CSV files to exactly match the destination box name:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>The filename (without .csv extension) must exactly match a box name in the database</li>
          <li>Example: If box is named &quot;BOX-001&quot;, name your file <code className="bg-app-surface px-1 rounded">BOX-001.csv</code></li>
          <li>Example: If box is named &quot;1022&quot;, name your file <code className="bg-app-surface px-1 rounded">1022.csv</code></li>
          <li>Matching is case-insensitive, but the filename must match exactly (no extra characters)</li>
          <li>If the filename matches no existing box, it is proposed as a new box — assign its storage location in the create step</li>
          <li>If the box name cannot be inferred, you&apos;ll be prompted to select it manually</li>
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">Workflow</h3>
        <p className="mb-2">This process has {createStepUsed ? '4' : '3'} steps:</p>
        <ol className="list-decimal list-inside space-y-1 ml-4">
          <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination boxes</li>
          {createStepUsed && (
            <li><strong>Create Boxes:</strong> Assign a storage location for any destination boxes that do not exist yet.</li>
          )}
          <li><strong>Resolve:</strong> System finds each tube by position and identifies source boxes</li>
          <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
        </ol>
      </div>
    </>
  )
}
