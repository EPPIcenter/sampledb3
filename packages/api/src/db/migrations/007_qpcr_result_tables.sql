-- Migration 007: qPCR result tables. They exist in databases created before the SQL snapshot
-- (matching definitions below) but initial_schema.sql never created them, so result uploads failed
-- on fresh installs. IF NOT EXISTS leaves existing databases unchanged.
CREATE TABLE IF NOT EXISTS qpcr_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qpcr_experiment_id INTEGER NOT NULL REFERENCES qpcr_experiment(id) ON DELETE CASCADE,
  instrument_type TEXT NOT NULL,
  run_started_at TEXT,
  run_ended_at TEXT,
  experiment_name TEXT,
  file_name TEXT,
  created TEXT NOT NULL DEFAULT current_timestamp,
  slope REAL,
  y_intercept REAL,
  r_squared REAL,
  efficiency REAL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qpcr_run_experiment_idx ON qpcr_run(qpcr_experiment_id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS qpcr_well_result (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qpcr_run_id INTEGER NOT NULL REFERENCES qpcr_run(id) ON DELETE CASCADE,
  well_position TEXT NOT NULL,
  target_name TEXT,
  sample_barcode TEXT,
  task TEXT,
  cq REAL,
  quantity REAL,
  standard_quantity REAL,
  amp_status TEXT,
  UNIQUE (qpcr_run_id, well_position, target_name)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qpcr_well_result_run_idx ON qpcr_well_result(qpcr_run_id);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS qpcr_amplification_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  qpcr_well_result_id INTEGER NOT NULL REFERENCES qpcr_well_result(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL,
  rn REAL,
  delta_rn REAL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS qpcr_amplification_data_well_result_idx ON qpcr_amplification_data(qpcr_well_result_id);
