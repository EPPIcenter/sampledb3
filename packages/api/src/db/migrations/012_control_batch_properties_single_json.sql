-- Migration 012: control batch properties are stored as a JSON object, not as a JSON string that
-- holds one (issue #133). batch-create.ts and batch-with-specimens.ts called JSON.stringify on
-- `properties` before handing it to a JSON column, so the stored text was `"{\"a\":1}"` and reads
-- returned a string. Unwrap each such value to the object text it holds. A row already holding an
-- object, a NULL, or a JSON string that does not hold an object is left as it is, so running this
-- again changes nothing. The CASE guards keep json_type() off text that is not valid JSON, which
-- it would otherwise reject with an error.
UPDATE control_batch
SET properties = json_extract(properties, '$')
WHERE typeof(properties) = 'text'
  AND CASE WHEN json_valid(properties) THEN json_type(properties) END = 'text'
  AND CASE
    WHEN json_valid(json_extract(properties, '$')) THEN json_type(json_extract(properties, '$'))
  END = 'object';
