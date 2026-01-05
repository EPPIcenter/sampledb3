# Statistics Route Database Query Analysis

## Current Query Count (Worst Case: ~114k specimens, ~121k containers)

### Base Queries (Always Executed)
1. **Specimens query**: 1 query
2. **Specimen types query**: 1 query (batched if >500 types)
3. **Container queries by specimen chunks**: ~228 queries (one per specimen chunk of 500)
4. **Container types queries**: ~244 queries (5 queries per container chunk: micronix, cryovial, tube, paper, staticWell)
5. **Container tags queries**: ~244 queries (one per container chunk of 500)
6. **Storage statistics queries**: ~488 queries (2 queries per container chunk: micronix + cryovial)
7. **Location queries for storage**: ~1-2 queries (batched)

### Conditional Queries
- **Study filter**: +2 queries (study + subjects)
- **Location filter**: +2-4 queries (locations + plates/boxes)
- **Tag filter**: +1 query
- **Adjusted specimen stats**: +3-5 queries (if container filters applied)

**Total: ~1,000-1,200+ database queries per request!**

## Major Performance Issues

### 1. Sequential Container Queries (Biggest Issue)
- Processing specimen chunks sequentially: `for (const specimenChunk of specimenChunks)`
- Each chunk makes 1+ queries
- With 114k specimens = 228 chunks = 228+ sequential queries
- **Fix**: Use single query with proper WHERE clause or batch with Promise.all

### 2. Redundant Container Type Queries
- Making 5 separate queries per container chunk to determine container type
- Could be done with a single UNION query or better yet, use SQL CASE/COALESCE

### 3. Inefficient Storage Statistics
- Making 2 separate queries (micronix + cryovial) per chunk
- Could use UNION ALL in a single query

### 4. Loading All Data Into Memory
- Fetching all specimens, containers, tags into memory
- Processing in JavaScript instead of using SQL aggregations
- Could use SQL GROUP BY, COUNT, etc. for most statistics

## Optimization Opportunities

### High Impact Optimizations

1. **Use SQL Aggregations Instead of In-Memory Processing**
   - Container counts by type: Use SQL GROUP BY
   - Container tags: Use SQL GROUP BY with JOIN
   - Storage statistics: Use SQL aggregations
   - Timeline data: Use SQL DATE functions

2. **Combine Container Queries**
   - Instead of querying by specimen chunks, use a single query with WHERE IN
   - Or use Promise.all to parallelize chunk queries

3. **Optimize Container Type Detection**
   - Use a single UNION query or SQL CASE statement
   - Or add a container_type column to storage_container table

4. **Combine Storage Statistics Queries**
   - Use UNION ALL to combine micronix and cryovial queries
   - Single query instead of 2 per chunk

5. **Cache Reference Data**
   - Specimen types, studies, tags are relatively static
   - Could cache these in memory or use a faster lookup

### Medium Impact Optimizations

6. **Parallelize Independent Queries**
   - Use Promise.all for queries that don't depend on each other
   - Container types, tags, and storage stats could run in parallel

7. **Reduce Data Transfer**
   - Only select columns we actually need
   - Use aggregations in SQL instead of fetching all rows

8. **Optimize Location Queries**
   - Could combine location filtering with container queries using JOINs
   - Avoid separate location ID lookup step

## Recommended Implementation Order

1. **Phase 1: Combine Container Queries** (Biggest win)
   - Replace sequential chunk processing with single query or Promise.all
   - Expected reduction: ~228 queries → 1-10 queries

2. **Phase 2: Use SQL Aggregations** (High impact)
   - Convert container type counting to SQL GROUP BY
   - Convert tag counting to SQL GROUP BY
   - Expected reduction: ~500 queries → ~10 queries

3. **Phase 3: Optimize Storage Statistics** (Medium impact)
   - Combine micronix/cryovial queries with UNION ALL
   - Use SQL aggregations for location counting
   - Expected reduction: ~488 queries → ~10 queries

4. **Phase 4: Fine-tuning** (Lower impact)
   - Parallelize independent queries
   - Cache reference data
   - Optimize data selection

## Expected Results

**Current**: ~1,000-1,200 queries, ~1-2 seconds
**After Phase 1**: ~500-700 queries, ~0.5-1 second
**After Phase 2**: ~50-100 queries, ~0.2-0.5 seconds
**After Phase 3**: ~20-50 queries, ~0.1-0.3 seconds
**After Phase 4**: ~10-30 queries, ~0.05-0.2 seconds

