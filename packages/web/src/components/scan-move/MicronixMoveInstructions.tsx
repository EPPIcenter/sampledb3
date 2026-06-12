import { Link } from 'react-router-dom'

export default function MicronixMoveInstructions({ createStepUsed }: { createStepUsed: boolean }) {
  return (
    <>
      <div>
        <h3 className="font-semibold text-app-text mb-2">Overview</h3>
        <p>
          Upload one or more CSV files representing plate scans. Depending on the scanner configuration, the destination plate is inferred from the{' '}
          <strong>file name</strong> (after stripping common date suffixes) or from a <strong>CSV column</strong> that repeats the plate name on every row. You can always pick the plate manually.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">Scanner Configuration</h3>
        <p className="mb-2">Select a scanner configuration that matches your CSV file format. The default configuration is automatically selected, but you can change it if needed.</p>
        <p className="mb-2">Scanner configurations support:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>Custom column names for barcode and position fields</li>
          <li>Single position column or separate row/column columns (automatically combined with zero-padding)</li>
          <li>Automatic row skipping for header/metadata rows</li>
        </ul>
        <p className="mt-2 text-sm">
          Create or modify scanner configurations in{' '}
          <Link to="/settings?tab=scanner-configurations" className="storage-link underline">
            Settings → Scanner Configurations
          </Link>{' '}
          to handle different scanner output formats.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">CSV Format</h3>
        <p className="mb-2">The required columns depend on your selected scanner configuration:</p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>
            <strong>Barcode column:</strong> Contains the tube barcode/ID (column name varies by scanner). Leave empty for wells that should be empty.
          </li>
          <li>
            <strong>Position:</strong> Either a single position column (e.g., &quot;A01&quot;) or separate row and column columns that are automatically combined (e.g., Row=&quot;A&quot;, Column=&quot;1&quot; becomes &quot;A01&quot;). The CSV must list all 96 well positions (A01–H12) exactly once, as produced by scanning software.
          </li>
          <li>
            <strong>Row skipping:</strong> Some configurations skip header/metadata rows at the start of the file
          </li>
        </ul>
        <p className="mt-2 text-sm">
          The system automatically maps your CSV columns based on the selected scanner configuration. If a well is empty in your file but currently has a tube, that tube must appear elsewhere in the move (in any CSV targeting that plate) so it is relocated and no tube is lost.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">Filename Convention</h3>
        <p className="mb-2">
          Name your CSV files after the destination plate. The system derives a stem from the filename (path and .csv are removed; date/time suffixes like{' '}
          <code className="bg-app-surface px-1 rounded">_2024-01-15</code> are stripped) and suggests plates by exact, then partial, match. If exactly one plate is suggested, it is auto-selected.
        </p>
        <ul className="list-disc list-inside space-y-1 ml-4">
          <li>
            Example: <code className="bg-app-surface px-1 rounded">PLATE-001.csv</code> or{' '}
            <code className="bg-app-surface px-1 rounded">PLATE-001_2024-01-15.csv</code> → stem &quot;PLATE-001&quot;
          </li>
          <li>If no single plate is suggested, choose the destination from the list</li>
        </ul>
      </div>

      <div>
        <h3 className="font-semibold text-app-text mb-2">Workflow</h3>
        <p className="mb-2">This process has {createStepUsed ? '4' : '3'} steps:</p>
        <ol className="list-decimal list-inside space-y-1 ml-4">
          <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination plates. Click <strong>Next</strong> to validate and continue.</li>
          {createStepUsed && (
            <li><strong>Create Plates:</strong> Assign a storage location for any destination plates that do not exist yet.</li>
          )}
          <li><strong>Resolve:</strong> System finds each tube by barcode and identifies source plates</li>
          <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
        </ol>
      </div>
    </>
  )
}
