# Skill: Firestore Index Check

## Purpose

Validate that Firestore composite indexes exist for complex queries to prevent runtime errors and ensure optimal query performance. This skill checks `firestore.indexes.json` against actual queries in the codebase and identifies missing or misconfigured indexes.

## Assigned Agent

**Database Agent** - Primary user for query optimization and index management.

**Performance Agent** - Secondary user when diagnosing slow queries.

## When to Use

- Before deploying new Firestore queries with `where()` + `orderBy()` combinations
- User reports "The query requires an index" error
- Performance audit reveals slow Firestore queries
- After adding new query patterns to the codebase
- As pre-deployment verification step

## When NOT to Use

- Simple queries (single `where()` or `orderBy()` without combining)
- Queries on document IDs (always indexed)
- Queries already tested in production (indexes exist)

## Inputs

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `queryPath` | string | No | Specific file path to check queries in | `lib/firebase/patient-queries.ts` |
| `collectionPath` | string | No | Specific collection to audit | `psychologists/{uid}/patients/{pid}/sessions` |
| `mode` | enum | Yes | Check mode: `validate` (check all), `suggest` (propose new indexes), `fix` (auto-add to indexes.json) | `validate` |

## Steps

### 1. Find All Firestore Queries

**Search for query patterns in codebase:**
```bash
# Find all Firestore query() calls
grep -r "query(" --include="*.ts" --include="*.tsx" -A 5

# Find where() clauses
grep -r "where(" --include="*.ts" --include="*.tsx" -A 2

# Find orderBy() clauses
grep -r "orderBy(" --include="*.ts" --include="*.tsx" -A 2
```

**Parse query structure:**
```typescript
// Extract from code like:
const q = query(
  collection(db, 'psychologists/uid/patients/pid/sessions'),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc'),
  limit(10)
)

// Results in:
{
  collectionGroup: false,
  collectionPath: 'sessions',
  fields: [
    { fieldPath: 'status', operator: '==', value: 'completed' },
    { fieldPath: 'createdAt', order: 'desc' }
  ]
}
```

### 2. Read Current Index Configuration

**Load `firestore.indexes.json`:**
```bash
read firestore.indexes.json
```

**Expected structure:**
```json
{
  "indexes": [
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### 3. Match Queries to Indexes

**For each query found, check if index exists:**

**Rules for index requirement:**
1. **Single `where()` equality**: No index needed (automatic)
2. **Single `orderBy()`**: No index needed (automatic)
3. **Multiple `where()` on same field**: No composite index needed
4. **`where()` + `orderBy()`**: Composite index REQUIRED
5. **Multiple `where()` + `orderBy()`**: Composite index REQUIRED
6. **`orderBy()` on multiple fields**: Composite index REQUIRED

**Matching algorithm:**
```typescript
function requiresIndex(query: Query): boolean {
  const hasWhere = query.fields.some(f => f.operator)
  const hasOrderBy = query.fields.some(f => f.order)
  const multipleFields = query.fields.length > 1

  // Composite index needed if:
  return (hasWhere && hasOrderBy) || (hasOrderBy && multipleFields)
}

function indexExists(query: Query, indexes: Index[]): boolean {
  return indexes.some(index => {
    // Collection path match
    if (index.collectionGroup !== query.collectionPath) return false

    // All fields present in correct order
    return query.fields.every((queryField, i) => {
      const indexField = index.fields[i]
      if (!indexField) return false

      // Field path match
      if (indexField.fieldPath !== queryField.fieldPath) return false

      // Order/operator match
      if (queryField.order) {
        return indexField.order === queryField.order.toUpperCase()
      }
      return true
    })
  })
}
```

### 4. Generate Index Suggestions

**For queries missing indexes:**

```typescript
interface IndexSuggestion {
  collectionGroup: string
  queryScope: 'COLLECTION' | 'COLLECTION_GROUP'
  fields: Array<{
    fieldPath: string
    order: 'ASCENDING' | 'DESCENDING'
  }>
  sourceFile: string
  sourceLine: number
  reason: string
}

// Example:
{
  collectionGroup: 'sessions',
  queryScope: 'COLLECTION',
  fields: [
    { fieldPath: 'status', order: 'ASCENDING' },
    { fieldPath: 'createdAt', order: 'DESCENDING' }
  ],
  sourceFile: 'lib/firebase/patient-queries.ts',
  sourceLine: 42,
  reason: 'Query uses where(status) + orderBy(createdAt)'
}
```

### 5. Output Results

**Mode: `validate`**
- List all queries requiring indexes
- Mark ✅ if index exists, ❌ if missing
- Show index configuration needed for missing ones

**Mode: `suggest`**
- Generate full `firestore.indexes.json` entries for missing indexes
- Include comments with source file/line
- Provide Firebase Console links for manual creation

**Mode: `fix`**
- Read current `firestore.indexes.json`
- Add missing index definitions
- Write updated file
- Show diff of changes

### 6. Verify Index Deployment (Optional)

**For deployed indexes, check status:**
```bash
# Using Firebase MCP tools (if available)
firebase firestore:indexes

# Or via gcloud CLI
gcloud firestore indexes list --database=(default)
```

**Index states:**
- `CREATING` - Index being built (can take minutes to hours)
- `READY` - Index active and usable
- `ERROR` - Index creation failed
- `NOT_FOUND` - Index not deployed

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `queriesFound` | number | Total Firestore queries analyzed |
| `indexesRequired` | number | Queries requiring composite indexes |
| `indexesMissing` | number | Indexes not found in firestore.indexes.json |
| `suggestions` | array | List of missing index definitions |
| `errors` | array | Queries that will fail without indexes |
| `summary` | string | Human-readable report |

## Acceptance Criteria

- [ ] All Firestore `query()` calls in specified scope analyzed
- [ ] Correctly identifies which queries need composite indexes (where+orderBy, multiple orderBy)
- [ ] Matches existing indexes in `firestore.indexes.json` accurately
- [ ] Generates valid index JSON for missing indexes
- [ ] Reports source file and line number for each query
- [ ] If `fix` mode: `firestore.indexes.json` updated correctly
- [ ] No false positives (marking simple queries as needing indexes)
- [ ] No false negatives (missing complex queries that need indexes)

## Health-Tech Specific Rules

- **Patient Data Collections**: Prioritize indexes for patient queries (sessions, memories, documents)
- **Performance Impact**: Missing indexes = 10-100x slower queries in production
- **HIPAA Audit**: Index creation events are logged for compliance

## Common Aurora Indexes

**From DECISIONS.md, these indexes are required:**

```json
{
  "indexes": [
    {
      "collectionGroup": "sessions",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "memories",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "category", "order": "ASCENDING" },
        { "fieldPath": "confidence", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "messages",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "sessionId", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "ASCENDING" }
      ]
    }
  ]
}
```

## Example Invocation

**Validate all queries:**
```typescript
firestoreIndexCheck({
  mode: 'validate'
})
```

**Check specific file:**
```typescript
firestoreIndexCheck({
  queryPath: 'lib/firebase/session-queries.ts',
  mode: 'suggest'
})
```

**Auto-fix missing indexes:**
```typescript
firestoreIndexCheck({
  mode: 'fix'
})
```

## Example Output

```markdown
### Firestore Index Check Report

**Queries Analyzed**: 12
**Indexes Required**: 5
**Indexes Missing**: 2

#### ❌ Missing Indexes

1. **sessions collection**
   - **File**: `lib/firebase/session-queries.ts:42`
   - **Query**: `where('status', '==', 'completed') + orderBy('createdAt', 'desc')`
   - **Required Index**:
   ```json
   {
     "collectionGroup": "sessions",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "status", "order": "ASCENDING" },
       { "fieldPath": "createdAt", "order": "DESCENDING" }
     ]
   }
   ```

2. **memories collection**
   - **File**: `lib/firebase/memory-queries.ts:28`
   - **Query**: `where('category', '==', 'clinical_observation') + orderBy('confidence', 'desc')`
   - **Required Index**:
   ```json
   {
     "collectionGroup": "memories",
     "queryScope": "COLLECTION",
     "fields": [
       { "fieldPath": "category", "order": "ASCENDING" },
       { "fieldPath": "confidence", "order": "DESCENDING" }
     ]
   }
   ```

#### ✅ Existing Indexes (3)

1. messages: sessionId ASC, timestamp ASC
2. documents: patientId ASC, uploadedAt DESC
3. patients: lastSessionDate DESC

**Action Required**: Add 2 missing indexes to `firestore.indexes.json` and deploy with `firebase deploy --only firestore:indexes`
```
