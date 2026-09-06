# Alphanet Backend Specification

## Purpose

This document is the implementation specification for the **Alphanet backend**.

The coding agent must use this document as the source of truth for building the backend after completing the required frontend corrections in **Phase 0**.

The backend must be:

- **TypeScript**
- **Express**
- **MongoDB Atlas**
- **Serverless / Vercel Functions compatible**
- REST API based
- Secure and production-oriented
- Compatible with the existing Alphanet React/TypeScript frontend
- Easy to replace the current frontend mock/localStorage services with real API services
- Structured so that business rules are enforced on the server, not merely by the frontend

The backend will live in:

```text
/Alphanet/backend
```

The existing frontend remains:

```text
/Alphanet/frontend
```

Do **not** rewrite the frontend architecture unnecessarily. Phase 0 exists specifically to correct the known frontend problems and prepare it for this backend.

---

# Table of Contents

1. [Project Goals](#1-project-goals)
2. [Current Frontend Compatibility Contract](#2-current-frontend-compatibility-contract)
3. [Phase 0 — Frontend Corrections](#3-phase-0--frontend-corrections)
4. [Phase 1 — Backend Foundation](#4-phase-1--backend-foundation)
5. [Phase 2 — MongoDB Atlas](#5-phase-2--mongodb-atlas)
6. [Phase 3 — Authentication](#6-phase-3--authentication)
7. [Phase 4 — Users and Supervisors](#7-phase-4--users-and-supervisors)
8. [Phase 5 — Projects / SOW](#8-phase-5--projects--sow)
9. [Phase 6 — Timesheets](#9-phase-6--timesheets)
10. [Phase 7 — Approval Workflow](#10-phase-7--approval-workflow)
11. [Phase 8 — Notifications](#11-phase-8--notifications)
12. [Phase 9 — Activities / Audit Trail](#12-phase-9--activities--audit-trail)
13. [Phase 10 — Reports](#13-phase-10--reports)
14. [Phase 11 — Documents](#14-phase-11--documents)
15. [Phase 12 — Frontend API Integration](#15-phase-12--frontend-api-integration)
16. [Phase 13 — Validation and Security](#16-phase-13--validation-and-security)
17. [Phase 14 — Testing](#17-phase-14--testing)
18. [Phase 15 — Deployment to Vercel](#18-phase-15--deployment-to-vercel)
19. [Phase 16 — Seed / Demo Data](#19-phase-16--seed--demo-data)
20. [Phase 17 — Production Hardening](#20-phase-17--production-hardening)
21. [MongoDB Collections](#21-mongodb-collections)
22. [Data Models](#22-data-models)
23. [REST API Contract](#23-rest-api-contract)
24. [Authentication and Authorization Rules](#24-authentication-and-authorization-rules)
25. [Timesheet Business Rules](#25-timesheet-business-rules)
26. [Status State Machines](#26-status-state-machines)
27. [Error Handling](#27-error-handling)
28. [Response Format](#28-response-format)
29. [Pagination / Filtering / Sorting](#29-pagination--filtering--sorting)
30. [Environment Variables](#30-environment-variables)
31. [Recommended Backend Structure](#31-recommended-backend-structure)
32. [Frontend Integration Requirements](#32-frontend-integration-requirements)
33. [Definition of Done](#33-definition-of-done)
34. [Final End-to-End Acceptance Test](#34-final-end-to-end-acceptance-test)

---

# 1. Project Goals

The backend must support the complete Alphanet workflow.

## 1.1 Roles

There are two primary account roles:

```text
admin
user
```

A normal user can additionally have:

```text
isSupervisor = true
```

A supervisor is therefore **not a third authentication role**.

This is important because the current frontend already models:

```ts
type UserRole = 'admin' | 'user'
```

and:

```ts
isSupervisor: boolean
```

Keep this compatibility.

The backend must therefore authorize:

```text
admin
user
user + isSupervisor
```

separately.

---

# 2. Current Frontend Compatibility Contract

The current frontend already defines the following primary types.

## 2.1 User

```ts
export type UserRole = 'admin' | 'user'

export type UserStatus = 'active' | 'inactive'

export interface User {
  id: string
  name: string
  email: string
  employeeId: string
  department: string
  role: UserRole
  isSupervisor: boolean
  status: UserStatus
  supervisorId?: string
}
```

The backend response should preserve these fields.

MongoDB may use `_id`, but the API should expose:

```json
{
  "id": "..."
}
```

Do not force the frontend to understand MongoDB ObjectIds.

---

## 2.2 Project

Current frontend contract:

```ts
export type ProjectStatus =
  | 'draft'
  | 'active'
  | 'completed'
  | 'overdue'
  | 'archived'

export interface Project {
  id: string
  name: string
  sowNumber: string
  client: string
  description: string
  startDate: string
  endDate: string
  deadline: string
  status: ProjectStatus
  managerId: string
  supervisorId: string
  teamMemberIds: string[]
  documentIds: string[]
  createdAt: string
  updatedAt: string
}
```

The API must return compatible data.

---

## 2.3 Timesheet

Current frontend contract:

```ts
export type TimesheetStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'declined'
  | 'withdrawn'

export type TimesheetEntryType =
  | 'regular'
  | 'overtime'

export interface TimesheetEntry {
  id: string
  description: string
  entryType: TimesheetEntryType
  hours: Record<DayKey, number>
}
```

A timesheet must expose:

```ts
userId
projectId
weekStart
entries
notes
regularHours
overtimeHours
totalHours
status
submittedAt?
review?
createdAt
updatedAt
```

---

## 2.4 Notification

```ts
export type NotificationType =
  | 'submission'
  | 'approval'
  | 'decline'
  | 'withdrawal'
  | 'deadline'
  | 'assignment'
```

Keep this compatible with the frontend.

---

## 2.5 Activity

```ts
export interface Activity {
  id: string
  userId: string
  projectId?: string
  timesheetId?: string
  description: string
  createdAt: string
}
```

The backend should extend this internally with useful audit metadata while keeping the frontend response compatible.

---

# 3. Phase 0 — Frontend Corrections

**Do this before creating the real backend.**

The existing frontend was reviewed and has several issues that must be corrected first.

Do not skip this phase.

---

## 3.1 Add a real "Create Timesheet" flow

The current frontend has timesheet viewing/editing but does not provide a complete user-facing way to create a new timesheet when none exists.

Implement:

```text
User Dashboard
    ↓
My Timesheets
    ↓
+ New Timesheet
    ↓
Select Project
    ↓
Select Week
    ↓
Create Draft
    ↓
Timesheet Editor
```

Required behavior:

- Only projects assigned to the current user are selectable.
- Inactive/completed/archived projects should not be selectable for a new current/future timesheet unless explicitly allowed.
- Week must be normalized to Monday.
- Duplicate timesheet for the same user + project + week must be prevented.
- New timesheet starts as `draft`.

---

## 3.2 Add user → supervisor assignment

The existing user model contains:

```ts
supervisorId?: string
```

but the admin UI does not provide a complete assignment control.

Add to Create User / Edit User:

```text
Supervisor
[ Select supervisor ]

[ ] Enable Supervisor Capability
```

The distinction is:

```text
isSupervisor
```

means the user is capable of acting as a supervisor.

```text
supervisorId
```

means this user reports to a specific supervisor.

The UI must allow both independently.

---

## 3.3 Fix demo supervisor login

The existing "Demo Supervisor" login currently resolves the first normal user matching role `user`.

Replace role-only demo login with explicit demo accounts.

Example:

```ts
loginAsDemo('admin-demo')
loginAsDemo('user-demo')
loginAsDemo('supervisor-demo')
```

The backend seed data should use stable IDs/emails for these demo accounts.

---

## 3.4 Fix supervisor route protection

Current supervisor routes are protected only by:

```ts
allowedRoles={['user']}
```

This is insufficient.

Add supervisor-aware protection:

```text
authenticated
AND
role === user
AND
isSupervisor === true
```

Do not rely on hidden navigation for authorization.

---

## 3.5 Remove direct mock imports from application pages

Pages should not directly import:

```text
mock/users
mock/projects
mock/timesheets
mock/notifications
```

Use:

```text
UI
 ↓
hooks/context
 ↓
service
 ↓
API
```

During transition, the service layer may still use mock data.

After Phase 12, the services must use HTTP APIs.

---

## 3.6 Fix `getUsersBySupervisorId`

Current behavior incorrectly returns every user except the supervisor.

Correct behavior:

```ts
users.filter(user => user.supervisorId === supervisorId)
```

---

## 3.7 Make approval actions permission-aware

Approval controls must check whether the current user can review the timesheet.

Admin:

```text
can review all pending timesheets
```

Supervisor:

```text
can review pending timesheets belonging to assigned users/projects
```

Normal users:

```text
cannot approve or decline
```

---

## 3.8 Strengthen frontend timesheet validation

UI validation should enforce:

### Regular

```text
Monday-Friday allowed
Saturday-Sunday = 0
```

### Overtime

```text
Saturday-Sunday allowed
Monday-Friday = 0
```

Also validate:

- non-negative hours
- sensible daily maximum
- required description when hours > 0
- at least one hour before submission
- valid Monday week
- assigned project
- valid user/project relationship

The backend must enforce these again.

---

## 3.9 Document upload preparation

The frontend currently treats uploads largely as metadata.

Refactor document handling so it can later call:

```text
POST /api/v1/projects/:projectId/documents
DELETE /api/v1/projects/:projectId/documents/:documentId
GET /api/v1/projects/:projectId/documents
```

Actual file bytes must not be stored in the browser's localStorage.

---

## 3.10 Clean up fake dashboard analytics

Do not present hard-coded "this month" metrics as real analytics.

Either calculate them from mock data or remove the trend until the backend report APIs are connected.

---

# 4. Phase 1 — Backend Foundation

Create:

```text
/Alphanet/backend
```

Use:

- TypeScript
- Express
- MongoDB official Node.js driver
- Zod
- bcryptjs
- JSON Web Tokens or `jose`
- Helmet
- CORS
- express-rate-limit
- pino / pino-http or another structured logger
- Vitest
- Supertest

Do not use a traditional always-running production server architecture.

The backend must be Vercel Function compatible.

---

## 4.1 Package setup

Recommended dependencies:

```text
express
mongodb
zod
bcryptjs
jose
cookie-parser
cors
helmet
express-rate-limit
pino
pino-http
```

Development/testing:

```text
typescript
tsx
vitest
supertest
@types/express
@types/node
@types/cookie-parser
```

Do not add unnecessary frameworks.

---

## 4.2 Serverless entry point

Use:

```text
backend/
├── api/
│   └── index.ts
```

The Vercel function should export the Express application/handler.

Conceptually:

```ts
import app from '../src/app'

export default app
```

Do not call:

```ts
app.listen(...)
```

inside the Vercel function.

For local development, create a separate development entry point:

```text
src/server.ts
```

that calls `app.listen()` only when running locally.

---

## 4.3 Vercel routing

Use `vercel.json` to route:

```text
/api/*
```

to the serverless Express function.

Recommended architecture:

```text
Browser
   ↓
https://your-domain.vercel.app/api/v1/...
   ↓
Vercel Function
   ↓
Express
   ↓
MongoDB Atlas
```

The backend must remain stateless between requests.

---

# 5. Phase 2 — MongoDB Atlas

Use the official MongoDB Node.js driver.

Do not create one new MongoClient per request.

Implement a cached connection:

```text
src/lib/mongodb.ts
```

The connection should survive warm serverless invocations.

Conceptually:

```ts
globalThis.__mongoClient
```

or an equivalent cached promise/client strategy.

---

## 5.1 Database

Environment variable:

```text
MONGODB_URI
MONGODB_DB_NAME
```

Example database name:

```text
alphanet
```

Do not hard-code credentials.

---

## 5.2 Collections

Create:

```text
users
projects
timesheets
notifications
activities
documents
sessions
```

Optional later:

```text
passwordResetTokens
refreshTokens
```

If using stateless short-lived access tokens plus HttpOnly refresh tokens, store refresh-token/session records.

---

## 5.3 MongoDB indexes

Create indexes during application initialization or a dedicated migration/seed command.

Users:

```text
email unique
employeeId unique
supervisorId
status
isSupervisor
```

Projects:

```text
sowNumber unique
status
managerId
supervisorId
teamMemberIds
startDate
endDate
deadline
```

Timesheets:

```text
userId
projectId
weekStart
status
```

Unique compound index:

```text
{ userId: 1, projectId: 1, weekStart: 1 }
```

This is essential.

Notifications:

```text
userId
read
createdAt
```

Activities:

```text
userId
projectId
timesheetId
createdAt
```

Documents:

```text
projectId
uploadedBy
createdAt
```

Sessions:

```text
userId
expiresAt
```

Use MongoDB TTL index for expiring sessions if appropriate.

---

# 6. Phase 3 — Authentication

Authentication must support:

```text
Admin Login
User Login
Supervisor Login
```

But the supervisor still authenticates as:

```text
role = user
isSupervisor = true
```

---

## 6.1 Login

Endpoint:

```http
POST /api/v1/auth/login
```

Request:

```json
{
  "email": "john@example.com",
  "password": "password"
}
```

Response:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user-123",
      "name": "John Smith",
      "email": "john@example.com",
      "employeeId": "EMP001",
      "department": "Engineering",
      "role": "user",
      "isSupervisor": false,
      "status": "active"
    }
  }
}
```

Authentication credentials should preferably be maintained using:

```text
HttpOnly
Secure
SameSite
```

cookies for refresh/session tokens.

Do not put passwords in API responses.

---

## 6.2 Password storage

Never store plain passwords.

Use:

```text
bcryptjs
```

with an appropriate work factor.

---

## 6.3 Current user

```http
GET /api/v1/auth/me
```

Returns the authenticated user.

The frontend's `getCurrentUser()` should eventually call this endpoint.

---

## 6.4 Logout

```http
POST /api/v1/auth/logout
```

Invalidate the session/refresh token if using persisted sessions and clear cookies.

---

## 6.5 Password reset

Implement later if the product requires real password recovery.

At minimum, the API contract should be reserved:

```http
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Do not fake this as a successful operation.

---

# 7. Phase 4 — Users and Supervisors

## 7.1 Admin user management

Endpoints:

```http
GET    /api/v1/users
GET    /api/v1/users/:id
POST   /api/v1/users
PATCH  /api/v1/users/:id
POST   /api/v1/users/:id/deactivate
POST   /api/v1/users/:id/activate
```

Admin only unless explicitly noted.

---

## 7.2 Create user

Request:

```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "employeeId": "EMP002",
  "department": "Engineering",
  "role": "user",
  "isSupervisor": false,
  "supervisorId": "user-supervisor-1",
  "status": "active"
}
```

Validation:

- unique email
- unique employee ID
- valid role
- supervisor must exist
- supervisor must be active
- supervisor must have `isSupervisor = true`
- user cannot be their own supervisor
- inactive users cannot become supervisors of others

---

## 7.3 Assign supervisor

Endpoint:

```http
PATCH /api/v1/users/:id/supervisor
```

Request:

```json
{
  "supervisorId": "user-supervisor-1"
}
```

Allow:

```json
{
  "supervisorId": null
}
```

to remove assignment.

---

## 7.4 Supervisors

```http
GET /api/v1/supervisors
```

Return active users where:

```text
isSupervisor = true
```

---

## 7.5 Supervisor's users

```http
GET /api/v1/supervisors/:id/users
```

Only:

```text
users.supervisorId === supervisorId
```

must be returned.

A supervisor must not automatically gain access to all users.

---

# 8. Phase 5 — Projects / SOW

## 8.1 Project endpoints

```http
GET    /api/v1/projects
GET    /api/v1/projects/:id
POST   /api/v1/projects
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
```

---

## 8.2 Project creation

Request compatible with:

```ts
CreateProjectInput
```

Example:

```json
{
  "name": "Alphanet ERP Upgrade",
  "sowNumber": "SOW-2026-001",
  "client": "Example Client",
  "description": "ERP implementation",
  "startDate": "2026-09-01",
  "endDate": "2026-12-31",
  "deadline": "2026-12-15",
  "status": "active",
  "managerId": "admin-1",
  "supervisorId": "user-supervisor-1",
  "teamMemberIds": ["user-1", "user-2"]
}
```

Server-side validation:

```text
startDate <= deadline <= endDate
```

unless product requirements explicitly establish a different deadline interpretation.

---

## 8.3 Team membership

Endpoints:

```http
POST   /api/v1/projects/:id/team
DELETE /api/v1/projects/:id/team/:userId
```

Request:

```json
{
  "userId": "user-123"
}
```

Rules:

- user must exist
- user must be active
- avoid duplicate team membership
- project must not be archived for new assignments

---

## 8.4 Supervisor assignment

```http
PATCH /api/v1/projects/:id/supervisor
```

Request:

```json
{
  "supervisorId": "user-supervisor-1"
}
```

Supervisor must:

```text
exist
be active
have isSupervisor=true
```

---

## 8.5 Project access

### Admin

Can access all projects.

### Assigned user

Can access projects where:

```text
teamMemberIds contains currentUser.id
```

### Supervisor

Can access projects where:

```text
supervisorId === currentUser.id
```

### Manager

If the manager is an admin account, standard admin rules apply.

Do not assume a `manager` is a third authentication role because the frontend does not define one.

---

# 9. Phase 6 — Timesheets

This is the most important business module.

---

## 9.1 Endpoints

```http
GET    /api/v1/timesheets
GET    /api/v1/timesheets/:id
POST   /api/v1/timesheets
PATCH  /api/v1/timesheets/:id
POST   /api/v1/timesheets/:id/submit
POST   /api/v1/timesheets/:id/withdraw
```

Approval endpoints are defined separately.

---

## 9.2 Create timesheet

```http
POST /api/v1/timesheets
```

Request:

```json
{
  "projectId": "project-1",
  "weekStart": "2026-09-07",
  "entries": [],
  "notes": ""
}
```

Do not trust `userId` from the client.

Derive:

```text
userId = req.user.id
```

This prevents users from creating timesheets for other users.

---

## 9.3 Week normalization

`weekStart` must be a Monday.

Reject:

```text
Tuesday
Wednesday
...
Sunday
```

with a validation error.

Alternatively normalize client input to Monday, but the API should still return the canonical Monday date.

Use date-only strings:

```text
YYYY-MM-DD
```

for business dates.

Do not accidentally shift dates because of UTC conversion.

---

## 9.4 Duplicate prevention

The combination:

```text
userId
projectId
weekStart
```

must be unique.

Enforce both:

1. application validation
2. MongoDB unique compound index

The MongoDB constraint is the final protection against concurrent requests.

---

## 9.5 Timesheet entry rules

Each entry:

```json
{
  "id": "entry-1",
  "description": "Development",
  "entryType": "regular",
  "hours": {
    "mon": 8,
    "tue": 8,
    "wed": 7.5,
    "thu": 8,
    "fri": 6,
    "sat": 0,
    "sun": 0
  }
}
```

---

## 9.6 Regular hours

For:

```text
entryType = regular
```

only:

```text
mon
tue
wed
thu
fri
```

may contain hours.

Saturday and Sunday must be:

```text
0
```

---

## 9.7 Overtime

For:

```text
entryType = overtime
```

only:

```text
sat
sun
```

may contain hours.

Monday-Friday must be:

```text
0
```

This reflects the current frontend requirement.

Do not silently classify weekday hours as overtime.

---

## 9.8 Hours validation

Each daily value must:

```text
be numeric
be finite
be >= 0
be within the configured daily maximum
```

Recommended default:

```text
24 hours/day
```

The system may later introduce company-specific limits.

Avoid floating-point surprises by normalizing hours to a reasonable precision, e.g. quarter-hour or two decimal places, depending on business requirements.

---

## 9.9 Description validation

If an entry contains hours:

```text
description is required
```

Do not allow:

```json
{
  "description": "",
  "hours": {
    "mon": 8
  }
}
```

---

## 9.10 Calculated totals

Never trust:

```text
regularHours
overtimeHours
totalHours
```

from the frontend.

The backend must calculate these.

For example:

```text
regularHours =
sum of regular entry hours Monday-Friday

overtimeHours =
sum of overtime entry hours Saturday-Sunday

totalHours =
regularHours + overtimeHours
```

Persist calculated totals if useful for reporting, but treat entries as the source of truth.

---

## 9.11 Save draft

```http
PATCH /api/v1/timesheets/:id
```

Only the owner may modify a draft.

Allowed editable states:

```text
draft
declined
withdrawn
```

Whether withdrawn sheets are editable should be kept consistent with the frontend workflow. If the UI permits editing and resubmitting, support it. Otherwise treat withdrawn as a terminal state.

Recommended behavior:

```text
draft → editable
declined → editable
withdrawn → editable
pending → locked
approved → locked
```

---

## 9.12 Submit

```http
POST /api/v1/timesheets/:id/submit
```

Allowed:

```text
draft → pending
declined → pending
withdrawn → pending
```

Reject:

```text
pending → pending
approved → pending
```

Before submission validate:

- owner
- project access
- valid week
- valid entries
- valid hours
- at least one hour
- no invalid day/type combinations
- project is eligible
- user is active

Set:

```text
submittedAt
updatedAt
status = pending
```

---

# 10. Phase 7 — Approval Workflow

## 10.1 Approval endpoints

```http
GET  /api/v1/approvals
POST /api/v1/timesheets/:id/approve
POST /api/v1/timesheets/:id/decline
```

---

## 10.2 Admin approval

Admins may review:

```text
all pending timesheets
```

---

## 10.3 Supervisor approval

A supervisor may review a pending timesheet only if:

```text
timesheet.userId is assigned to supervisor
```

OR, if project supervision is part of the intended business rule:

```text
timesheet.projectId is supervised by supervisor
```

The final authorization helper should centralize this decision.

Recommended policy:

```ts
canReviewTimesheet(reviewer, timesheet)
```

---

## 10.4 Normal users

Normal users cannot:

```text
approve
decline
review other users' timesheets
```

---

## 10.5 Approve

```http
POST /api/v1/timesheets/:id/approve
```

Allowed:

```text
pending → approved
```

Set:

```json
{
  "review": {
    "reviewedBy": "user-supervisor-1",
    "reviewedAt": "2026-09-10T12:00:00.000Z"
  }
}
```

---

## 10.6 Decline

```http
POST /api/v1/timesheets/:id/decline
```

Request:

```json
{
  "reason": "Please provide a description for Wednesday."
}
```

Reason should be required.

Transition:

```text
pending → declined
```

Set review information.

---

## 10.7 Withdraw

```http
POST /api/v1/timesheets/:id/withdraw
```

Only the owner may withdraw.

Allowed:

```text
pending → withdrawn
```

A user cannot withdraw:

```text
approved
declined
draft
```

The current frontend includes an optional reason. Preserve compatibility:

```json
{
  "reason": "Need to correct submitted hours."
}
```

---

# 11. Phase 8 — Notifications

Endpoints:

```http
GET  /api/v1/notifications
GET  /api/v1/notifications/unread-count
POST /api/v1/notifications/:id/read
POST /api/v1/notifications/read-all
```

The backend should automatically create notifications for important events.

---

## 11.1 Submission

When:

```text
user submits timesheet
```

notify relevant reviewer(s):

```text
submission
```

---

## 11.2 Approval

When approved:

```text
notify timesheet owner
```

type:

```text
approval
```

---

## 11.3 Decline

When declined:

```text
notify timesheet owner
```

type:

```text
decline
```

Include the decline reason.

---

## 11.4 Withdrawal

Notify relevant reviewer(s).

---

## 11.5 Assignment

When a user is assigned to a project or supervisor:

```text
assignment
```

notification.

---

## 11.6 Deadline

Deadline notifications can initially be generated by an API/service or scheduled Vercel mechanism.

Do not create a permanent Node process.

For scheduled operations on Vercel, use Vercel Cron or an equivalent externally triggered endpoint.

The endpoint must be protected with a secret.

---

# 12. Phase 9 — Activities / Audit Trail

Implement:

```http
GET /api/v1/activities
GET /api/v1/users/:id/activities
GET /api/v1/projects/:id/activities
GET /api/v1/timesheets/:id/activities
```

The backend should create activities for:

- user created
- user activated/deactivated
- supervisor assigned
- project created
- project updated
- project team changed
- project supervisor changed
- timesheet created
- timesheet updated
- timesheet submitted
- timesheet withdrawn
- timesheet approved
- timesheet declined
- document uploaded
- document deleted

Activity creation should happen server-side.

Do not allow clients to arbitrarily write audit messages.

---

# 13. Phase 10 — Reports

The current frontend has report structures for:

```text
hours by project
hours by employee
overtime statistics
timesheet status breakdown
```

Implement:

```http
GET /api/v1/reports/hours-by-project
GET /api/v1/reports/hours-by-employee
GET /api/v1/reports/overtime
GET /api/v1/reports/timesheet-status
```

Admin-only by default.

---

## 13.1 Filters

Support:

```text
dateRange
startDate
endDate
projectId
userId
department
```

Compatible with:

```ts
ReportFilters
```

---

## 13.2 Date semantics

Reports should clearly document whether filtering is:

```text
timesheet weekStart
```

or:

```text
individual entry dates
```

For the current weekly timesheet model, use the week represented by `weekStart`.

---

## 13.3 Aggregation

Use MongoDB aggregation pipelines rather than loading all timesheets into memory.

Do not calculate large reports entirely inside JavaScript if MongoDB can perform the aggregation efficiently.

---

# 14. Phase 11 — Documents

Vercel Functions should **not** use local disk as permanent file storage.

Use object storage.

Recommended option:

```text
Vercel Blob
```

or an S3-compatible object store.

MongoDB stores metadata only.

---

## 14.1 Document model

```ts
interface Document {
  id: string
  projectId: string
  name: string
  size: number
  mimeType: string
  storageKey: string
  url?: string
  uploadedBy: string
  createdAt: string
}
```

---

## 14.2 Endpoints

```http
GET    /api/v1/projects/:projectId/documents
POST   /api/v1/projects/:projectId/documents
DELETE /api/v1/projects/:projectId/documents/:documentId
```

The exact upload mechanism may be:

```text
browser → backend → object storage
```

for small files, or preferably:

```text
browser → signed/upload URL → object storage
                    ↓
              backend metadata
```

for larger files.

Do not store binary files directly in MongoDB unless there is a specific future requirement for GridFS.

---

# 15. Phase 12 — Frontend API Integration ✅ Done

After backend endpoints are stable, replace the mock/localStorage service implementations.

The frontend should retain service names where possible:

```text
authService
userService
projectService
timesheetService
notificationService
activityService
reportService
```

but change implementation:

```text
Before:

React
 ↓
service
 ↓
localStorage

After:

React
 ↓
service
 ↓
HTTP client
 ↓
Vercel API
 ↓
Express
 ↓
MongoDB Atlas
```

---

## 15.1 Create API client

Create something like:

```text
frontend/src/services/apiClient.ts
```

Responsibilities:

- base URL
- credentials
- JSON headers
- request timeout
- parse response
- normalized errors
- 401 handling
- optional retry for safe requests

---

## 15.2 Environment variable

Frontend:

```text
VITE_API_BASE_URL
```

Example:

```text
https://your-api-domain.vercel.app/api/v1
```

If frontend and backend are deployed together:

```text
/api/v1
```

can be used.

---

## 15.3 Authentication

Prefer HttpOnly cookies.

The frontend should not manually store long-lived JWT secrets in localStorage.

The frontend should call:

```http
GET /api/v1/auth/me
```

on application startup.

---

# 16. Phase 13 — Validation and Security

Security must be implemented on the backend even if the frontend already validates inputs.

---

## 16.1 Zod validation

Create schemas:

```text
userSchemas.ts
projectSchemas.ts
timesheetSchemas.ts
authSchemas.ts
notificationSchemas.ts
reportSchemas.ts
```

Validate:

```text
body
query
params
```

before controller logic.

---

## 16.2 Authorization

Implement middleware:

```text
requireAuth
requireAdmin
requireSupervisor
```

and policy functions:

```text
canAccessProject
canEditProject
canAccessTimesheet
canEditTimesheet
canReviewTimesheet
canManageUser
```

Never trust:

```text
userId
role
isSupervisor
```

sent from the browser.

Derive identity from the authenticated session.

---

## 16.3 CORS

Only allow configured frontend origins.

Environment variable:

```text
FRONTEND_URL
```

Do not use:

```text
Access-Control-Allow-Origin: *
```

when using credentials.

---

## 16.4 Helmet

Enable Helmet with appropriate production configuration.

---

## 16.5 Rate limiting

At minimum rate-limit:

```text
POST /auth/login
POST /auth/forgot-password
POST /auth/reset-password
```

and consider broader API rate limits.

---

## 16.6 Password policy

Require reasonable password strength.

Do not make the frontend the only enforcement point.

---

## 16.7 Object-level authorization

This is critical.

Do not implement authorization as:

```text
if logged in → return resource
```

Every resource must check ownership/assignment.

Example:

```text
GET /timesheets/timesheet-123
```

must verify the requester is:

```text
admin
OR owner
OR authorized supervisor
```

---

## 16.8 No sensitive logging

Never log:

```text
password
JWT
session token
reset token
database connection string
```

---

# 17. Phase 14 — Testing

Use:

```text
Vitest
Supertest
```

---

## 17.1 Unit tests

Test:

```text
week normalization
timesheet totals
timesheet validation
permission functions
status transitions
project access
supervisor access
```

---

## 17.2 API integration tests

Test:

```text
login
me
logout
user CRUD
supervisor assignment
project CRUD
team assignment
timesheet creation
timesheet draft update
timesheet submission
withdrawal
approval
decline
notifications
reports
```

---

## 17.3 Security tests

Explicitly test that:

```text
normal user cannot list all users
normal user cannot access another user's timesheet
normal user cannot approve
normal user cannot decline
normal user cannot modify another user's timesheet
supervisor cannot access unrelated user's timesheet
supervisor cannot modify project ownership arbitrarily
user cannot impersonate another user by passing userId
admin-only endpoints reject normal users
```

---

# 18. Phase 15 — Deployment to Vercel

The backend must deploy as Vercel Functions.

---

## 18.1 Do not use

Do not deploy a permanent:

```text
Node server
PM2 process
Docker-only server
app.listen() production server
```

The production entry should be the Vercel Function.

---

## 18.2 Recommended structure

```text
Alphanet/
├── frontend/
└── backend/
    ├── api/
    │   └── index.ts
    ├── src/
    │   ├── app.ts
    │   ├── server.ts
    │   ├── config/
    │   ├── controllers/
    │   ├── middleware/
    │   ├── models/
    │   ├── repositories/
    │   ├── routes/
    │   ├── services/
    │   ├── schemas/
    │   ├── policies/
    │   ├── utils/
    │   └── lib/
    ├── scripts/
    ├── tests/
    ├── package.json
    ├── tsconfig.json
    ├── vercel.json
    ├── .env.example
    └── README.md
```

---

## 18.3 Environment variables on Vercel

Configure:

```text
MONGODB_URI
MONGODB_DB_NAME
JWT_SECRET
JWT_REFRESH_SECRET
FRONTEND_URL
COOKIE_DOMAIN
NODE_ENV
```

If using Vercel Blob:

```text
BLOB_READ_WRITE_TOKEN
```

Do not commit real values.

---

# 19. Phase 16 — Seed / Demo Data

Create:

```text
backend/scripts/seed.ts
```

Seed stable demo accounts.

Recommended:

```text
Admin
email: admin@alphanet.local

User
email: user@alphanet.local

Supervisor
email: supervisor@alphanet.local
```

Use a development-only known password.

Do not use production credentials.

---

## 19.1 Demo supervisor

The supervisor user must have:

```json
{
  "role": "user",
  "isSupervisor": true
}
```

and at least one assigned user/project.

---

## 19.2 Seed project

Create at least:

```text
one active project
one draft project
one completed project
```

---

## 19.3 Seed timesheets

Create examples covering:

```text
draft
pending
approved
declined
withdrawn
```

This allows the entire UI workflow to be demonstrated.

---

# 20. Phase 17 — Production Hardening

Before declaring production-ready:

- add indexes
- verify unique constraints
- validate all API inputs
- verify all authorization rules
- add request IDs
- add structured logs
- configure rate limits
- configure CORS
- configure secure cookies
- configure MongoDB Atlas network/security rules
- create backups
- test Vercel cold starts
- test concurrent writes
- test duplicate timesheet creation
- test expired sessions
- test revoked sessions
- test malformed requests
- test large upload rejection
- test report performance

---

# 21. MongoDB Collections

## users

Example:

```json
{
  "_id": "ObjectId",
  "name": "John Smith",
  "email": "john@example.com",
  "employeeId": "EMP001",
  "department": "Engineering",
  "role": "user",
  "isSupervisor": false,
  "status": "active",
  "supervisorId": "user-supervisor-1",
  "passwordHash": "...",
  "createdAt": "ISODate",
  "updatedAt": "ISODate",
  "lastLoginAt": "ISODate"
}
```

---

## projects

```json
{
  "_id": "ObjectId",
  "name": "ERP Upgrade",
  "sowNumber": "SOW-2026-001",
  "client": "Client A",
  "description": "ERP implementation",
  "startDate": "2026-09-01",
  "endDate": "2026-12-31",
  "deadline": "2026-12-15",
  "status": "active",
  "managerId": "admin-1",
  "supervisorId": "user-supervisor-1",
  "teamMemberIds": ["user-1", "user-2"],
  "documentIds": [],
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

---

## timesheets

```json
{
  "_id": "ObjectId",
  "userId": "user-1",
  "projectId": "project-1",
  "weekStart": "2026-09-07",
  "entries": [],
  "notes": "",
  "regularHours": 40,
  "overtimeHours": 4,
  "totalHours": 44,
  "status": "pending",
  "submittedAt": "ISODate",
  "review": {
    "reviewedBy": "user-supervisor-1",
    "reviewedAt": "ISODate",
    "reason": null
  },
  "createdAt": "ISODate",
  "updatedAt": "ISODate"
}
```

---

## notifications

```json
{
  "_id": "ObjectId",
  "userId": "user-1",
  "type": "approval",
  "title": "Timesheet approved",
  "message": "Your weekly timesheet has been approved.",
  "read": false,
  "relatedId": "timesheet-1",
  "createdAt": "ISODate"
}
```

---

## activities

```json
{
  "_id": "ObjectId",
  "userId": "user-1",
  "projectId": "project-1",
  "timesheetId": "timesheet-1",
  "description": "Timesheet submitted",
  "action": "timesheet.submitted",
  "metadata": {},
  "createdAt": "ISODate"
}
```

---

# 22. Data Models

Create TypeScript domain types independently of raw MongoDB documents.

Recommended:

```text
src/models/
```

Do not leak MongoDB `ObjectId` into the frontend.

Use a mapper:

```ts
toUserResponse(document)
toProjectResponse(document)
toTimesheetResponse(document)
```

---

# 23. REST API Contract

Base path:

```text
/api/v1
```

---

## Authentication

```text
POST /auth/login
POST /auth/logout
GET  /auth/me
POST /auth/forgot-password
POST /auth/reset-password
```

---

## Users

```text
GET   /users
GET   /users/:id
POST  /users
PATCH /users/:id
POST  /users/:id/activate
POST  /users/:id/deactivate
PATCH /users/:id/supervisor
```

---

## Supervisors

```text
GET /supervisors
GET /supervisors/:id/users
```

---

## Projects

```text
GET    /projects
GET    /projects/:id
POST   /projects
PATCH  /projects/:id
DELETE /projects/:id

POST   /projects/:id/team
DELETE /projects/:id/team/:userId

PATCH  /projects/:id/supervisor

GET    /projects/:id/documents
POST   /projects/:id/documents
DELETE /projects/:id/documents/:documentId

GET    /projects/:id/timesheets
GET    /projects/:id/activities
```

---

## Timesheets

```text
GET   /timesheets
GET   /timesheets/:id
POST  /timesheets
PATCH /timesheets/:id

POST /timesheets/:id/submit
POST /timesheets/:id/withdraw
POST /timesheets/:id/approve
POST /timesheets/:id/decline

GET /timesheets/current-week
```

---

## Approvals

```text
GET /approvals
```

This endpoint should return the timesheets the current reviewer is authorized to review.

For admin:

```text
all pending
```

For supervisor:

```text
authorized pending
```

---

## Notifications

```text
GET  /notifications
GET  /notifications/unread-count
POST /notifications/:id/read
POST /notifications/read-all
```

---

## Activities

```text
GET /activities
GET /users/:id/activities
GET /projects/:id/activities
GET /timesheets/:id/activities
```

---

## Reports

```text
GET /reports/hours-by-project
GET /reports/hours-by-employee
GET /reports/overtime
GET /reports/timesheet-status
```

---

# 24. Authentication and Authorization Rules

Use a central policy layer.

---

## 24.1 Admin

Admin can:

```text
manage users
manage projects
assign supervisors
view all timesheets
review all pending timesheets
view reports
view notifications
view activities
```

---

## 24.2 User

User can:

```text
view own profile
view assigned projects
create own timesheets
edit own editable timesheets
submit own timesheets
withdraw own pending timesheets
view own notifications
```

---

## 24.3 Supervisor

Supervisor inherits user permissions and additionally can:

```text
view assigned users
view assigned project timesheets
review authorized pending timesheets
approve
decline
view relevant project/user activity
```

Supervisor must not automatically become an admin.

---

# 25. Timesheet Business Rules

Implement these in a dedicated service/policy module.

Recommended:

```text
src/services/timesheetService.ts
src/policies/timesheetPolicy.ts
src/utils/timesheetCalculator.ts
```

Rules:

1. User can only create timesheets for themselves.
2. User must be assigned to the project.
3. Project must exist.
4. Duplicate user/project/week is forbidden.
5. Week starts Monday.
6. Regular hours only Mon-Fri.
7. Overtime only Sat-Sun.
8. Hours cannot be negative.
9. Hours cannot exceed configured maximum.
10. Entry description required when hours > 0.
11. Totals calculated server-side.
12. Only draft/declined/withdrawn sheets are editable according to workflow.
13. Only owner can submit/withdraw.
14. Only authorized reviewer can approve/decline.
15. Decline reason required.
16. Approved timesheets are immutable.
17. Pending timesheets are locked for the owner.
18. Every transition creates an activity.
19. Every important transition creates notifications.
20. Database constraints must prevent duplicate weekly timesheets.

---

# 26. Status State Machines

## Project

```text
draft
  ↓
active
  ↓
completed

active
  ↓
overdue

draft/active/completed/overdue
  ↓
archived
```

Do not allow arbitrary status changes from the frontend.

The backend should validate transitions.

---

## Timesheet

Main path:

```text
draft
  ↓
pending
  ↓
approved
```

Decline path:

```text
pending
  ↓
declined
  ↓
pending
```

Withdrawal path:

```text
pending
  ↓
withdrawn
  ↓
pending
```

Do not allow:

```text
approved → pending
approved → declined
approved → withdrawn
```

unless a future explicit administrative correction workflow is introduced.

---

# 27. Error Handling

Use a centralized Express error middleware.

Never return arbitrary stack traces in production.

---

## 27.1 Error response

Use:

```json
{
  "success": false,
  "error": {
    "code": "TIMESHEET_NOT_FOUND",
    "message": "Timesheet not found."
  }
}
```

Validation:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed.",
    "details": [
      {
        "field": "weekStart",
        "message": "weekStart must be a Monday."
      }
    ]
  }
}
```

---

## 27.2 Recommended HTTP statuses

```text
200 OK
201 Created
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
```

Use `409` for conflicts such as:

```text
duplicate email
duplicate employee ID
duplicate timesheet
invalid concurrent state transition
```

---

# 28. Response Format

Use a consistent envelope.

Success:

```json
{
  "success": true,
  "data": {}
}
```

List:

```json
{
  "success": true,
  "data": [],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action."
  }
}
```

The frontend API client should normalize this into a predictable error type.

---

# 29. Pagination / Filtering / Sorting

Admin lists can become large.

Support:

```text
?page=1&limit=20
```

and:

```text
?search=john
?status=active
?department=Engineering
?sortBy=createdAt
?sortOrder=desc
```

Timesheets:

```text
?status=pending
?projectId=...
?userId=...
?weekStart=...
```

Do not allow arbitrary MongoDB field names or sort expressions directly from clients.

Whitelist sortable fields.

---

# 30. Environment Variables

Backend `.env.example`:

```text
NODE_ENV=development

PORT=4000

MONGODB_URI=
MONGODB_DB_NAME=alphanet

JWT_SECRET=
JWT_REFRESH_SECRET=

FRONTEND_URL=http://localhost:5173

COOKIE_DOMAIN=

BLOB_READ_WRITE_TOKEN=
```

If the authentication implementation uses only persisted sessions rather than JWT refresh tokens, remove unused JWT variables.

Never commit:

```text
.env
.env.local
production credentials
```

---

# 31. Recommended Backend Structure

Use this structure unless there is a strong reason to change it:

```text
backend/
├── api/
│   └── index.ts
│
├── src/
│   ├── app.ts
│   ├── server.ts
│   │
│   ├── config/
│   │   ├── env.ts
│   │   └── constants.ts
│   │
│   ├── lib/
│   │   ├── mongodb.ts
│   │   ├── logger.ts
│   │   └── auth.ts
│   │
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── authorization.ts
│   │   ├── validation.ts
│   │   ├── errorHandler.ts
│   │   ├── notFound.ts
│   │   └── rateLimit.ts
│   │
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── users.routes.ts
│   │   ├── supervisors.routes.ts
│   │   ├── projects.routes.ts
│   │   ├── timesheets.routes.ts
│   │   ├── approvals.routes.ts
│   │   ├── notifications.routes.ts
│   │   ├── activities.routes.ts
│   │   └── reports.routes.ts
│   │
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── users.controller.ts
│   │   ├── projects.controller.ts
│   │   ├── timesheets.controller.ts
│   │   ├── approvals.controller.ts
│   │   ├── notifications.controller.ts
│   │   ├── activities.controller.ts
│   │   └── reports.controller.ts
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── users.service.ts
│   │   ├── projects.service.ts
│   │   ├── timesheets.service.ts
│   │   ├── notifications.service.ts
│   │   ├── activities.service.ts
│   │   ├── reports.service.ts
│   │   └── documents.service.ts
│   │
│   ├── repositories/
│   │   ├── users.repository.ts
│   │   ├── projects.repository.ts
│   │   ├── timesheets.repository.ts
│   │   ├── notifications.repository.ts
│   │   ├── activities.repository.ts
│   │   └── documents.repository.ts
│   │
│   ├── policies/
│   │   ├── project.policy.ts
│   │   ├── timesheet.policy.ts
│   │   └── user.policy.ts
│   │
│   ├── schemas/
│   │   ├── auth.schema.ts
│   │   ├── user.schema.ts
│   │   ├── project.schema.ts
│   │   ├── timesheet.schema.ts
│   │   ├── notification.schema.ts
│   │   └── report.schema.ts
│   │
│   ├── models/
│   │   ├── user.ts
│   │   ├── project.ts
│   │   ├── timesheet.ts
│   │   ├── notification.ts
│   │   ├── activity.ts
│   │   └── document.ts
│   │
│   ├── utils/
│   │   ├── dates.ts
│   │   ├── ids.ts
│   │   ├── pagination.ts
│   │   └── timesheet.ts
│   │
│   └── types/
│       ├── express.d.ts
│       └── api.ts
│
├── scripts/
│   ├── seed.ts
│   └── indexes.ts
│
├── tests/
│   ├── unit/
│   └── integration/
│
├── package.json
├── tsconfig.json
├── vercel.json
├── .env.example
├── .gitignore
└── README.md
```

---

# 32. Frontend Integration Requirements

The backend is considered compatible only if the existing frontend can transition from mock services to API services without rewriting the entire UI.

---

## 32.1 Preserve frontend-facing field names

Prefer:

```text
id
createdAt
updatedAt
```

rather than:

```text
_id
created_at
updated_at
```

in API responses.

---

## 32.2 Preserve enum values

Do not change:

```text
admin
user
```

or:

```text
draft
active
completed
overdue
archived
```

or:

```text
draft
pending
approved
declined
withdrawn
```

without updating the frontend contract.

---

## 32.3 Preserve timesheet day keys

Use exactly:

```text
mon
tue
wed
thu
fri
sat
sun
```

---

## 32.4 Current frontend service mapping

Replace:

```ts
authService.login()
```

with:

```http
POST /api/v1/auth/login
```

Replace:

```ts
authService.getCurrentUser()
```

with:

```http
GET /api/v1/auth/me
```

Replace:

```ts
userService.getUsers()
```

with:

```http
GET /api/v1/users
```

Replace:

```ts
userService.createUser()
```

with:

```http
POST /api/v1/users
```

Replace:

```ts
projectService.getProjects()
```

with:

```http
GET /api/v1/projects
```

Replace:

```ts
projectService.createProject()
```

with:

```http
POST /api/v1/projects
```

Replace:

```ts
timesheetService.createTimesheet()
```

with:

```http
POST /api/v1/timesheets
```

Replace:

```ts
timesheetService.saveDraft()
```

with:

```http
PATCH /api/v1/timesheets/:id
```

Replace:

```ts
timesheetService.submitTimesheet()
```

with:

```http
POST /api/v1/timesheets/:id/submit
```

Replace:

```ts
timesheetService.withdrawTimesheet()
```

with:

```http
POST /api/v1/timesheets/:id/withdraw
```

Replace:

```ts
timesheetService.approveTimesheet()
```

with:

```http
POST /api/v1/timesheets/:id/approve
```

Replace:

```ts
timesheetService.declineTimesheet()
```

with:

```http
POST /api/v1/timesheets/:id/decline
```

---

# 33. Definition of Done

The backend is **not done** merely because the API starts.

It is done when all of the following are true.

## Foundation

- [ ] TypeScript builds successfully.
- [ ] Express starts locally.
- [ ] Vercel Function entry exists.
- [ ] No production `app.listen()` is used inside the Vercel function.
- [ ] MongoDB Atlas connection works.
- [ ] MongoDB client is cached between warm invocations.
- [ ] Environment variables are validated.
- [ ] `.env.example` exists.

## Authentication

- [ ] Admin login works.
- [ ] User login works.
- [ ] Supervisor login works as a user with `isSupervisor=true`.
- [ ] `/auth/me` works.
- [ ] Logout works.
- [ ] Passwords are hashed.
- [ ] Unauthorized requests return 401.
- [ ] Inactive users cannot log in.

## Users

- [ ] Admin can create users.
- [ ] Admin can update users.
- [ ] Admin can activate/deactivate users.
- [ ] Admin can assign supervisors.
- [ ] Supervisor lists only contain supervisor-capable users.
- [ ] Supervisor user lists are correctly scoped.

## Projects

- [ ] Admin can create projects.
- [ ] Admin can edit projects.
- [ ] Admin can archive/delete according to business rules.
- [ ] Team assignment works.
- [ ] Supervisor assignment works.
- [ ] User project access is scoped.
- [ ] Supervisor project access is scoped.

## Timesheets

- [ ] User can create a timesheet.
- [ ] Duplicate weekly timesheets are prevented.
- [ ] Monday-Friday regular hours work.
- [ ] Saturday-Sunday overtime works.
- [ ] Invalid day/type combinations are rejected.
- [ ] Totals are calculated server-side.
- [ ] Draft saving works.
- [ ] Submission works.
- [ ] Withdrawal works.
- [ ] Decline works.
- [ ] Resubmission works.
- [ ] Approved timesheets are locked.

## Approval

- [ ] Admin sees all pending timesheets.
- [ ] Supervisor sees only authorized pending timesheets.
- [ ] Normal users cannot approve.
- [ ] Unauthorized supervisors cannot approve.
- [ ] Approval creates notification.
- [ ] Decline requires a reason.
- [ ] Decline creates notification.

## Notifications

- [ ] Submission notification works.
- [ ] Approval notification works.
- [ ] Decline notification works.
- [ ] Withdrawal notification works.
- [ ] Assignment notification works.
- [ ] Mark read works.
- [ ] Mark all read works.
- [ ] Unread count works.

## Reports

- [ ] Hours by project works.
- [ ] Hours by employee works.
- [ ] Overtime report works.
- [ ] Status breakdown works.
- [ ] Filters work.
- [ ] Pagination works where needed.

## Security

- [ ] All protected routes require authentication.
- [ ] Role checks work.
- [ ] Object-level access checks work.
- [ ] Rate limiting works.
- [ ] Helmet enabled.
- [ ] CORS restricted.
- [ ] Sensitive fields never returned.
- [ ] Passwords never logged.
- [ ] Tokens never logged.
- [ ] MongoDB injection-style inputs are safely handled.
- [ ] Request validation is centralized.

## Deployment

- [ ] Local development works.
- [ ] Vercel deployment works.
- [ ] MongoDB Atlas works from Vercel.
- [ ] Environment variables are configured.
- [ ] Cold-start invocation works.
- [ ] Multiple concurrent requests work.
- [ ] No local filesystem dependency exists.

---

# 34. Final End-to-End Acceptance Test

The coding agent must manually test this complete workflow.

## Step 1 — Admin login

Login as:

```text
admin@alphanet.local
```

Verify:

```text
role = admin
```

---

## Step 2 — Create supervisor

Create:

```text
Sarah Supervisor
isSupervisor = true
role = user
```

---

## Step 3 — Create normal user

Create:

```text
John User
role = user
isSupervisor = false
supervisorId = Sarah
```

Verify:

```text
John.supervisorId === Sarah.id
```

---

## Step 4 — Create project

Create:

```text
Project: ERP Upgrade
SOW: SOW-2026-001
Supervisor: Sarah
Team: John
```

---

## Step 5 — Login as John

Verify John can:

```text
see ERP Upgrade
```

and cannot see unrelated projects.

---

## Step 6 — Create weekly timesheet

John creates:

```text
weekStart = Monday
project = ERP Upgrade
```

Verify:

```text
status = draft
```

---

## Step 7 — Enter regular hours

Enter:

```text
Mon 8
Tue 8
Wed 8
Thu 8
Fri 8
```

Verify:

```text
regularHours = 40
overtimeHours = 0
totalHours = 40
```

---

## Step 8 — Enter overtime

Enter:

```text
Sat 4
Sun 2
```

Verify:

```text
regularHours = 40
overtimeHours = 6
totalHours = 46
```

---

## Step 9 — Invalid data test

Attempt:

```text
regular entry:
Saturday = 4
```

Backend must reject it.

Attempt:

```text
overtime entry:
Monday = 4
```

Backend must reject it.

---

## Step 10 — Submit

John submits.

Verify:

```text
draft → pending
```

and Sarah receives:

```text
submission notification
```

---

## Step 11 — Supervisor review

Login as Sarah.

Verify Sarah can see John's pending timesheet.

Sarah approves.

Verify:

```text
pending → approved
```

and John receives:

```text
approval notification
```

---

## Step 12 — Security test

While logged in as John, attempt to:

```text
approve John's own timesheet
approve Sarah's unrelated timesheet
read another user's timesheet
modify another user's timesheet
```

All must fail with:

```text
403 Forbidden
```

or the appropriate authorization response.

---

## Step 13 — Decline workflow

Create another timesheet.

Submit it.

Sarah declines:

```text
reason = "Please correct Wednesday's hours."
```

Verify:

```text
pending → declined
```

John receives a decline notification.

John edits it and resubmits.

Verify:

```text
declined → pending
```

---

## Step 14 — Withdrawal workflow

Create and submit another timesheet.

Before review:

```text
pending
```

John withdraws it.

Verify:

```text
pending → withdrawn
```

Sarah receives a withdrawal notification.

---

## Step 15 — Reports

Admin opens reports.

Verify data includes:

```text
John
ERP Upgrade
regular hours
overtime hours
approved/declined/pending status
```

---

# Important Implementation Principles

## Principle 1 — Backend is the source of truth

The frontend is not trusted.

Never trust:

```text
userId
role
isSupervisor
regularHours
overtimeHours
totalHours
status
reviewedBy
```

from the client.

Derive or validate all of them server-side.

---

## Principle 2 — Authorization before data access

Do not:

```text
fetch everything
then filter in JavaScript
```

when authorization can be expressed in MongoDB queries.

Prefer:

```text
findOne({
  _id: timesheetId,
  userId: currentUser.id
})
```

for ownership checks.

---

## Principle 3 — Keep business logic out of Express controllers

Controllers should primarily:

```text
parse request
call service
return response
```

Business logic belongs in services/policies.

---

## Principle 4 — Keep MongoDB details out of controllers

Use repositories/data-access modules.

```text
controller
   ↓
service
   ↓
repository
   ↓
MongoDB
```

---

## Principle 5 — Serverless means stateless

Never rely on:

```text
in-memory sessions
in-memory arrays
local filesystem
long-running workers
```

for core application state.

MongoDB/object storage are the persistent sources of truth.

---

## Principle 6 — Preserve frontend compatibility

The goal is not to force the frontend to be rewritten.

The API should map cleanly onto the existing frontend types and service functions.

---

## Principle 7 — Make backend integration incremental

The recommended sequence is:

```text
Phase 0
Fix frontend

Phase 1
Backend foundation

Phase 2
MongoDB

Phase 3
Auth

Phase 4
Users

Phase 5
Projects

Phase 6
Timesheets

Phase 7
Approvals

Phase 8
Notifications

Phase 9
Activities

Phase 10
Reports

Phase 11
Documents

Phase 12
Connect frontend

Phase 13
Security hardening

Phase 14
Tests

Phase 15
Vercel deployment

Phase 16
Seed/demo data

Phase 17
Production hardening
```

Do not jump directly to Phase 12.

---

# Final Expected Architecture

The completed application should look like:

```text
                         ┌─────────────────────┐
                         │  React Frontend     │
                         │  Vite + TS + Tailwind│
                         └──────────┬──────────┘
                                    │
                              HTTPS / JSON
                                    │
                         ┌──────────▼──────────┐
                         │   Vercel Functions  │
                         │                     │
                         │      Express        │
                         │         │           │
                         │    Controllers      │
                         │         │           │
                         │      Services       │
                         │         │           │
                         │      Policies       │
                         │         │           │
                         │    Repositories     │
                         └──────────┬──────────┘
                                    │
                         MongoDB Node.js Driver
                                    │
                         ┌──────────▼──────────┐
                         │   MongoDB Atlas     │
                         │                     │
                         │ users               │
                         │ projects            │
                         │ timesheets          │
                         │ notifications       │
                         │ activities          │
                         │ documents           │
                         │ sessions            │
                         └─────────────────────┘

                         Documents
                              │
                              ▼
                       Object Storage
                     (Vercel Blob/S3)
```

The backend should be a **clean REST API**, not a frontend-specific collection of ad-hoc endpoints.

The most important objective is that once Phase 12 is complete, the existing Alphanet frontend can operate almost entirely unchanged at the page/component level, with its service implementations switching from mock/localStorage data to the real Vercel + MongoDB backend.

---

# Progress Checklist

Use this checklist to track implementation progress. Mark items as `[x]` when complete. Do not skip phases.

## Phase 0 — Frontend Corrections

### 0.1 Create Timesheet Flow
- [x] Add "New Timesheet" entry point in User Dashboard / My Timesheets
- [x] Implement project selection (only assigned projects)
- [x] Implement week selection (Monday-normalized)
- [x] Prevent duplicate timesheet creation for same user + project + week
- [x] New timesheet starts as `draft` status
- [x] Inactive/completed/archived projects excluded from selection

### 0.2 User → Supervisor Assignment
- [x] Add Supervisor dropdown to Create User form
- [x] Add Supervisor dropdown to Edit User form
- [x] Add "Enable Supervisor Capability" toggle to Create User
- [x] Add "Enable Supervisor Capability" toggle to Edit User
- [x] Ensure `isSupervisor` and `supervisorId` are independently controllable

### 0.3 Fix Demo Supervisor Login
- [x] Replace role-only demo login with explicit demo accounts
- [x] Create `loginAsDemo('admin-demo')` behavior
- [x] Create `loginAsDemo('user-demo')` behavior
- [x] Create `loginAsDemo('supervisor-demo')` behavior
- [x] Ensure backend seed data uses stable IDs/emails for demo accounts

### 0.4 Fix Supervisor Route Protection
- [x] Update `/supervisor` route guards to require `role === 'user'` AND `isSupervisor === true`
- [x] Do not rely on hidden navigation for authorization
- [x] Test unauthorized access returns to appropriate dashboard

### 0.5 Remove Direct Mock Imports
- [x] Audit all pages for direct `mock/` imports
- [x] Refactor pages to import from `services/` only
- [x] Ensure service layer can still use mock data during transition
- [x] Verify no page directly imports from `mock/users`, `mock/projects`, `mock/timesheets`, `mock/notifications`

### 0.6 Fix `getUsersBySupervisorId`
- [x] Correct filter logic to `users.filter(user => user.supervisorId === supervisorId)`
- [x] Remove incorrect logic that returns every user except supervisor
- [x] Add/update tests for this function

### 0.7 Approval Actions Permission-Aware
- [x] Admin can review all pending timesheets
- [x] Supervisor can review only assigned users' timesheets
- [x] Normal users cannot approve or decline
- [x] UI hides/shows approval controls based on permissions

### 0.8 Strengthen Frontend Validation
- [x] Regular entries: Mon-Fri allowed, Sat-Sun = 0
- [x] Overtime entries: Sat-Sun allowed, Mon-Fri = 0
- [x] Non-negative hours enforced
- [x] Sensible daily maximum enforced
- [x] Description required when hours > 0
- [x] At least one hour required before submission
- [x] Valid Monday week enforced
- [x] Assigned project validated

### 0.9 Document Upload Preparation
- [x] Refactor document handling to support future API endpoints
- [x] Ensure actual file bytes are not stored in localStorage
- [x] Prepare for `POST /api/v1/projects/:projectId/documents`
- [x] Prepare for `DELETE /api/v1/projects/:projectId/documents/:documentId`
- [x] Prepare for `GET /api/v1/projects/:projectId/documents`

### 0.10 Clean Up Fake Dashboard Analytics
- [x] Remove hard-coded "this month" trend metrics
- [x] Calculate trends from mock data or remove until backend reports are connected

---

## Phase 1 — Backend Foundation

### 1.1 Project Setup
- [x] Create `/backend` directory
- [x] Initialize `package.json` with required dependencies
- [x] Install: `express`, `mongodb`, `zod`, `bcryptjs`, `jose`, `cookie-parser`, `cors`, `helmet`, `express-rate-limit`, `pino`, `pino-http`
- [x] Install dev deps: `typescript`, `tsx`, `vitest`, `supertest`, `@types/express`, `@types/node`, `@types/cookie-parser`
- [x] Configure `tsconfig.json`
- [x] Configure `vercel.json` for `/api/*` routing

### 1.2 Serverless Entry Point
- [x] Create `backend/api/index.ts` (Vercel function entry)
- [x] Create `backend/src/server.ts` (local dev entry with `app.listen()`)
- [x] Ensure no `app.listen()` in Vercel function
- [x] Export Express app from Vercel function

### 1.3 Express App Setup
- [x] Create `backend/src/app.ts`
- [x] Configure middleware: `cors`, `helmet`, `cookie-parser`, `express.json()`, `express.urlencoded()`
- [x] Configure rate limiting
- [x] Configure error handling middleware
- [x] Configure not-found handler
- [x] Mount API routes under `/api/v1`

### 1.4 Logging
- [x] Configure `pino` / `pino-http`
- [x] Ensure structured logging in production
- [x] Never log sensitive fields

---

## Phase 2 — MongoDB Atlas

### 2.1 Connection
- [x] Create `backend/src/lib/mongodb.ts`
- [x] Implement cached MongoDB client (survive warm serverless invocations)
- [x] Use `globalThis.__mongoClient` or equivalent
- [x] Handle connection errors gracefully
- [x] Do not create one new MongoClient per request

### 2.2 Environment Configuration
- [x] Set `MONGODB_URI` environment variable
- [x] Set `MONGODB_DB_NAME` environment variable (e.g., `alphanet`)
- [x] Create `.env.example` with required variables
- [x] Validate environment variables on startup

### 2.3 Collections
- [x] Create `users` collection
- [x] Create `projects` collection
- [x] Create `timesheets` collection
- [x] Create `notifications` collection
- [x] Create `activities` collection
- [x] Create `documents` collection
- [x] Create `sessions` collection (optional)

### 2.4 Indexes
- [x] **Users**: `email` (unique), `employeeId` (unique), `supervisorId`, `status`, `isSupervisor`
- [x] **Projects**: `sowNumber` (unique), `status`, `managerId`, `supervisorId`, `teamMemberIds`, `startDate`, `endDate`, `deadline`
- [x] **Timesheets**: `userId`, `projectId`, `weekStart`, `status`
- [x] **Timesheets**: compound unique index `{ userId: 1, projectId: 1, weekStart: 1 }`
- [x] **Notifications**: `userId`, `read`, `createdAt`
- [x] **Activities**: `userId`, `projectId`, `timesheetId`, `createdAt`
- [x] **Documents**: `projectId`, `uploadedBy`, `createdAt`
- [x] **Sessions**: `userId`, `expiresAt` (TTL index if appropriate)

---

## Phase 3 — Authentication

### 3.1 Login Endpoint
- [x] Implement `POST /api/v1/auth/login`
- [x] Accept `email` and `password`
- [x] Validate input with Zod
- [x] Find user by email
- [x] Verify password with bcryptjs
- [x] Check user status is `active`
- [x] Generate access token (JWT or session)
- [x] Set HttpOnly, Secure, SameSite cookies for refresh/session tokens
- [x] Return user object without password
- [x] Handle invalid credentials

### 3.2 Current User Endpoint
- [x] Implement `GET /api/v1/auth/me`
- [x] Require authentication
- [x] Return current user object

### 3.3 Logout Endpoint
- [x] Implement `POST /api/v1/auth/logout`
- [x] Invalidate session/refresh token
- [x] Clear cookies

### 3.4 Password Reset (Contract Only)
- [x] Reserve `POST /api/v1/auth/forgot-password`
- [x] Reserve `POST /api/v1/auth/reset-password`
- [x] Do not implement as fake/success-only

### 3.5 Password Storage
- [x] Never store plain passwords
- [x] Use bcryptjs with appropriate work factor
- [x] Hash passwords on user creation
- [x] Re-hash on password update

---

## Phase 4 — Users and Supervisors

### 4.1 User Endpoints
- [x] Implement `GET /api/v1/users` (admin only)
- [x] Implement `GET /api/v1/users/:id`
- [x] Implement `POST /api/v1/users`
- [x] Implement `PATCH /api/v1/users/:id`
- [x] Implement `POST /api/v1/users/:id/deactivate`
- [x] Implement `POST /api/v1/users/:id/activate`

### 4.2 Create User Validation
- [x] Unique email validation
- [x] Unique employee ID validation
- [x] Valid role validation (`admin` | `user`)
- [x] Supervisor must exist if provided
- [x] Supervisor must be active
- [x] Supervisor must have `isSupervisor = true`
- [x] User cannot be their own supervisor
- [x] Inactive users cannot become supervisors

### 4.3 Supervisor Assignment
- [x] Implement `PATCH /api/v1/users/:id/supervisor`
- [x] Allow `supervisorId: null` to remove assignment
- [x] Validate supervisor exists and is active
- [x] Validate supervisor has `isSupervisor = true`

### 4.4 Supervisors Endpoint
- [x] Implement `GET /api/v1/supervisors`
- [x] Return only active users with `isSupervisor = true`

### 4.5 Supervisor's Users
- [x] Implement `GET /api/v1/supervisors/:id/users`
- [x] Return only `users.supervisorId === supervisorId`
- [x] Supervisor must not gain access to all users

---

## Phase 5 — Projects / SOW

### 5.1 Project Endpoints
- [x] Implement `GET /api/v1/projects`
- [x] Implement `GET /api/v1/projects/:id`
- [x] Implement `POST /api/v1/projects`
- [x] Implement `PATCH /api/v1/projects/:id`
- [x] Implement `DELETE /api/v1/projects/:id`

### 5.2 Project Creation Validation
- [x] Validate `startDate <= deadline <= endDate`
- [x] Validate all required fields
- [x] Validate manager exists
- [x] Validate supervisor exists and is supervisor-capable
- [x] Validate team members exist and are active

### 5.3 Team Membership
- [x] Implement `POST /api/v1/projects/:id/team`
- [x] Implement `DELETE /api/v1/projects/:id/team/:userId`
- [x] User must exist and be active
- [x] Prevent duplicate team membership
- [x] Archived projects cannot accept new assignments

### 5.4 Supervisor Assignment
- [x] Implement `PATCH /api/v1/projects/:id/supervisor`
- [x] Supervisor must exist, be active, have `isSupervisor = true`

### 5.5 Project Access
- [x] Admin: can access all projects
- [x] Assigned user: can access projects where `teamMemberIds` contains current user ID
- [x] Supervisor: can access projects where `supervisorId === currentUser.id`
- [x] Manager: if admin account, standard admin rules apply

---

## Phase 6 — Timesheets

### 6.1 Endpoints
- [x] Implement `GET /api/v1/timesheets`
- [x] Implement `GET /api/v1/timesheets/:id`
- [x] Implement `POST /api/v1/timesheets`
- [x] Implement `PATCH /api/v1/timesheets/:id`
- [x] Implement `POST /api/v1/timesheets/:id/submit`
- [x] Implement `POST /api/v1/timesheets/:id/withdraw`

### 6.2 Create Timesheet
- [x] Derive `userId` from authenticated session (never trust client)
- [x] Validate project exists
- [x] Validate user is assigned to project
- [x] Validate user is active
- [x] Normalize `weekStart` to Monday
- [x] Prevent duplicate `userId + projectId + weekStart`

### 6.3 Week Normalization
- [x] Reject non-Monday weekStart values
- [x] Or normalize client input to Monday
- [x] Return canonical Monday date in responses
- [x] Use `YYYY-MM-DD` date-only strings
- [x] Handle UTC conversion correctly

### 6.4 Duplicate Prevention
- [x] Application-level validation
- [x] MongoDB unique compound index on `{ userId, projectId, weekStart }`

### 6.5 Entry Rules
- [x] Regular entries: Mon-Fri only
- [x] Overtime entries: Sat-Sun only
- [x] Weekend regular hours must be 0
- [x] Weekday overtime must be 0

### 6.6 Hours Validation
- [x] Each daily value must be numeric, finite, >= 0
- [x] Within configured daily maximum (default 24)
- [x] Normalize to reasonable precision

### 6.7 Description Validation
- [x] Description required when hours > 0
- [x] Empty description with hours > 0 rejected

### 6.8 Calculated Totals
- [x] Calculate `regularHours` server-side
- [x] Calculate `overtimeHours` server-side
- [x] Calculate `totalHours` server-side
- [x] Never trust client-provided totals

### 6.9 Save Draft
- [x] `PATCH /api/v1/timesheets/:id`
- [x] Only owner can modify draft
- [x] Allowed editable states: `draft`, `declined`, `withdrawn`
- [x] Locked states: `pending`, `approved`

### 6.10 Submit
- [x] `POST /api/v1/timesheets/:id/submit`
- [x] Allowed: `draft → pending`, `declined → pending`, `withdrawn → pending`
- [x] Reject: `pending → pending`, `approved → pending`
- [x] Validate owner, project access, valid week, valid entries, valid hours, at least one hour
- [x] Set `submittedAt`, `updatedAt`, `status = pending`

---

## Phase 7 — Approval Workflow

### 7.1 Endpoints
- [x] Implement `GET /api/v1/approvals`
- [x] Implement `POST /api/v1/timesheets/:id/approve`
- [x] Implement `POST /api/v1/timesheets/:id/decline`

### 7.2 Admin Approval
- [x] Admin can review all pending timesheets

### 7.3 Supervisor Approval
- [x] Supervisor can review only authorized pending timesheets
- [x] Authorization based on user assignment or project supervision
- [x] Centralize decision in `canReviewTimesheet(reviewer, timesheet)`

### 7.4 Normal Users
- [x] Normal users cannot approve, decline, or review other users' timesheets

### 7.5 Approve Flow
- [x] Allowed: `pending → approved`
- [x] Set `review.reviewedBy`, `review.reviewedAt`
- [x] Create notification for timesheet owner
- [x] Create activity

### 7.6 Decline Flow
- [x] Allowed: `pending → declined`
- [x] Reason is required
- [x] Set `review.reviewedBy`, `review.reviewedAt`, `review.reason`
- [x] Create notification for timesheet owner
- [x] Create activity

### 7.7 Withdraw Flow
- [x] Implement `POST /api/v1/timesheets/:id/withdraw`
- [x] Only owner can withdraw
- [x] Allowed: `pending → withdrawn`
- [x] Cannot withdraw: `approved`, `declined`, `draft`
- [x] Optional reason supported
- [x] Create notification for reviewer(s)
- [x] Create activity

---

## Phase 8 — Notifications

### 8.1 Endpoints
- [x] Implement `GET /api/v1/notifications`
- [x] Implement `GET /api/v1/notifications/unread-count`
- [x] Implement `POST /api/v1/notifications/:id/read`
- [x] Implement `POST /api/v1/notifications/read-all`

### 8.2 Auto-Generated Notifications
- [x] Submission notification (notify reviewer)
- [x] Approval notification (notify timesheet owner)
- [x] Decline notification (notify timesheet owner, include reason)
- [x] Withdrawal notification (notify reviewer)
- [x] Assignment notification (notify user when assigned to project/supervisor)
- [x] Deadline notification (via Vercel Cron or scheduled endpoint, protected with secret)

---

## Phase 9 — Activities / Audit Trail

### 9.1 Endpoints
- [x] Implement `GET /api/v1/activities`
- [x] Implement `GET /api/v1/users/:id/activities`
- [x] Implement `GET /api/v1/projects/:id/activities`
- [x] Implement `GET /api/v1/timesheets/:id/activities`

### 9.2 Activity Events
- [x] User created
- [x] User activated/deactivated
- [x] Supervisor assigned
- [x] Project created
- [x] Project updated
- [x] Project team changed
- [x] Project supervisor changed
- [x] Timesheet created
- [x] Timesheet updated
- [x] Timesheet submitted
- [x] Timesheet withdrawn
- [x] Timesheet approved
- [x] Timesheet declined
- [x] Document uploaded
- [x] Document deleted

### 9.3 Server-Side Creation
- [x] Activities created server-side only
- [x] Clients cannot arbitrarily write audit messages

---

## Phase 10 — Reports

### 10.1 Endpoints
- [x] Implement `GET /api/v1/reports/hours-by-project`
- [x] Implement `GET /api/v1/reports/hours-by-employee`
- [x] Implement `GET /api/v1/reports/overtime`
- [x] Implement `GET /api/v1/reports/timesheet-status`

### 10.2 Filters
- [x] Support `dateRange` / `startDate` / `endDate`
- [x] Support `projectId`
- [x] Support `userId`
- [x] Support `department`

### 10.3 Aggregation
- [x] Use MongoDB aggregation pipelines
- [x] Do not calculate large reports entirely in JavaScript

---

## Phase 11 — Documents

### 11.1 Storage Strategy
- [x] Choose object storage: Vercel Blob or S3-compatible
- [x] Do not use local filesystem for permanent storage
- [x] MongoDB stores metadata only

### 11.2 Document Model
- [x] `id`, `projectId`, `name`, `size`, `mimeType`, `storageKey`, `url?`, `uploadedBy`, `createdAt`

### 11.3 Endpoints
- [x] Implement `GET /api/v1/projects/:projectId/documents`
- [x] Implement `POST /api/v1/projects/:projectId/documents`
- [x] Implement `DELETE /api/v1/projects/:projectId/documents/:documentId`

### 11.4 Upload Mechanism
- [x] Decide on direct upload vs signed URL approach
- [x] Implement chosen upload mechanism
- [x] Validate file types and sizes
- [x] Do not store binary files in MongoDB

---

## Phase 12 — Frontend API Integration

### 12.1 API Client
- [x] Create `frontend/src/services/apiClient.ts`
- [x] Implement base URL configuration
- [x] Implement credentials handling
- [x] Implement JSON headers
- [x] Implement request timeout
- [x] Implement response parsing
- [x] Implement normalized errors
- [x] Implement 401 handling
- [x] Implement optional retry for safe requests

### 12.2 Environment Variable
- [x] Set `VITE_API_BASE_URL` in frontend
- [x] Example: `/api/v1` or full Vercel URL

### 12.3 Service Migration
- [x] Replace `authService.login()` → `POST /api/v1/auth/login`
- [x] Replace `authService.getCurrentUser()` → `GET /api/v1/auth/me`
- [x] Replace `authService.logout()` → `POST /api/v1/auth/logout`
- [x] Replace `userService.getUsers()` → `GET /api/v1/users`
- [x] Replace `userService.createUser()` → `POST /api/v1/users`
- [x] Replace `userService.updateUser()` → `PATCH /api/v1/users/:id`
- [x] Replace `userService.deactivateUser()` → `POST /api/v1/users/:id/deactivate`
- [x] Replace `userService.getSupervisors()` → `GET /api/v1/supervisors`
- [x] Replace `userService.getUsersBySupervisorId()` → `GET /api/v1/supervisors/:id/users`
- [x] Replace `projectService.getProjects()` → `GET /api/v1/projects`
- [x] Replace `projectService.createProject()` → `POST /api/v1/projects`
- [x] Replace `projectService.updateProject()` → `PATCH /api/v1/projects/:id`
- [x] Replace `projectService.deleteProject()` → `DELETE /api/v1/projects/:id`
- [x] Replace `projectService.addTeamMember()` → `POST /api/v1/projects/:id/team`
- [x] Replace `projectService.removeTeamMember()` → `DELETE /api/v1/projects/:id/team/:userId`
- [x] Replace `projectService.assignSupervisor()` → `PATCH /api/v1/projects/:id/supervisor`
- [x] Replace `timesheetService.getTimesheets()` → `GET /api/v1/timesheets`
- [x] Replace `timesheetService.getTimesheetById()` → `GET /api/v1/timesheets/:id`
- [x] Replace `timesheetService.createTimesheet()` → `POST /api/v1/timesheets`
- [x] Replace `timesheetService.saveDraft()` → `PATCH /api/v1/timesheets/:id`
- [x] Replace `timesheetService.submitTimesheet()` → `POST /api/v1/timesheets/:id/submit`
- [x] Replace `timesheetService.withdrawTimesheet()` → `POST /api/v1/timesheets/:id/withdraw`
- [x] Replace `timesheetService.approveTimesheet()` → `POST /api/v1/timesheets/:id/approve`
- [x] Replace `timesheetService.declineTimesheet()` → `POST /api/v1/timesheets/:id/decline`
- [x] Replace `notificationService.getNotifications()` → `GET /api/v1/notifications`
- [x] Replace `notificationService.markAsRead()` → `POST /api/v1/notifications/:id/read`
- [x] Replace `notificationService.markAllAsRead()` → `POST /api/v1/notifications/read-all`
- [x] Replace `activityService.getActivities()` → `GET /api/v1/activities`
- [x] Replace `reportService` functions → corresponding `/api/v1/reports/*` endpoints

### 12.4 Authentication
- [x] Prefer HttpOnly cookies over localStorage tokens
- [x] Call `GET /api/v1/auth/me` on application startup
- [x] Handle 401 by redirecting to login

---

## Phase 13 — Validation and Security ✅ Done

### 13.1 Zod Validation
- [x] Create `auth.schema.ts`
- [x] Create `user.schema.ts`
- [x] Create `project.schema.ts`
- [x] Create `timesheet.schema.ts`
- [x] Create `notification.schema.ts`
- [x] Create `report.schema.ts`
- [x] Validate `body`, `query`, `params` before controller logic

### 13.2 Authorization Middleware
- [x] Implement `requireAuth`
- [x] Implement `requireAdmin`
- [x] Implement `requireSupervisor`
- [x] Implement `canAccessProject`
- [x] Implement `canEditProject`
- [x] Implement `canAccessTimesheet`
- [x] Implement `canEditTimesheet`
- [x] Implement `canReviewTimesheet`
- [x] Implement `canManageUser`

### 13.3 CORS
- [x] Configure `FRONTEND_URL` environment variable
- [x] Only allow configured frontend origins
- [x] Do not use `Access-Control-Allow-Origin: *` with credentials

### 13.4 Helmet
- [x] Enable Helmet with production configuration

### 13.5 Rate Limiting
- [x] Rate limit `POST /auth/login`
- [x] Rate limit `POST /auth/forgot-password`
- [x] Rate limit `POST /auth/reset-password`
- [x] Consider broader API rate limits

### 13.6 Password Policy
- [x] Enforce reasonable password strength server-side

### 13.7 Object-Level Authorization
- [x] Every resource access checks ownership/assignment
- [x] Example: `GET /timesheets/:id` verifies admin, owner, or authorized supervisor

### 13.8 No Sensitive Logging
- [x] Never log passwords
- [x] Never log JWTs
- [x] Never log session tokens
- [x] Never log reset tokens
- [x] Never log database connection strings

---

## Phase 14 — Testing ✅ Done

### 14.1 Unit Tests
- [x] Test week normalization
- [x] Test timesheet totals calculation
- [x] Test timesheet validation
- [x] Test permission functions
- [x] Test status transitions
- [x] Test project access logic
- [x] Test supervisor access logic

### 14.2 API Integration Tests
- [x] Test login
- [x] Test `/auth/me`
- [x] Test logout
- [x] Test user CRUD
- [x] Test supervisor assignment
- [x] Test project CRUD
- [x] Test team assignment
- [x] Test timesheet creation
- [x] Test timesheet draft update
- [x] Test timesheet submission
- [x] Test withdrawal
- [x] Test approval
- [x] Test decline
- [x] Test notifications
- [x] Test reports

### 14.3 Security Tests
- [x] Normal user cannot list all users
- [x] Normal user cannot access another user's timesheet
- [x] Normal user cannot approve
- [x] Normal user cannot decline
- [x] Normal user cannot modify another user's timesheet
- [x] Supervisor cannot access unrelated user's timesheet
- [x] Supervisor cannot modify project ownership arbitrarily
- [x] User cannot impersonate another user by passing userId
- [x] Admin-only endpoints reject normal users

---

## Phase 15 — Deployment to Vercel

### 15.1 Architecture
- [ ] Do not deploy permanent Node server
- [ ] Do not use PM2 process
- [ ] Do not use Docker-only server
- [ ] Do not use `app.listen()` in production

### 15.2 Vercel Configuration
- [ ] `vercel.json` routes `/api/*` to serverless function
- [ ] Frontend and backend deployed together or separately as configured

### 15.3 Environment Variables on Vercel
- [ ] Configure `MONGODB_URI`
- [ ] Configure `MONGODB_DB_NAME`
- [ ] Configure `JWT_SECRET`
- [ ] Configure `JWT_REFRESH_SECRET`
- [ ] Configure `FRONTEND_URL`
- [ ] Configure `COOKIE_DOMAIN`
- [ ] Configure `NODE_ENV`
- [ ] If using Vercel Blob: configure `BLOB_READ_WRITE_TOKEN`
- [ ] Do not commit real values

---

## Phase 16 — Seed / Demo Data

### 16.1 Seed Script
- [ ] Create `backend/scripts/seed.ts`
- [ ] Seed stable demo accounts with known passwords
- [ ] Admin: `admin@alphanet.local`
- [ ] User: `user@alphanet.local`
- [ ] Supervisor: `supervisor@alphanet.local`

### 16.2 Demo Supervisor
- [ ] Supervisor has `role: "user"` and `isSupervisor: true`
- [ ] Supervisor has at least one assigned user/project

### 16.3 Seed Projects
- [ ] Create at least one active project
- [ ] Create at least one draft project
- [ ] Create at least one completed project

### 16.4 Seed Timesheets
- [ ] Create example with `draft` status
- [ ] Create example with `pending` status
- [ ] Create example with `approved` status
- [ ] Create example with `declined` status
- [ ] Create example with `withdrawn` status

---

## Phase 17 — Production Hardening

### 17.1 Database
- [ ] Verify all indexes exist
- [ ] Verify unique constraints work
- [ ] Test concurrent writes
- [ ] Test duplicate timesheet creation prevention
- [ ] Create backups

### 17.2 Security
- [ ] Validate all API inputs
- [ ] Verify all authorization rules
- [ ] Add request IDs
- [ ] Add structured logs
- [ ] Configure rate limits
- [ ] Configure CORS
- [ ] Configure secure cookies
- [ ] Configure MongoDB Atlas network/security rules

### 17.3 Performance
- [ ] Test Vercel cold starts
- [ ] Test report performance with large datasets
- [ ] Verify MongoDB connection caching works across invocations

### 17.4 Edge Cases
- [ ] Test expired sessions
- [ ] Test revoked sessions
- [ ] Test malformed requests
- [ ] Test large upload rejection
- [ ] Test invalid concurrent state transitions

---

## Definition of Done

### Foundation
- [ ] TypeScript builds successfully
- [ ] Express starts locally
- [ ] Vercel Function entry exists
- [ ] No production `app.listen()` is used inside the Vercel function
- [ ] MongoDB Atlas connection works
- [ ] MongoDB client is cached between warm invocations
- [ ] Environment variables are validated
- [ ] `.env.example` exists

### Authentication
- [ ] Admin login works
- [ ] User login works
- [ ] Supervisor login works as a user with `isSupervisor=true`
- [ ] `/auth/me` works
- [ ] Logout works
- [ ] Passwords are hashed
- [ ] Unauthorized requests return 401
- [ ] Inactive users cannot log in

### Users
- [ ] Admin can create users
- [ ] Admin can update users
- [ ] Admin can activate/deactivate users
- [ ] Admin can assign supervisors
- [ ] Supervisor lists only contain supervisor-capable users
- [ ] Supervisor user lists are correctly scoped

### Projects
- [ ] Admin can create projects
- [ ] Admin can edit projects
- [ ] Admin can archive/delete according to business rules
- [ ] Team assignment works
- [ ] Supervisor assignment works
- [ ] User project access is scoped
- [ ] Supervisor project access is scoped

### Timesheets
- [ ] User can create a timesheet
- [ ] Duplicate weekly timesheets are prevented
- [ ] Monday-Friday regular hours work
- [ ] Saturday-Sunday overtime works
- [ ] Invalid day/type combinations are rejected
- [ ] Totals are calculated server-side
- [ ] Draft saving works
- [ ] Submission works
- [ ] Withdrawal works
- [ ] Decline works
- [ ] Resubmission works
- [ ] Approved timesheets are locked

### Approval
- [ ] Admin sees all pending timesheets
- [ ] Supervisor sees only authorized pending timesheets
- [ ] Normal users cannot approve
- [ ] Unauthorized supervisors cannot approve
- [ ] Approval creates notification
- [ ] Decline requires a reason
- [ ] Decline creates notification

### Notifications
- [ ] Submission notification works
- [ ] Approval notification works
- [ ] Decline notification works
- [ ] Withdrawal notification works
- [ ] Assignment notification works
- [ ] Mark read works
- [ ] Mark all read works
- [ ] Unread count works

### Reports
- [ ] Hours by project works
- [ ] Hours by employee works
- [ ] Overtime report works
- [ ] Status breakdown works
- [ ] Filters work
- [ ] Pagination works where needed

### Security
- [ ] All protected routes require authentication
- [ ] Role checks work
- [ ] Object-level access checks work
- [ ] Rate limiting works
- [ ] Helmet enabled
- [ ] CORS restricted
- [ ] Sensitive fields never returned
- [ ] Passwords never logged
- [ ] Tokens never logged
- [ ] MongoDB injection-style inputs are safely handled
- [ ] Request validation is centralized

### Deployment
- [ ] Local development works
- [ ] Vercel deployment works
- [ ] MongoDB Atlas works from Vercel
- [ ] Environment variables are configured
- [ ] Cold-start invocation works
- [ ] Multiple concurrent requests work
- [ ] No local filesystem dependency exists

---

## Final End-to-End Acceptance Test

### Step 1 — Admin Login
- [ ] Login as `admin@alphanet.local`
- [ ] Verify `role = admin`

### Step 2 — Create Supervisor
- [ ] Create supervisor user
- [ ] Set `isSupervisor = true`, `role = user`

### Step 3 — Create Normal User
- [ ] Create normal user
- [ ] Set `role = user`, `isSupervisor = false`, `supervisorId = supervisor`
- [ ] Verify `user.supervisorId === supervisor.id`

### Step 4 — Create Project
- [ ] Create project with supervisor and team assignment
- [ ] Verify all relationships saved correctly

### Step 5 — Login as Normal User
- [ ] Login as normal user
- [ ] Verify user can see assigned project
- [ ] Verify user cannot see unrelated projects

### Step 6 — Create Weekly Timesheet
- [ ] Create timesheet with `weekStart = Monday`
- [ ] Verify `status = draft`

### Step 7 — Enter Regular Hours
- [ ] Enter Mon-Fri hours
- [ ] Verify `regularHours = 40`, `overtimeHours = 0`, `totalHours = 40`

### Step 8 — Enter Overtime
- [ ] Enter Sat-Sun hours
- [ ] Verify `regularHours = 40`, `overtimeHours = 6`, `totalHours = 46`

### Step 9 — Invalid Data Test
- [ ] Attempt regular entry on Saturday → Backend rejects
- [ ] Attempt overtime entry on Monday → Backend rejects

### Step 10 — Submit
- [ ] Submit timesheet
- [ ] Verify `draft → pending`
- [ ] Verify supervisor receives submission notification

### Step 11 — Supervisor Review
- [ ] Login as supervisor
- [ ] Verify supervisor can see pending timesheet
- [ ] Approve timesheet
- [ ] Verify `pending → approved`
- [ ] Verify user receives approval notification

### Step 12 — Security Test
- [ ] As normal user, attempt to approve own timesheet → 403
- [ ] As normal user, attempt to approve unrelated timesheet → 403
- [ ] As normal user, attempt to read another user's timesheet → 403
- [ ] As normal user, attempt to modify another user's timesheet → 403

### Step 13 — Decline Workflow
- [ ] Create and submit another timesheet
- [ ] Supervisor declines with reason
- [ ] Verify `pending → declined`
- [ ] Verify user receives decline notification
- [ ] User edits and resubmits
- [ ] Verify `declined → pending`

### Step 14 — Withdrawal Workflow
- [ ] Create and submit another timesheet
- [ ] User withdraws before review
- [ ] Verify `pending → withdrawn`
- [ ] Verify supervisor receives withdrawal notification

### Step 15 — Reports
- [ ] Admin opens reports
- [ ] Verify data includes users, projects, hours, and status breakdowns
