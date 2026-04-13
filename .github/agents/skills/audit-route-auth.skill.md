# Skill: Audit Route Authentication

## Purpose

Systematically audit all API routes and server actions to ensure proper authentication guards are in place before accessing Protected Health Information (PHI). This skill prevents HIPAA violations by identifying unauthenticated endpoints that could expose patient data.

## Assigned Agent

**Database Agent** - Primary user for data access security audits.

**Performance Agent** - Secondary user when analyzing critical paths.

**Architect** - For system-wide security reviews.

## When to Use

- Before deploying new API routes or server actions
- During security audit (scheduled or triggered)
- After adding new data access patterns
- User reports unauthorized access concerns
- Pre-production deployment verification
- After modifying authentication middleware

## When NOT to Use

- Public routes (login, signup, health checks)
- Static assets (images, CSS, fonts)
- Routes already verified in recent audit (<7 days)

## Inputs

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `scope` | enum | Yes | Audit scope: `all`, `api-routes`, `server-actions`, `file` | `all` |
| `filePath` | string | No | Specific file to audit (when scope=`file`) | `app/api/patients/route.ts` |
| `severity` | enum | Yes | Report level: `critical` (PHI access only), `all` (including non-PHI) | `critical` |
| `fix` | boolean | No | Auto-add auth guards where missing (default: false) | `false` |

## Steps

### 1. Identify All Route Handlers

**API Routes (Next.js App Router):**
```bash
# Find all route.ts files
glob pattern="app/api/**/route.ts"

# Find all HTTP method exports
grep -r "export async function GET\|POST\|PUT\|PATCH\|DELETE" app/api/ --include="*.ts"
```

**Server Actions:**
```bash
# Find all 'use server' directives
grep -r "'use server'" app/ lib/ --include="*.ts" --include="*.tsx" -A 20

# Find all async functions after 'use server'
grep -r "export async function" --include="*.ts" --include="*.tsx"
```

**Expected patterns:**
```typescript
// API Route
export async function GET(request: Request) { ... }
export async function POST(request: Request) { ... }

// Server Action
'use server'
export async function createPatient(data: FormData) { ... }
```

### 2. Parse Authentication Patterns

**Check for valid auth guards:**

**Pattern 1: Firebase Auth with cookies**
```typescript
import { cookies } from 'next/headers'
import { verifyIdToken } from '@/lib/firebase/admin'

export async function GET(request: Request) {
  const sessionCookie = cookies().get('session')?.value
  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 })
  }

  const decodedToken = await verifyIdToken(sessionCookie)
  const userId = decodedToken.uid
  // ✅ Auth verified before data access
}
```

**Pattern 2: Server action with session check**
```typescript
'use server'

import { getServerSession } from '@/lib/auth/session'

export async function getPatientRecord(patientId: string) {
  const session = await getServerSession()
  if (!session?.user?.uid) {
    throw new Error('Unauthorized')
  }
  // ✅ Auth verified before data access
}
```

**Pattern 3: Middleware (applies to all routes)**
```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  const session = request.cookies.get('session')
  if (!session && !isPublicPath(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}
```

### 3. Identify PHI Access Points

**PHI access indicators:**
- Firestore queries to `psychologists/{uid}/patients/` collections
- API routes matching `/api/patients`, `/api/sessions`, `/api/memories`, `/api/documents`
- Functions calling `getPatientRecord`, `getSessionMessages`, `getClinicalMemories`
- File uploads to patient directories in Firebase Storage

**Scan for PHI access:**
```bash
# Firestore patient queries
grep -r "psychologists/.*/patients" app/ lib/ --include="*.ts" --include="*.tsx"

# Patient-related API routes
glob pattern="app/api/patients/**/route.ts"
glob pattern="app/api/sessions/**/route.ts"
glob pattern="app/api/memories/**/route.ts"

# Clinical data functions
grep -r "getPatientRecord\|getSessionMessages\|getClinicalMemories" app/ lib/ --include="*.ts"
```

### 4. Match Auth Guards to PHI Access

**For each route/action with PHI access:**

```typescript
interface AuditResult {
  file: string
  line: number
  routeType: 'api-route' | 'server-action'
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  phiAccess: boolean
  authGuard: 'present' | 'missing' | 'weak'
  authPattern?: 'firebase-cookie' | 'session-check' | 'middleware' | 'unknown'
  risk: 'critical' | 'high' | 'medium' | 'low'
  recommendation: string
}
```

**Risk Assessment Rules:**
```typescript
function assessRisk(result: AuditResult): 'critical' | 'high' | 'medium' | 'low' {
  // CRITICAL: PHI access without auth guard
  if (result.phiAccess && result.authGuard === 'missing') {
    return 'critical'
  }

  // HIGH: PHI access with weak auth (e.g., client-side only)
  if (result.phiAccess && result.authGuard === 'weak') {
    return 'high'
  }

  // MEDIUM: Non-PHI but authenticated endpoint missing guard
  if (!result.phiAccess && result.authGuard === 'missing') {
    return 'medium'
  }

  // LOW: Properly guarded
  return 'low'
}
```

### 5. Generate Audit Report

**Critical Issues (PHI without auth):**
```markdown
### 🚨 CRITICAL: Unauthenticated PHI Access

1. **File**: `app/api/patients/[patientId]/route.ts:12`
   - **Method**: GET
   - **PHI Access**: YES (loads patient record from Firestore)
   - **Auth Guard**: MISSING
   - **Risk**: HIPAA violation - patient data exposed without authentication
   - **Recommendation**: Add Firebase session verification before Firestore query

2. **File**: `lib/actions/session-actions.ts:45`
   - **Function**: `getSessionMessages`
   - **PHI Access**: YES (loads session transcript)
   - **Auth Guard**: MISSING
   - **Risk**: Session transcripts accessible without auth
   - **Recommendation**: Add `getServerSession()` check at function start
```

**High Issues (Weak auth):**
```markdown
### ⚠️ HIGH: Weak Authentication

1. **File**: `app/api/sessions/route.ts:8`
   - **Method**: POST
   - **PHI Access**: YES (creates session)
   - **Auth Guard**: WEAK (checks header only, not verified)
   - **Risk**: Client can forge user ID
   - **Recommendation**: Replace header check with `verifyIdToken()`
```

**Medium Issues (Non-PHI without auth):**
```markdown
### ⚡ MEDIUM: Missing Auth (Non-PHI)

1. **File**: `app/api/settings/route.ts:5`
   - **Method**: GET
   - **PHI Access**: NO (user preferences only)
   - **Auth Guard**: MISSING
   - **Risk**: User can access other users' settings
   - **Recommendation**: Add session verification for user-scoped data
```

### 6. Auto-Fix (if enabled)

**When `fix: true`, inject auth guards:**

**API Route Fix:**
```typescript
// BEFORE
export async function GET(request: Request, { params }: { params: { patientId: string } }) {
  const db = getFirestore()
  const patient = await db.collection('patients').doc(params.patientId).get()
  return Response.json(patient.data())
}

// AFTER (auto-injected)
import { cookies } from 'next/headers'
import { verifyIdToken } from '@/lib/firebase/admin'

export async function GET(request: Request, { params }: { params: { patientId: string } }) {
  // 🔒 Auth guard added by audit-route-auth skill
  const sessionCookie = cookies().get('session')?.value
  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 })
  }

  const decodedToken = await verifyIdToken(sessionCookie)
  const userId = decodedToken.uid

  const db = getFirestore()
  const patient = await db.collection('patients').doc(params.patientId).get()
  return Response.json(patient.data())
}
```

**Server Action Fix:**
```typescript
// BEFORE
'use server'

export async function createPatient(data: FormData) {
  const name = data.get('name')
  // ... create patient in Firestore
}

// AFTER (auto-injected)
'use server'

import { getServerSession } from '@/lib/auth/session'

export async function createPatient(data: FormData) {
  // 🔒 Auth guard added by audit-route-auth skill
  const session = await getServerSession()
  if (!session?.user?.uid) {
    throw new Error('Unauthorized: User must be authenticated')
  }

  const name = data.get('name')
  // ... create patient in Firestore
}
```

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| `totalRoutes` | number | Total routes/actions audited |
| `phiRoutes` | number | Routes with PHI access |
| `criticalIssues` | number | PHI access without auth (HIPAA violations) |
| `highIssues` | number | Weak auth on PHI routes |
| `mediumIssues` | number | Non-PHI routes without auth |
| `lowIssues` | number | Properly protected routes |
| `details` | array | Full audit results per route |
| `summary` | string | Human-readable report |
| `fixesApplied` | number | Auth guards auto-added (if fix=true) |

## Acceptance Criteria

- [ ] All API routes in `app/api/` analyzed
- [ ] All server actions (`'use server'`) analyzed
- [ ] Correctly identifies PHI access (Firestore patient queries, patient API routes)
- [ ] Distinguishes between missing auth, weak auth, and proper auth
- [ ] Risk assessment accurate (critical for PHI+no-auth)
- [ ] Reports file path and line number for each issue
- [ ] If `fix: true`, auth guards injected correctly
- [ ] No false positives (marking public routes as vulnerable)
- [ ] No false negatives (missing unprotected PHI routes)

## Health-Tech Specific Rules

- **HIPAA P0**: Any PHI access without auth is a critical HIPAA violation
- **Row-Level Security**: Auth must verify user owns the requested patient data (check `psychologistId` matches `userId`)
- **Audit Logging**: All PHI access (even authenticated) should be logged for compliance
- **Public Routes Whitelist**: `/api/auth/*`, `/api/health`, `/api/webhook/*` (non-PHI)

## Common Aurora Auth Patterns

**Pattern: Verify User Owns Patient Data**
```typescript
export async function GET(
  request: Request,
  { params }: { params: { patientId: string } }
) {
  // 1. Verify user is authenticated
  const sessionCookie = cookies().get('session')?.value
  if (!sessionCookie) {
    return new Response('Unauthorized', { status: 401 })
  }

  const decodedToken = await verifyIdToken(sessionCookie)
  const userId = decodedToken.uid

  // 2. Verify user owns this patient (row-level security)
  const db = getFirestore()
  const patientRef = db
    .collection('psychologists')
    .doc(userId)
    .collection('patients')
    .doc(params.patientId)

  const patientDoc = await patientRef.get()
  if (!patientDoc.exists) {
    return new Response('Forbidden', { status: 403 })
  }

  // 3. Audit log PHI access
  await logPHIAccess({
    userId,
    patientId: params.patientId,
    action: 'read',
    resource: 'patient-record'
  })

  return Response.json(patientDoc.data())
}
```

## Example Invocation

**Audit all routes for critical PHI issues:**
```typescript
auditRouteAuth({
  scope: 'all',
  severity: 'critical'
})
```

**Audit specific file:**
```typescript
auditRouteAuth({
  scope: 'file',
  filePath: 'app/api/patients/[patientId]/sessions/route.ts',
  severity: 'all'
})
```

**Auto-fix missing auth guards:**
```typescript
auditRouteAuth({
  scope: 'all',
  severity: 'critical',
  fix: true
})
```

## Example Output

```markdown
### Route Authentication Audit Report

**Total Routes**: 24
**PHI Routes**: 12
**Critical Issues**: 3 🚨
**High Issues**: 1 ⚠️
**Medium Issues**: 2 ⚡
**Properly Protected**: 18 ✅

---

### 🚨 CRITICAL ISSUES (3)

1. **app/api/patients/[patientId]/route.ts:12** (GET)
   - PHI Access: YES (Firestore query to `psychologists/{uid}/patients/{pid}`)
   - Auth Guard: MISSING
   - Risk: Patient records accessible without authentication
   - Fix: Add Firebase session verification

2. **lib/actions/session-actions.ts:45** (`getSessionMessages`)
   - PHI Access: YES (loads session transcript)
   - Auth Guard: MISSING
   - Risk: Session transcripts exposed
   - Fix: Add `getServerSession()` check

3. **app/api/memories/route.ts:8** (GET)
   - PHI Access: YES (loads clinical memories)
   - Auth Guard: MISSING
   - Risk: Clinical observations accessible without auth
   - Fix: Add session cookie verification

---

### ⚠️ HIGH ISSUES (1)

1. **app/api/sessions/route.ts:8** (POST)
   - PHI Access: YES (creates session with patient ID)
   - Auth Guard: WEAK (header check only, not cryptographically verified)
   - Risk: Client can forge user ID
   - Fix: Replace `request.headers.get('x-user-id')` with `verifyIdToken()`

---

### ✅ PROPERLY PROTECTED (18)

- app/api/patients/route.ts (GET, POST) ✅
- app/api/sessions/[sessionId]/messages/route.ts (GET) ✅
- lib/actions/patient-actions.ts (all functions) ✅
- ... (15 more)

---

**RECOMMENDATION**: Fix all 3 critical issues immediately before deploying. These are HIPAA violations.
```
