/**
 * Server instructions delivered during MCP initialize.
 * Kept well under 4,096 characters because Claude Code truncates longer instructions.
 */
export const MCP_SERVER_INSTRUCTIONS = [
  'SampleDB tracks biological inventory using this domain vocabulary:',
  '- Study -> Subject -> Specimen (provenance chain; one collection event from one Subject is one Specimen).',
  '- Specimen -> Container -> Collection -> Location (physical storage; multiple Containers for one Specimen are aliquots).',
  '- Container types: micronix_tube (in a plate), cryovial_tube (in a box), paper (on a Sheet inside a box or bag), static_well.',
  '- Location: a place in the storage hierarchy (freezer, shelf, rack). Boxes and bags sit at a Location and cannot hold each other.',
  '- Tag: a workflow label attached to a Container (selecting multiple Tags matches Containers carrying all of them).',
  '',
  'Transfer links:',
  '- Large exports and import files move via short-lived, single-file transfer links (no auth header needed) so file contents never pass through the model.',
  '',
  'Import workflow:',
  '- Import files must match the bulk import template CSV. Call describe_import_format and lookup tools first, then start_import -> upload CSV -> validate_import -> import.',
  '',
  'Mandatory rules:',
  '1. Never change the user\'s data without listing every proposed change (grouped by kind with counts and examples) and getting their explicit agreement first.',
  '2. Never guess a Location for a new Collection; ask the user where each missing Collection should go.',
  '3. Always show the user the full validation summary (including new Subjects, Specimens, Containers, and new Collections) before calling import.',
].join('\n')
