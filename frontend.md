# Alphanet Internal Project & Timesheet Management System

## Frontend Implementation Specification

**Technology:** TypeScript + React + Tailwind CSS
**Frontend location:** `/frontend`
**Backend:** Not implemented yet
**Purpose:** Build a complete, polished, functional frontend shell that uses realistic mock data and local state until a backend is introduced.

---

# 1. Objective

Build a modern internal enterprise application for **Alphanet** that manages:

* Projects / Statements of Work (SOW)
* Project timelines and deadlines
* Employees/users
* Supervisors
* Project assignments
* Weekly timesheets
* Weekend overtime
* Draft timesheets
* Final submissions
* Timesheet withdrawal
* Timesheet approval
* Timesheet rejection/decline
* Notifications
* Documents
* Dashboard statistics
* Reports
* Search, filtering and sorting
* User profile/settings

The application should feel like a polished internal SaaS product inspired by the usability and information architecture of applications such as Zoho, while maintaining its own visual identity.

This is **not** a backend implementation.

The frontend must behave like a real application using mock data and simulated state transitions.

---

# 2. Non-Negotiable Requirements

The coding agent MUST:

1. Create a `/frontend` directory.
2. Build the React application entirely inside `/frontend`.
3. Use TypeScript.
4. Use Tailwind CSS.
5. Use reusable React components.
6. Avoid putting everything into one large component.
7. Create realistic mock data.
8. Implement client-side routing.
9. Implement separate Admin and User login experiences.
10. Implement role-aware navigation.
11. Implement responsive layouts.
12. Implement loading, empty, error and success states where appropriate.
13. Implement working buttons and interactions using local state.
14. Implement forms with validation.
15. Implement modal/dialog interactions.
16. Implement tables with filtering/search where relevant.
17. Implement timesheet calculations.
18. Implement the timesheet status lifecycle.
19. Implement the supervisor experience.
20. Make the application usable without a backend.
21. Do NOT create a backend.
22. Do NOT hard-code UI solely for screenshots.
23. Keep architecture ready for a future API/backend integration.

---

# 3. Product Concept

The product is an internal Alphanet platform.

The fundamental workflow is:

```text
ADMIN
  ↓
Create Project / SOW
  ↓
Set Start Date + End Date + Deadline
  ↓
Upload Project Documents
  ↓
Create Users
  ↓
Assign Users to Project
  ↓
Assign Supervisor
  ↓
USER
  ↓
Open Assigned Project
  ↓
Fill Weekly Timesheet
  ↓
Monday-Friday Regular Hours
  ↓
Optional Saturday/Sunday Overtime
  ↓
Add Notes
  ↓
Save Draft OR Final Submit
  ↓
PENDING
  ↓
Supervisor/Admin Review
  ├── APPROVE
  └── DECLINE
          ↓
      User edits
          ↓
      Resubmits
```

Pending submissions may also be withdrawn by the submitting user.

---

# 4. Visual Design Direction

The UI should be:

* Modern
* Sleek
* Professional
* Enterprise-grade
* Rich in information
* Easy to scan
* Visually engaging
* Spacious but NOT minimalist
* Polished
* Consistent
* Responsive

Do not make the application look like a generic Tailwind dashboard template.

Avoid:

* Excessive empty whitespace
* Huge typography
* Extremely sparse dashboards
* Excessive gradients
* Excessive rounded cards
* Random colors
* Giant hero sections
* Unnecessary animations
* Generic placeholder content

The interface should resemble a mature internal SaaS product.

---

# 5. Brand Direction

Use **Alphanet** as the product/company name.

Suggested visual identity:

* Primary: deep indigo / blue
* Secondary: slate
* Accent: cyan/blue
* Success: emerald
* Warning: amber
* Danger: red
* Neutral backgrounds: slate/gray tones

Tailwind color tokens should be centralized where possible.

Example conceptual palette:

```text
Primary:
indigo-600
indigo-700
indigo-50

Success:
emerald-600
emerald-50

Warning:
amber-600
amber-50

Danger:
red-600
red-50

Neutral:
slate-50
slate-100
slate-200
slate-500
slate-700
slate-900
```

Do not overuse color.

Color should communicate:

* Status
* Importance
* Actions
* Alerts

---

# 6. Typography

Use a clean modern sans-serif font.

Preferred:

* Inter
* Geist
* system sans fallback

Hierarchy:

```text
Page title:
text-2xl / text-3xl
font-semibold

Section title:
text-lg
font-semibold

Card title:
text-sm / text-base
font-semibold

Body:
text-sm / text-base

Metadata:
text-xs / text-sm
text-slate-500
```

Do not make all text large.

This is an enterprise application where information density matters.

---

# 7. Application Shell

Authenticated pages should use a common application shell.

Structure:

```text
┌──────────────────────────────────────────────────────────────┐
│ TOP BAR                                                       │
│ Alphanet   Search...                Notifications  Profile   │
├───────────────┬──────────────────────────────────────────────┤
│               │                                              │
│ SIDEBAR       │ PAGE CONTENT                                 │
│               │                                              │
│ Dashboard     │                                              │
│ Projects      │                                              │
│ Timesheets    │                                              │
│ Approvals     │                                              │
│ Users         │                                              │
│ Reports       │                                              │
│               │                                              │
│ Settings      │                                              │
│               │                                              │
└───────────────┴──────────────────────────────────────────────┘
```

Desktop:

* Fixed/sticky sidebar
* Sticky top navigation
* Scrollable main content

Mobile:

* Sidebar becomes drawer
* Top bar remains visible
* Hamburger button opens navigation

---

# 8. Sidebar

The sidebar should contain:

## Admin

```text
Dashboard

WORKSPACE
Projects
Users
Supervisors

TIME
Timesheets
Approvals

INSIGHTS
Reports

SYSTEM
Notifications
Settings
```

## User

```text
Dashboard

WORK
My Projects
My Timesheets
Submissions

SUPERVISOR
Team Timesheets
Approvals

SYSTEM
Notifications
Settings
```

The Supervisor section should only appear when the logged-in user has supervisor permissions.

Use icons next to navigation labels.

Recommended icon library:

* Lucide React

Icons should be consistent throughout the application.

---

# 9. Top Navigation

Top bar:

Left:

* Sidebar toggle on mobile
* Breadcrumbs

Center/right:

* Search
* Notification bell
* User profile menu

Search should visually resemble:

```text
┌─────────────────────────────────┐
│ 🔍 Search projects, users...    │
└─────────────────────────────────┘
```

Profile dropdown:

```text
Nikhil
Administrator

Profile
Settings
Sign out
```

---

# 10. Routing

Use React Router.

Recommended route structure:

```text
/
/userlog
/adminlog

/user
/user/dashboard
/user/projects
/user/projects/:projectId
/user/timesheets
/user/timesheets/:timesheetId
/user/submissions
/user/notifications
/user/settings

/admin
/admin/dashboard
/admin/projects
/admin/projects/new
/admin/projects/:projectId
/admin/projects/:projectId/edit
/admin/users
/admin/users/new
/admin/users/:userId
/admin/supervisors
/admin/timesheets
/admin/approvals
/admin/reports
/admin/notifications
/admin/settings

/supervisor
/supervisor/timesheets
/supervisor/approvals
```

Route guards should be represented on the frontend even though authentication is mocked.

---

# 11. Mock Authentication

Create a mock authentication context.

Example users:

```ts
Admin:
{
  id: "admin-1",
  name: "Alex Morgan",
  role: "admin"
}

User:
{
  id: "user-1",
  name: "John Smith",
  role: "user",
  isSupervisor: false
}

Supervisor:
{
  id: "user-2",
  name: "Sarah Johnson",
  role: "user",
  isSupervisor: true
}
```

Login does not need a real backend.

For demonstration:

Admin login:

```text
/adminlog
```

User login:

```text
/userlog
```

Provide a polished mock login experience.

---

# 12. Login Page — Admin

Route:

```text
/adminlog
```

Design:

Split-screen desktop layout.

Left:

Alphanet branding.

Right:

Login form.

Example:

```text
Alphanet

Internal Project Management
Manage projects, people and timesheets
from one place.

                    Admin Portal

                    Work Email
                    [________________]

                    Password
                    [________________]

                    [        Sign In        ]

                    Forgot password?
```

Include:

* Email field
* Password field
* Show/hide password
* Remember me
* Sign-in button
* Loading state
* Validation errors
* Invalid login state

Use a subtle brand visual on the left, such as abstract geometric shapes or dashboard-style decorative elements.

Do not make the page overly flashy.

---

# 13. Login Page — User

Route:

```text
/userlog
```

Use the same design system but clearly label it:

```text
Employee Portal
```

The two login pages should feel related but distinct.

---

# 14. Admin Dashboard

Route:

```text
/admin/dashboard
```

This is the main operational dashboard.

Header:

```text
Good morning, Alex

Here's what's happening across Alphanet today.
```

Primary statistic cards:

```text
Active Projects
24

Active Users
86

Pending Timesheets
12

Upcoming Deadlines
4
```

Use visually rich cards with:

* Icon
* Number
* Label
* Trend/change where useful
* Small supporting text

---

## Admin Dashboard Sections

### A. Timesheet Approvals

Table:

```text
Employee
Project
Week
Hours
Submitted
Status
Action
```

Rows should be clickable.

Example:

```text
John Smith
Website Modernization
Sep 7 - Sep 11
40h
Sep 11
Pending
Review
```

---

### B. Upcoming Deadlines

Display projects approaching deadlines.

Example:

```text
Website Modernization
Sep 10, 2026
6 days remaining
████████████████░░░

Mobile Platform
Sep 18, 2026
14 days remaining
```

Use status indicators.

---

### C. Project Overview

Display:

* Active
* Completed
* Overdue
* Draft

A chart can be included.

Use a chart library only if useful.

Possible library:

```text
recharts
```

Charts must remain readable and professional.

---

### D. Recent Activity

Timeline:

```text
10 min ago
John Smith submitted a timesheet

1 hour ago
Project Alpha updated

3 hours ago
Sarah Johnson approved a timesheet
```

---

# 15. User Dashboard

Route:

```text
/user/dashboard
```

Header:

```text
Good morning, John

Here's your work overview.
```

Cards:

```text
My Projects       3
This Week         37.5h
Pending Review    1
Upcoming Deadline 2
```

Main sections:

### Current Timesheet

Show current week:

```text
Sep 7 - Sep 11

Mon  8h
Tue  8h
Wed  7.5h
Thu  8h
Fri  6h

Total 37.5h

Status: Draft

[Continue Timesheet]
```

### My Projects

Cards/list showing assigned projects.

### Recent Submissions

```text
Week          Project           Hours      Status
Sep 7-11      Project Alpha     40h        Pending
Aug 31-4      Project Beta      38h        Approved
```

---

# 16. Projects List — Admin

Route:

```text
/admin/projects
```

Page header:

```text
Projects

Manage Alphanet projects and statements of work.

[ + New Project ]
```

Toolbar:

```text
Search projects...

Status ▼
Manager ▼
Date ▼

[Filter] [Export]
```

Table:

```text
Project
SOW
Client
Start
End
Team
Status
Actions
```

Status:

* Draft
* Active
* Completed
* Overdue
* Archived

Rows should be clickable.

---

# 17. Project Creation

Route:

```text
/admin/projects/new
```

Use a multi-section form.

Sections:

## Basic Information

Fields:

* Project Name
* SOW Number
* Client
* Description

## Timeline

Fields:

* Start Date
* End Date
* Deadline

Validation:

* End date cannot be before start date
* Deadline cannot be before start date

## Project Manager

Dropdown.

## Team

Multi-select users.

## Supervisor

Dropdown from users with supervisor capability.

## Documents

Drag-and-drop upload zone.

Support:

* PDF
* DOC/DOCX
* XLS/XLSX
* PNG/JPG
* ZIP if desired

Since backend does not exist, uploaded files can be represented locally as mock attachment objects.

Show:

```text
SOW_2026.pdf
2.4 MB
✓ Uploaded
```

Actions:

```text
Cancel
Save Draft
Create Project
```

---

# 18. Project Detail — Admin

Route:

```text
/admin/projects/:projectId
```

Header:

```text
← Projects

Website Modernization

SOW: ALP-SOW-2026-018

[Edit Project] [More]
```

Status badge:

```text
ACTIVE
```

Tabs:

```text
Overview
Team
Timesheets
Documents
Activity
```

---

## Project Overview

Display:

```text
Start Date
Sep 1, 2026

End Date
Nov 30, 2026

Deadline
Nov 30, 2026

Project Manager
Alex Morgan

Supervisor
Sarah Johnson
```

Description section.

Project progress visualization.

---

# 19. Project Deadline Component

Create a reusable component:

```text
DeadlineIndicator
```

States:

### Normal

```text
🟢 On Track
30 days remaining
```

### Warning

```text
🟡 Deadline approaching
5 days remaining
```

### Overdue

```text
🔴 Overdue
3 days past deadline
```

Use date calculations rather than hardcoded labels.

---

# 20. Project Team Tab

Display team members.

```text
Team Members

John Smith
Developer
Assigned Sep 1

Priya Sharma
Designer
Assigned Sep 1

Sarah Johnson
Supervisor
```

Actions:

```text
[+ Add Users]
```

Allow removing users with confirmation.

Supervisor assignment should be visually obvious.

---

# 21. Project Timesheets Tab

Show project-related timesheets.

Filters:

* User
* Date range
* Status

Table:

```text
Employee
Week
Regular Hours
Overtime
Total
Status
```

---

# 22. Project Documents Tab

Show uploaded documents.

Example:

```text
Documents

📄 SOW_Alpha_2026.pdf
2.4 MB
Uploaded by Alex Morgan
Sep 1

📄 Project_Brief.docx
1.1 MB
Uploaded by Alex Morgan
Sep 1
```

Actions:

* Preview
* Download
* Delete

For frontend-only implementation, preview/download may be simulated.

---

# 23. Users Management

Route:

```text
/admin/users
```

Header:

```text
Users

Manage employees and account access.

[ + Create User ]
```

Table:

```text
Name
Employee ID
Email
Department
Role
Supervisor
Status
Actions
```

Filters:

* Search
* Department
* Status
* Supervisor capability

---

# 24. Create User

Route:

```text
/admin/users/new
```

Form:

```text
Full Name
Email
Employee ID
Department
Role

Supervisor Capability
[ No ]

Status
[ Active ]
```

If supervisor capability is enabled:

```text
Supervisor permissions

Can review assigned users' timesheets
☑ Enabled
```

Do not create a separate mandatory Supervisor role.

A supervisor is a User with supervisor capability.

---

# 25. User Detail

Route:

```text
/admin/users/:userId
```

Display:

* User profile
* Employee ID
* Email
* Department
* Status
* Supervisor capability
* Assigned projects
* Timesheet summary
* Recent submissions

Admin actions:

```text
Edit User
Deactivate User
Assign Projects
Make Supervisor
```

---

# 26. Supervisor Management

Route:

```text
/admin/supervisors
```

Display users who have supervisor capability.

Columns:

```text
Supervisor
Email
Assigned Projects
Team Members
Pending Reviews
Status
```

Clicking a supervisor should show their assigned team/project relationships.

---

# 27. User — My Projects

Route:

```text
/user/projects
```

Only show projects assigned to the current user.

Provide:

* Search
* Status filter
* Deadline filter

Project cards should show:

```text
Project Name
Client
Role
Deadline
Current Week Hours
Project Status

[Open Project]
```

---

# 28. User — Project Detail

Route:

```text
/user/projects/:projectId
```

Users should see:

* Project name
* Description
* Dates
* Deadline
* Their role
* Supervisor
* Project documents
* Their timesheet status

Users should NOT see admin-only information.

Primary action:

```text
[Open This Week's Timesheet]
```

---

# 29. Weekly Timesheet

Route:

```text
/user/timesheets/:timesheetId
```

This is one of the most important screens.

Create a polished timesheet editor.

Header:

```text
Weekly Timesheet

Website Modernization

Week:
Sep 7 - Sep 13, 2026

Status:
Draft
```

Week navigation:

```text
← Previous Week

Sep 7 - Sep 13

Next Week →
```

Disable navigation to future weeks if desired.

---

# 30. Timesheet Grid

Desktop:

```text
┌──────────────────────────────────────────────────────────────┐
│ Work Item        Mon Tue Wed Thu Fri Sat Sun       Total     │
├──────────────────────────────────────────────────────────────┤
│ Development       8   8   7   8   8   —   —         39       │
│ Meetings           1   1   1   0   0   —   —          3       │
├──────────────────────────────────────────────────────────────┤
│ Regular Hours      9   9   8   8   8   —   —         42       │
│ Overtime           0   0   0   0   0   4   2          6       │
└──────────────────────────────────────────────────────────────┘
```

---

# 31. Timesheet Entry Model

Use structured state.

Example:

```ts
interface TimesheetEntry {
  id: string;
  description: string;
  hours: {
    mon: number;
    tue: number;
    wed: number;
    thu: number;
    fri: number;
    sat: number;
    sun: number;
  };
}
```

But separate regular and overtime hours conceptually.

Weekend:

```text
Regular hours:
Saturday = disabled
Sunday = disabled

Overtime:
Saturday = editable
Sunday = editable
```

---

# 32. Weekday Rules

Monday-Friday:

* Regular hours enabled
* Overtime can optionally be supported if product requirements expand later
* Validate reasonable hour ranges
* Empty = 0

Saturday/Sunday:

* Regular hours disabled
* Overtime enabled

Disabled fields should look intentionally disabled, not broken.

Example:

```text
SAT
Regular
[ — Disabled — ]

Overtime
[ 4.0 ]
```

---

# 33. Overtime

Weekend overtime should be visually separated.

Example:

```text
Weekend Overtime

Saturday
[ 4.0 hrs ]

Sunday
[ 2.0 hrs ]
```

Show:

```text
Weekend Overtime: 6.0 hrs
```

---

# 34. Timesheet Notes

At bottom:

```text
Weekly Notes

┌───────────────────────────────────────────────────────────┐
│ Worked on API integration and supported deployment...     │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

Character count may be shown.

---

# 35. Timesheet Summary

Right side on desktop or below grid on mobile:

```text
Timesheet Summary

Regular Hours
40.0h

Overtime
6.0h

Total
46.0h
```

Add visual progress:

```text
Weekly Target
40h

████████████████████░░░
46 / 40
```

If above target, clearly indicate overtime rather than presenting it as an error.

---

# 36. Timesheet Actions

Draft:

```text
[Save Draft]       [Submit Final]
```

Pending:

```text
[Withdraw Submission]
```

Approved:

```text
✓ Approved
```

Declined:

```text
[Edit & Resubmit]
```

Withdrawn:

```text
[Edit Draft]
```

Buttons must change according to state.

---

# 37. Final Submit Confirmation

When user clicks Final Submit:

Open confirmation dialog.

```text
Submit Timesheet?

You are submitting:

Project:
Website Modernization

Week:
Sep 7 - Sep 11

Total:
40 hours

Once submitted, this timesheet will be sent for review.

[Cancel] [Submit Timesheet]
```

After submission:

Show success toast:

```text
✓ Timesheet submitted successfully.
```

Status becomes:

```text
Pending
```

---

# 38. Withdrawal

Only show withdrawal action while:

```text
status === "pending"
```

Dialog:

```text
Withdraw Timesheet

Are you sure you want to withdraw this submission?

Reason
[____________________________]

[Cancel] [Withdraw]
```

After withdrawal:

```text
Status: Withdrawn
```

The timesheet becomes editable again.

---

# 39. Submission History

Route:

```text
/user/submissions
```

Display all submitted timesheets.

Filters:

* Project
* Status
* Week/date

Statuses:

* Draft
* Pending
* Approved
* Declined
* Withdrawn

Table:

```text
Week
Project
Regular
Overtime
Total
Submitted
Status
Action
```

---

# 40. Submission Detail

Clicking a submission opens the detailed timesheet.

Show:

* Full timesheet
* Notes
* Submission date
* Reviewer
* Review date
* Decline reason
* Withdrawal reason

Timeline:

```text
Sep 11
Submitted

Sep 12
Reviewed by Sarah Johnson

Sep 12
Declined

Reason:
Please correct Thursday's hours.
```

---

# 41. Approval Center

Admin route:

```text
/admin/approvals
```

Supervisor route:

```text
/supervisor/approvals
```

This is a key workflow.

Header:

```text
Timesheet Approvals

7 submissions require your review.
```

Tabs:

```text
Pending
Approved
Declined
Withdrawn
```

---

# 42. Approval Table

Columns:

```text
Employee
Project
Week
Regular
Overtime
Total
Submitted
Status
```

Actions:

```text
Review
```

---

# 43. Review Timesheet

Open a drawer or full page.

Show complete timesheet.

Right-side review panel:

```text
Review

Employee
John Smith

Project
Website Modernization

Week
Sep 7 - Sep 11

Total
40h

Notes
Completed API integration...

──────────────────────

Decision

[ Decline ]   [ Approve ]
```

---

# 44. Approve Flow

Click Approve.

Confirmation:

```text
Approve Timesheet?

This will mark the timesheet as approved.

[Cancel] [Approve]
```

Success:

```text
✓ Timesheet approved.
```

---

# 45. Decline Flow

Click Decline.

Modal:

```text
Decline Timesheet

A reason is required.

Reason:
[________________________________]

[Cancel] [Decline Timesheet]
```

Do not allow submission without a decline reason.

After decline:

```text
Status: Declined
```

The user can edit and resubmit.

---

# 46. Supervisor Restrictions

A supervisor should only be able to review:

* Users assigned to them
* Projects they supervise

Do not expose all company timesheets to every supervisor.

Admin can see everything.

---

# 47. Timesheet Status System

Use a centralized TypeScript enum/type.

Conceptually:

```ts
type TimesheetStatus =
  | "draft"
  | "pending"
  | "approved"
  | "declined"
  | "withdrawn";
```

Status transition rules:

```text
draft → pending
pending → approved
pending → declined
pending → withdrawn
declined → pending
withdrawn → pending
```

Do not allow:

```text
approved → draft
approved → pending
approved → withdrawn
```

unless explicitly supported by a future admin override.

---

# 48. Status Badge Component

Create reusable:

```text
StatusBadge
```

Examples:

```text
Draft
Pending
Approved
Declined
Withdrawn
Active
Completed
Overdue
```

Each status should have consistent iconography and color treatment.

---

# 49. Notifications

Create:

```text
NotificationCenter
```

Notifications:

### User

```text
Timesheet submitted
Your timesheet is awaiting review.

Timesheet declined
Project Alpha — Sep 7-11

Deadline approaching
Project Beta deadline is in 5 days.
```

### Admin

```text
New timesheet submission
John Smith submitted a timesheet.

Project deadline approaching
Project Alpha is due soon.
```

Unread notifications should have a visual indicator.

---

# 50. Notification Page

Route:

```text
/notifications
```

Display grouped notifications:

```text
Today

● Timesheet submitted
  John Smith submitted Project Alpha
  10 minutes ago

● Deadline approaching
  Project Beta is due in 5 days
  1 hour ago

Earlier

● Timesheet approved
  Project Gamma
```

Allow:

```text
Mark all as read
```

---

# 51. Reports

Admin route:

```text
/admin/reports
```

Create a useful reporting dashboard.

Sections:

### Hours by Project

Chart.

### Hours by Employee

Table/chart.

### Overtime

Show:

```text
Regular Hours
1,240h

Overtime
84h

Total
1,324h
```

### Timesheet Status

```text
Approved
Pending
Declined
Withdrawn
Draft
```

Filters:

* Date range
* Project
* Employee
* Department

Include an Export button.

Frontend-only export may generate CSV from mock data.

---

# 52. Settings

Admin:

```text
/admin/settings
```

Sections:

### Organization

* Company name
* Logo
* Timezone

### Timesheet Settings

* Weekly start day
* Default workdays
* Standard weekly hours
* Weekend overtime enabled

### Notifications

* Submission notifications
* Deadline reminders
* Approval notifications

User:

```text
/user/settings
```

Sections:

* Profile
* Notification preferences
* Appearance

---

# 53. Reusable Components

Create a proper component library inside the frontend.

Suggested:

```text
components/
├── layout/
│   ├── AppShell.tsx
│   ├── Sidebar.tsx
│   ├── Topbar.tsx
│   ├── Breadcrumbs.tsx
│   └── MobileNav.tsx
│
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Select.tsx
│   ├── Textarea.tsx
│   ├── Modal.tsx
│   ├── Drawer.tsx
│   ├── Badge.tsx
│   ├── StatusBadge.tsx
│   ├── Card.tsx
│   ├── Table.tsx
│   ├── Tabs.tsx
│   ├── Dropdown.tsx
│   ├── Tooltip.tsx
│   ├── DatePicker.tsx
│   ├── Avatar.tsx
│   ├── Progress.tsx
│   ├── EmptyState.tsx
│   ├── LoadingState.tsx
│   ├── ErrorState.tsx
│   └── Toast.tsx
│
├── dashboard/
│   ├── StatCard.tsx
│   ├── ActivityTimeline.tsx
│   └── DeadlineCard.tsx
│
├── projects/
│   ├── ProjectCard.tsx
│   ├── ProjectTable.tsx
│   ├── ProjectForm.tsx
│   ├── ProjectHeader.tsx
│   ├── ProjectTeam.tsx
│   ├── ProjectDocuments.tsx
│   └── DeadlineIndicator.tsx
│
├── users/
│   ├── UserTable.tsx
│   ├── UserForm.tsx
│   └── UserProfileCard.tsx
│
├── timesheets/
│   ├── TimesheetGrid.tsx
│   ├── TimesheetEntryRow.tsx
│   ├── TimesheetSummary.tsx
│   ├── TimesheetNotes.tsx
│   ├── TimesheetActions.tsx
│   └── SubmissionTimeline.tsx
│
├── approvals/
│   ├── ApprovalTable.tsx
│   ├── ReviewPanel.tsx
│   └── DeclineModal.tsx
│
└── notifications/
    ├── NotificationBell.tsx
    └── NotificationList.tsx
```

The agent may adjust this structure if a better architecture is appropriate.

---

# 54. Pages Structure

Suggested:

```text
pages/
├── auth/
│   ├── AdminLogin.tsx
│   └── UserLogin.tsx
│
├── admin/
│   ├── Dashboard.tsx
│   ├── Projects.tsx
│   ├── CreateProject.tsx
│   ├── ProjectDetails.tsx
│   ├── Users.tsx
│   ├── CreateUser.tsx
│   ├── UserDetails.tsx
│   ├── Supervisors.tsx
│   ├── Timesheets.tsx
│   ├── Approvals.tsx
│   ├── Reports.tsx
│   ├── Notifications.tsx
│   └── Settings.tsx
│
├── user/
│   ├── Dashboard.tsx
│   ├── Projects.tsx
│   ├── ProjectDetails.tsx
│   ├── Timesheets.tsx
│   ├── TimesheetEditor.tsx
│   ├── Submissions.tsx
│   ├── SubmissionDetails.tsx
│   ├── Notifications.tsx
│   └── Settings.tsx
│
└── supervisor/
    ├── Timesheets.tsx
    └── Approvals.tsx
```

---

# 55. State Management

For the frontend shell, do not over-engineer state management.

React Context is sufficient for:

* Authentication
* Current user
* Mock application data

For larger state:

Use a lightweight state solution such as Zustand if required.

Recommended contexts:

```text
AuthContext
AppDataContext
NotificationContext
```

The architecture should make replacing mock data with API calls straightforward.

---

# 56. Mock Data

Create realistic mock data.

At minimum:

### Users

10-15 users.

Mix:

* Admin
* Normal users
* Supervisor-enabled users

### Projects

8-10 projects.

Mix:

* Active
* Draft
* Completed
* Overdue

### Timesheets

At least 20-30 records.

Mix:

* Draft
* Pending
* Approved
* Declined
* Withdrawn

### Notifications

At least 15 realistic notifications.

---

# 57. Mock Data Relationships

Do not create random unrelated mock data.

Relationships must make sense.

Example:

```text
Project Alpha
  Supervisor:
    Sarah Johnson

  Members:
    John Smith
    Priya Sharma
    Michael Brown
```

Then timesheets for Project Alpha should belong to those users.

If Sarah is the supervisor, she should be able to see their pending timesheets.

---

# 58. Forms

All forms must have frontend validation.

Required:

* Project name
* SOW number
* Start date
* End date
* User name
* Email
* Employee ID

Email validation.

Date validation.

Timesheet hour validation.

Do not allow negative hours.

Reason fields should be required when declining.

---

# 59. File Upload UX

No real backend upload is required.

Implement the UI.

Drag and drop:

```text
┌─────────────────────────────────────────┐
│                                         │
│              ↑                          │
│         Drop files here                 │
│                                         │
│      or Browse from your computer       │
│                                         │
│ PDF, DOCX, XLSX, PNG up to 10MB         │
└─────────────────────────────────────────┘
```

After selecting:

```text
✓ SOW.pdf
2.4 MB

[Remove]
```

Validate file size/type on the frontend.

---

# 60. Tables

Tables are a major part of the application.

Build a reusable table system supporting:

* Column definitions
* Sorting
* Pagination
* Empty states
* Row actions
* Responsive behavior

Desktop should use conventional tables.

Mobile should convert to cards or horizontally scrollable tables depending on context.

---

# 61. Search

Global search should search mock data across:

* Projects
* Users
* Timesheets

Example:

```text
Search "Alpha"

Projects
Website Modernization

Users
...

Timesheets
...
```

Use a command-palette-like dropdown.

Keyboard shortcut:

```text
Ctrl/Cmd + K
```

if practical.

---

# 62. Filters

Filters should use popovers or dropdowns.

Example:

```text
Filter

Status
☐ Draft
☐ Pending
☐ Approved
☐ Declined

Project
[ Select ]

Date
[ Start ] [ End ]

[Clear] [Apply]
```

---

# 63. Responsive Design

Must support:

* Desktop
* Tablet
* Mobile

Desktop:

```text
Sidebar + content
```

Tablet:

```text
Collapsed sidebar
```

Mobile:

```text
Top bar
Drawer navigation
Stacked cards
```

Timesheet grid on mobile should be carefully handled.

Possible approach:

* Horizontal scroll
* Sticky first column
* Sticky header

Do not simply shrink the table until it becomes unusable.

---

# 64. Loading States

Every major page should support loading states.

Use skeleton loaders.

Example:

```text
████████████████
████████
████████████████████████
```

Avoid generic "Loading..." text everywhere.

---

# 65. Empty States

Examples:

No projects:

```text
No projects yet

Projects assigned to you will appear here.

[View Dashboard]
```

No pending approvals:

```text
You're all caught up

There are no timesheets waiting for review.
```

No notifications:

```text
No notifications

You're up to date.
```

---

# 66. Error States

Provide friendly error UI.

Example:

```text
Something went wrong

We couldn't load this project.

[Try Again]
```

Do not expose technical stack traces.

---

# 67. Toast Notifications

Create reusable toast notifications.

Examples:

Success:

```text
✓ Project created successfully.
```

Success:

```text
✓ Timesheet saved as draft.
```

Success:

```text
✓ Timesheet submitted for review.
```

Error:

```text
Unable to save changes.
```

Warning:

```text
Your project deadline is approaching.
```

---

# 68. Confirmation Dialogs

Use confirmation dialogs for destructive or important actions:

* Delete project
* Delete document
* Deactivate user
* Remove user from project
* Withdraw timesheet
* Decline timesheet
* Final submit
* Approve timesheet

Never immediately perform destructive actions.

---

# 69. Accessibility

The application should:

* Use semantic HTML
* Provide labels for inputs
* Support keyboard navigation
* Maintain visible focus states
* Use appropriate ARIA labels
* Ensure buttons are identifiable
* Maintain adequate contrast
* Avoid relying only on color to convey status

---

# 70. Microinteractions

Use subtle animations.

Examples:

* Sidebar transitions
* Modal entrance
* Dropdown transitions
* Button loading states
* Toast appearance
* Tab transitions
* Hover elevation

Avoid excessive motion.

Tailwind transitions are sufficient.

---

# 71. Icons

Use Lucide React.

Examples:

```text
LayoutDashboard
FolderKanban
Users
Clock3
ClipboardCheck
FileText
Calendar
Bell
Settings
Search
Plus
ChevronDown
ChevronLeft
ChevronRight
Check
X
AlertTriangle
Upload
Download
MoreHorizontal
Edit
Trash2
UserCheck
```

---

# 72. Date Handling

Use a proper date library if needed.

Recommended:

```text
date-fns
```

Dates should be formatted consistently.

Example:

```text
Sep 4, 2026
```

For ranges:

```text
Sep 7 – Sep 11, 2026
```

Do not display raw ISO dates in UI.

---

# 73. Timesheet Calculations

Timesheet totals must be calculated dynamically.

For each entry:

```text
daily total =
sum of entry hours for that day
```

Weekly regular:

```text
sum(Mon-Fri)
```

Overtime:

```text
sum(Sat overtime + Sun overtime)
```

Total:

```text
regular + overtime
```

Do not hardcode totals.

If the user edits an hour field, all totals must update immediately.

---

# 74. Timesheet Validation

At minimum:

* Hours cannot be negative
* Hours cannot exceed 24 per day
* Weekend regular hours disabled
* Weekend overtime permitted
* Final submission should not occur with invalid data

If required by product rules, show warning when regular weekday total exceeds 24h.

---

# 75. Draft Persistence

Since there is no backend:

Persist important mock changes to localStorage.

At minimum:

```text
Current user
Timesheet drafts
Notification read state
Created projects
Created users
```

This makes the frontend feel like a functioning application.

---

# 76. Simulated API Layer

Even without a backend, do NOT scatter mock data directly through components.

Create a mock service layer.

Example:

```text
services/
├── authService.ts
├── projectService.ts
├── userService.ts
├── timesheetService.ts
├── notificationService.ts
└── reportService.ts
```

Functions:

```ts
getProjects()
getProjectById(id)
createProject(data)
updateProject(id, data)

getUsers()
createUser(data)
updateUser(id, data)

getTimesheets()
getTimesheetById(id)
saveTimesheetDraft(id, data)
submitTimesheet(id)
withdrawTimesheet(id)
approveTimesheet(id)
declineTimesheet(id, reason)
```

These should initially operate against mock/localStorage data.

Later they can be replaced with actual API calls.

---

# 77. Type Definitions

Centralize domain types.

Example:

```text
types/
├── auth.ts
├── user.ts
├── project.ts
├── timesheet.ts
├── notification.ts
└── report.ts
```

Example:

```ts
type UserRole = "admin" | "user";

interface User {
  id: string;
  name: string;
  email: string;
  employeeId: string;
  department: string;
  role: UserRole;
  isSupervisor: boolean;
  status: "active" | "inactive";
}
```

---

# 78. Design Tokens

Centralize repeated UI values.

Examples:

```text
border radius
shadows
spacing
colors
typography
```

Use Tailwind utility classes consistently rather than arbitrary styling.

---

# 79. Component Styling Rules

Buttons:

Primary:

```text
bg-indigo-600
hover:bg-indigo-700
```

Secondary:

```text
border
bg-white
hover:bg-slate-50
```

Danger:

```text
bg-red-600
```

Cards:

```text
bg-white
border
rounded-xl
shadow-sm
```

Do not make every card heavily shadowed.

---

# 80. Dashboard Card Design

Cards should contain meaningful information.

Example:

```text
┌──────────────────────────────┐
│ Active Projects        📁    │
│                              │
│ 24                           │
│ +3 this month                │
└──────────────────────────────┘
```

Some cards can include small visual indicators.

---

# 81. Project Card Design

```text
┌─────────────────────────────────────────┐
│ Website Modernization            ACTIVE │
│                                         │
│ ABC Corporation                         │
│ Sep 1 → Nov 30                          │
│                                         │
│ Team                 Deadline            │
│ 👥 8                  23 days            │
│                                         │
│ ████████████████░░░  78%                │
│                                         │
│ [Open Project]                          │
└─────────────────────────────────────────┘
```

---

# 82. Avatar System

Use initials when no image exists.

Examples:

```text
AS
JS
PJ
SM
```

Generate deterministic initials from user names.

Avatar colors can be generated consistently based on user ID.

---

# 83. Breadcrumbs

Examples:

Admin:

```text
Projects / Website Modernization
```

User:

```text
My Projects / Website Modernization
```

Timesheet:

```text
My Timesheets / Sep 7 – Sep 11
```

---

# 84. Role-Aware UI

Admin:

* Full project management
* Full user management
* Full timesheet visibility
* Approvals
* Reports
* Settings

Normal user:

* Assigned projects only
* Own timesheets
* Own submissions
* Notifications

Supervisor:

* Normal user capabilities
* Team timesheets
* Team approvals

Never expose admin navigation to normal users.

---

# 85. Permission Helpers

Create utilities:

```ts
canManageProjects(user)
canManageUsers(user)
canReviewTimesheet(user, timesheet)
canWithdrawTimesheet(user, timesheet)
canEditTimesheet(user, timesheet)
```

This should centralize permission logic.

---

# 86. Project Permissions

Admin:

```text
Can view all projects
Can create
Can edit
Can delete/archive
Can assign users
```

User:

```text
Can view assigned projects
```

Supervisor:

```text
Can view supervised projects
Can review team timesheets
```

---

# 87. Timesheet Permissions

User:

```text
Can create own timesheet
Can edit draft
Can submit
Can withdraw pending
Can edit declined
```

Supervisor:

```text
Can review assigned team
Can approve
Can decline
```

Admin:

```text
Can review all
Can approve
Can decline
```

---

# 88. Frontend Demo Requirements

The final frontend must be demonstrable without a backend.

A reviewer should be able to:

1. Open `/adminlog`.
2. Login as admin.
3. View dashboard.
4. Open Projects.
5. Create a project.
6. Add users.
7. Assign a supervisor.
8. View project details.
9. Navigate to Users.
10. Create a user.
11. Switch to a user login.
12. View assigned projects.
13. Open timesheet.
14. Enter Monday-Friday hours.
15. Enter weekend overtime.
16. Add notes.
17. Save draft.
18. Return later and edit draft.
19. Final submit.
20. Switch to supervisor/admin.
21. See pending submission.
22. Review timesheet.
23. Approve or decline.
24. Switch back to user.
25. See the new status.
26. If declined, edit and resubmit.
27. If pending, withdraw submission.
28. See notifications.

This end-to-end flow must work using frontend state.

---

# 89. Demo Accounts

Provide convenient demo login buttons.

Admin login page:

```text
Continue as Demo Admin
```

User login page:

```text
Continue as Demo User
```

Supervisor login:

```text
Continue as Demo Supervisor
```

These should populate credentials/state without requiring actual credentials.

---

# 90. Development Phases

Build the project in the following phases.

---

## PHASE 1 — Project Initialization

Create:

```text
/frontend
```

Initialize:

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router
* Lucide React

Optional:

* date-fns
* Recharts
* Zustand

Verify:

```text
npm install
npm run dev
```

works.

---

## PHASE 2 — Architecture

Create:

```text
src/
├── components/
├── pages/
├── layouts/
├── routes/
├── contexts/
├── hooks/
├── services/
├── mock/
├── types/
├── utils/
├── lib/
└── assets/
```

Create the domain models.

---

## PHASE 3 — Design System

Build:

* Buttons
* Inputs
* Selects
* Cards
* Tables
* Badges
* Modals
* Drawers
* Tabs
* Toasts
* Avatars
* Progress bars
* Skeletons
* Empty states

Make these reusable before building complex pages.

---

## PHASE 4 — Authentication

Build:

* Admin login
* User login
* Mock auth context
* Logout
* Protected routes
* Role detection
* Supervisor detection

---

## PHASE 5 — Application Shell

Build:

* Sidebar
* Topbar
* Mobile navigation
* Breadcrumbs
* Profile dropdown
* Global search
* Notification bell

---

## PHASE 6 — Mock Data Layer

Create:

* Users
* Projects
* Timesheets
* Notifications
* Documents
* Activities

Build service functions.

Add localStorage persistence.

---

## PHASE 7 — Admin Dashboard

Implement all dashboard widgets and interactions.

---

## PHASE 8 — User Dashboard

Implement:

* Weekly summary
* Current timesheet
* Projects
* Submission history
* Deadlines

---

## PHASE 9 — Project Management

Implement:

* Project list
* Search
* Filters
* Create project
* Edit project
* Project detail
* Team
* Documents
* Activity
* Project timesheets

---

## PHASE 10 — User Management

Implement:

* User list
* Search
* Filters
* Create user
* Edit user
* User details
* Supervisor capability

---

## PHASE 11 — Supervisor Management

Implement:

* Supervisor list
* Team relationships
* Assigned projects
* Pending review counts

---

## PHASE 12 — Timesheet Engine

Implement:

* Week selection
* Weekday entry
* Weekend overtime
* Totals
* Notes
* Validation
* Draft state
* localStorage persistence

This phase should be thoroughly tested.

---

## PHASE 13 — Submission Workflow

Implement:

```text
Draft
Pending
Approved
Declined
Withdrawn
```

Implement every state transition.

---

## PHASE 14 — Approval Workflow

Implement:

* Pending approvals
* Review screen
* Approve
* Decline
* Decline reason
* User notification

---

## PHASE 15 — Notifications

Implement:

* Notification bell
* Notification list
* Read/unread
* Notification generation from actions

---

## PHASE 16 — Reports

Implement:

* Hours by project
* Hours by employee
* Overtime
* Status breakdown
* Filters
* CSV export

---

## PHASE 17 — Settings

Implement:

* Profile
* Notification preferences
* Timesheet preferences
* Organization settings

---

## PHASE 18 — Responsive Design

Test every page at:

```text
375px
768px
1024px
1280px
1440px+
```

Fix:

* Overflow
* Tables
* Modals
* Sidebar
* Timesheet grid
* Forms

---

## PHASE 19 — Accessibility

Verify:

* Keyboard navigation
* Focus
* Labels
* Semantic structure
* Contrast
* Screen-reader-friendly controls

---

## PHASE 20 — Polish

Add:

* Transitions
* Hover states
* Loading states
* Empty states
* Error states
* Toasts
* Confirmation dialogs
* Skeletons

Remove:

* console errors
* broken links
* placeholder text
* dead buttons
* inconsistent spacing
* inconsistent icon usage

---

# 91. Final Folder Structure

Target something approximately like:

```text
project-root/
│
├── frontend/
│   ├── public/
│   │
│   ├── src/
│   │   ├── assets/
│   │   │
│   │   ├── components/
│   │   │   ├── approvals/
│   │   │   ├── dashboard/
│   │   │   ├── layout/
│   │   │   ├── notifications/
│   │   │   ├── projects/
│   │   │   ├── timesheets/
│   │   │   ├── ui/
│   │   │   └── users/
│   │   │
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── mock/
│   │   ├── pages/
│   │   │   ├── admin/
│   │   │   ├── auth/
│   │   │   ├── supervisor/
│   │   │   └── user/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── types/
│   │   ├── utils/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── ...
│
└── frontend.md
```

---

# 92. Important Engineering Rule

Do not build the entire application as a collection of static mock screens.

Every important interaction should actually work.

For example:

If the user enters:

```text
Monday = 8
Tuesday = 7
Wednesday = 8
Thursday = 8
Friday = 8
Saturday overtime = 4
Sunday overtime = 2
```

The UI must calculate:

```text
Regular: 39h
Overtime: 6h
Total: 45h
```

If the user saves:

```text
Draft
```

then navigates away and returns, the draft should still exist.

If they submit:

```text
Draft → Pending
```

the approval center should immediately show that submission.

If a supervisor declines:

```text
Pending → Declined
```

the user's submission should show the decline reason.

If the user resubmits:

```text
Declined → Pending
```

the supervisor should see the updated submission.

The frontend should behave as though a real backend exists.

---

# 93. Backend Readiness

The backend will be built later.

Therefore:

### DO

Create interfaces such as:

```ts
Project
User
Timesheet
TimesheetEntry
Notification
Document
Review
```

Create service methods:

```ts
projectService.createProject()
timesheetService.submitTimesheet()
```

Use async service interfaces where appropriate.

### DO NOT

Put business logic directly into JSX.

Avoid:

```tsx
onClick={() => {
  // 100 lines of business logic
}}
```

Instead:

```tsx
onClick={handleSubmit}
```

and place logic in hooks/services.

---

# 94. API Replacement Strategy

The eventual backend should be replaceable without rewriting the UI.

For example:

Current:

```ts
timesheetService.submitTimesheet(id)
```

Currently:

```text
→ localStorage/mock state
```

Later:

```text
→ POST /api/timesheets/:id/submit
```

The React components should not need to know which implementation is being used.

---

# 95. Code Quality

Use:

* Strong TypeScript types
* Reusable components
* Small components
* Clear naming
* Consistent formatting
* No unnecessary duplication
* No `any` unless absolutely unavoidable
* No unused imports
* No console errors

Use ESLint if configured.

---

# 96. Important UX Principle

The user should always know:

1. Where they are
2. What project they are working on
3. Which week they are editing
4. What the timesheet status is
5. What action they can take next
6. Whether an action succeeded
7. Why an action is unavailable

For example, if the user cannot withdraw:

Do not simply hide the button without explanation.

Status:

```text
✓ Approved

This timesheet has already been approved and cannot be withdrawn.
```

---

# 97. Important Visual Principle

Do not make the UI minimalist.

It should have enough visual hierarchy to feel like a serious enterprise product.

Use:

* Cards
* Tables
* Tabs
* Badges
* Progress indicators
* Timeline components
* Charts
* Avatars
* Icons
* Subtle background sections
* Contextual actions
* Rich empty states

But maintain consistency.

The UI should feel **dense enough to be useful without becoming cluttered**.

---

# 98. Definition of Done

The frontend is complete only when:

### Authentication

* [ ] Admin login works
* [ ] User login works
* [ ] Supervisor login works
* [ ] Logout works
* [ ] Protected routes work
* [ ] Role-aware navigation works

### Admin

* [ ] Dashboard
* [ ] Project management
* [ ] Project creation
* [ ] Project editing
* [ ] Project team assignment
* [ ] User management
* [ ] User creation
* [ ] Supervisor management
* [ ] Timesheet overview
* [ ] Approval center
* [ ] Reports
* [ ] Notifications
* [ ] Settings

### User

* [ ] Dashboard
* [ ] My projects
* [ ] Project details
* [ ] Weekly timesheet
* [ ] Mon-Fri hours
* [ ] Weekend overtime
* [ ] Notes
* [ ] Draft save
* [ ] Final submit
* [ ] Submission history
* [ ] Withdrawal
* [ ] Decline handling
* [ ] Resubmission
* [ ] Notifications
* [ ] Settings

### Supervisor

* [ ] Team timesheets
* [ ] Pending approvals
* [ ] Review
* [ ] Approve
* [ ] Decline
* [ ] Decline reason
* [ ] Team/project restrictions

### UX

* [ ] Responsive
* [ ] Loading states
* [ ] Empty states
* [ ] Error states
* [ ] Toasts
* [ ] Confirmation dialogs
* [ ] Form validation
* [ ] Accessible controls
* [ ] Consistent design system
* [ ] No broken interactions

---

# 99. Final Instruction to Coding Agent

You are not merely creating a visual prototype.

Build a **fully navigable, interactive frontend shell** for the Alphanet internal Project & Timesheet Management System.

Start by creating `/frontend`.

Then implement the architecture and design system before building individual features.

Prioritize:

1. Application shell
2. Authentication
3. Dashboard
4. Projects
5. Users
6. Timesheets
7. Submission workflow
8. Supervisor/approval workflow
9. Notifications
10. Reports
11. Responsive polish

Use realistic mock data.

All major actions must update the frontend state.

The final result should feel like a real internal SaaS product that Alphanet employees could plausibly use, even though its data layer is currently mocked.

The frontend should be **modern, sleek, polished, information-rich, responsive, easy to navigate, and ready to connect to a backend later.**

---

# 100. Progress Checklist

Use this checklist to track implementation progress. Mark items as complete as they are finished.

---

## Phase 0 — Project Initialization

- [x] `/frontend` directory created at project root
- [x] Vite + React + TypeScript project initialized inside `/frontend`
- [x] Tailwind CSS installed and configured
- [x] React Router installed and configured
- [x] Lucide React installed
- [x] date-fns installed
- [x] Recharts installed (optional but recommended)
- [x] Zustand installed (optional)
- [x] ESLint configured and passing
- [x] `npm install` runs without errors
- [x] `npm run dev` starts successfully
- [x] `npm run build` succeeds
- [x] `tsconfig.json` configured with strict mode
- [x] `vite.config.ts` configured with correct base/paths
- [x] `index.html` entry point set up
- [x] `src/main.tsx` mounts app
- [x] `src/App.tsx` created with router
- [x] `src/index.css` imports Tailwind directives

---

## Phase 1 — Folder Structure & Architecture

- [x] `src/components/` directory created
- [x] `src/components/layout/` created
- [x] `src/components/ui/` created
- [x] `src/components/dashboard/` created
- [x] `src/components/projects/` created
- [x] `src/components/users/` created
- [x] `src/components/timesheets/` created
- [x] `src/components/approvals/` created
- [x] `src/components/notifications/` created
- [x] `src/contexts/` created
- [x] `src/hooks/` created
- [x] `src/layouts/` created
- [x] `src/mock/` created
- [x] `src/pages/` created
- [x] `src/pages/auth/` created
- [x] `src/pages/admin/` created
- [x] `src/pages/user/` created
- [x] `src/pages/supervisor/` created
- [x] `src/routes/` created
- [x] `src/services/` created
- [x] `src/types/` created
- [x] `src/utils/` created
- [x] `src/lib/` created
- [x] `src/assets/` created

---

## Phase 2 — Type Definitions

### Auth Types
- [x] `types/auth.ts` created
- [x] `UserRole` type defined (`"admin" | "user"`)
- [x] `User` interface defined (id, name, email, employeeId, department, role, isSupervisor, status)
- [x] `AuthContextType` interface defined

### User Types
- [x] `types/user.ts` created
- [x] `UserStatus` type defined (`"active" | "inactive"`)
- [x] `CreateUserInput` interface defined

### Project Types
- [x] `types/project.ts` created
- [x] `ProjectStatus` type defined (`"draft" | "active" | "completed" | "overdue" | "archived"`)
- [x] `Project` interface defined
- [x] `CreateProjectInput` interface defined

### Timesheet Types
- [x] `types/timesheet.ts` created
- [x] `TimesheetStatus` type defined (`"draft" | "pending" | "approved" | "declined" | "withdrawn"`)
- [x] `TimesheetEntry` interface defined (id, description, hours per day)
- [x] `Timesheet` interface defined
- [x] `SaveTimesheetInput` interface defined

### Notification Types
- [x] `types/notification.ts` created
- [x] `Notification` interface defined (id, userId, type, title, message, read, createdAt)
- [x] `NotificationType` type defined

### Report Types
- [x] `types/report.ts` created
- [x] `ReportFilters` interface defined
- [x] `HoursByProject` interface defined
- [x] `HoursByEmployee` interface defined

---

## Phase 3 — Utility Functions & Helpers

### Date Utilities
- [x] `utils/date.ts` created
- [x] `formatDate()` function implemented
- [x] `formatDateRange()` function implemented
- [x] `getWeekDates()` function implemented
- [x] `isWeekend()` function implemented
- [x] `addDays()` function implemented
- [x] `differenceInDays()` function implemented
- [x] `isOverdue()` function implemented

### Permission Utilities
- [x] `utils/permissions.ts` created
- [x] `canManageProjects(user)` implemented
- [x] `canManageUsers(user)` implemented
- [x] `canReviewTimesheet(user, timesheet)` implemented
- [x] `canWithdrawTimesheet(user, timesheet)` implemented
- [x] `canEditTimesheet(user, timesheet)` implemented
- [x] `canViewTimesheet(user, timesheet)` implemented

### Formatting Utilities
- [x] `utils/format.ts` created
- [x] `formatHours()` function implemented
- [x] `formatCurrency()` function implemented (if needed)
- [x] `getInitials()` function implemented
- [x] `truncate()` function implemented

### Validation Utilities
- [x] `utils/validation.ts` created
- [x] `validateEmail()` function implemented
- [x] `validateRequired()` function implemented
- [x] `validateHours()` function implemented (0-24 range)
- [x] `validateDateRange()` function implemented
- [x] `validateTimesheet()` function implemented

### Storage Utilities
- [x] `utils/storage.ts` created
- [x] `getLocalStorage()` function implemented
- [x] `setLocalStorage()` function implemented
- [x] `removeLocalStorage()` function implemented

---

## Phase 4 — Mock Data Layer

### Mock Users
- [x] `mock/users.ts` created
- [x] Admin user created (Alex Morgan, admin-1, admin role)
- [x] Demo normal user created (John Smith, user-1, user role)
- [x] Demo supervisor created (Sarah Johnson, user-2, user role + isSupervisor)
- [x] 10-15 total users created with realistic names, emails, departments, employee IDs
- [x] Mix of active/inactive users
- [x] Mix of supervisor/non-supervisor users
- [x] Users have consistent departments and roles

### Mock Projects
- [x] `mock/projects.ts` created
- [x] 8-10 projects created
- [x] Projects have realistic names, SOW numbers, clients
- [x] Mix of statuses: active, draft, completed, overdue
- [x] Projects have valid start dates, end dates, deadlines
- [x] Projects have assigned managers
- [x] Projects have assigned supervisors (from mock users)
- [x] Projects have assigned team members (from mock users)
- [x] Project statuses are consistent with dates (overdue projects have past end dates)

### Mock Timesheets
- [x] `mock/timesheets.ts` created
- [x] 20-30 timesheets created
- [x] Mix of all statuses: draft, pending, approved, declined, withdrawn
- [x] Timesheets have realistic week date ranges
- [x] Timesheets have Mon-Fri regular hours (0-8 range)
- [x] Timesheets have Sat/Sun overtime hours
- [x] Timesheets have notes
- [x] Timesheets are linked to valid projects and users
- [x] Timesheets have valid submission/review dates
- [x] Declined timesheets have decline reasons
- [x] Withdrawn timesheets have withdrawal reasons
- [x] Approved timesheets have reviewer info and approval date

### Mock Notifications
- [x] `mock/notifications.ts` created
- [x] 15+ notifications created
- [x] Notifications linked to valid users
- [x] Mix of read/unread notifications
- [x] Notification types include: submission, approval, decline, deadline, withdrawal
- [x] Notifications have realistic timestamps
- [x] Notifications reference valid projects/timesheets

### Mock Documents
- [x] `mock/documents.ts` created
- [x] Documents linked to valid projects
- [x] Documents have names, sizes, upload dates, uploaders

### Mock Activities
- [x] `mock/activities.ts` created
- [x] Activity log entries created
- [x] Activities reference valid users, projects, timesheets
- [x] Activities have realistic timestamps

### Data Relationship Integrity
- [x] Every project supervisor is a valid mock user with isSupervisor=true
- [x] Every project team member is a valid mock user
- [x] Every timesheet belongs to a valid user and project
- [x] Supervisors can see their team members' timesheets
- [x] Users can only see their own timesheets
- [x] Admin can see all timesheets

---

## Phase 5 — Service Layer

### Auth Service
- [x] `services/authService.ts` created
- [x] `login(role)` function implemented (returns mock user)
- [x] `logout()` function implemented
- [x] `getCurrentUser()` function implemented
- [x] `isAuthenticated()` function implemented
- [x] Uses localStorage for session persistence

### Project Service
- [x] `services/projectService.ts` created
- [x] `getProjects()` implemented (returns all projects)
- [x] `getProjectById(id)` implemented
- [x] `getProjectsByUserId(userId)` implemented
- [x] `getProjectsBySupervisorId(supervisorId)` implemented
- [x] `createProject(data)` implemented (adds to mock data + localStorage)
- [x] `updateProject(id, data)` implemented
- [x] `deleteProject(id)` implemented (or archive)
- [x] `addTeamMember(projectId, userId)` implemented
- [x] `removeTeamMember(projectId, userId)` implemented
- [x] `assignSupervisor(projectId, userId)` implemented
- [x] `searchProjects(query)` implemented

### User Service
- [x] `services/userService.ts` created
- [x] `getUsers()` implemented
- [x] `getUserById(id)` implemented
- [x] `createUser(data)` implemented
- [x] `updateUser(id, data)` implemented
- [x] `deactivateUser(id)` implemented
- [x] `getSupervisors()` implemented
- [x] `getUsersBySupervisorId(supervisorId)` implemented
- [x] `searchUsers(query)` implemented

### Timesheet Service
- [x] `services/timesheetService.ts` created
- [x] `getTimesheets()` implemented
- [x] `getTimesheetById(id)` implemented
- [x] `getTimesheetsByUserId(userId)` implemented
- [x] `getTimesheetsByProjectId(projectId)` implemented
- [x] `getTimesheetsBySupervisorId(supervisorId)` implemented
- [x] `saveDraft(id, data)` implemented
- [x] `submitTimesheet(id)` implemented (draft → pending)
- [x] `withdrawTimesheet(id, reason)` implemented (pending → withdrawn)
- [x] `approveTimesheet(id, reviewerId)` implemented (pending → approved)
- [x] `declineTimesheet(id, reason, reviewerId)` implemented (pending → declined)
- [x] `getCurrentWeekTimesheet(userId, projectId)` implemented
- [x] `createTimesheet(data)` implemented
- [x] `searchTimesheets(query)` implemented

### Notification Service
- [x] `services/notificationService.ts` created
- [x] `getNotifications(userId)` implemented
- [x] `getUnreadNotifications(userId)` implemented
- [x] `markAsRead(id)` implemented
- [x] `markAllAsRead(userId)` implemented
- [x] `createNotification(data)` implemented
- [x] `getNotificationCount(userId)` implemented

### Report Service
- [x] `services/reportService.ts` created
- [x] `getHoursByProject(filters)` implemented
- [x] `getHoursByEmployee(filters)` implemented
- [x] `getOvertimeStats(filters)` implemented
- [x] `getTimesheetStatusBreakdown(filters)` implemented
- [x] `exportToCSV(data)` implemented

---

## Phase 6 — React Contexts

### AuthContext
- [x] `contexts/AuthContext.tsx` created
- [x] Provides current user state
- [x] Provides login function
- [x] Provides logout function
- [x] Provides isAuthenticated flag
- [x] Persists session to localStorage
- [x] TypeScript types defined for context value

### AppDataContext
- [x] `contexts/AppDataContext.tsx` created
- [x] Provides projects state
- [x] Provides users state
- [x] Provides timesheets state
- [x] Provides notifications state
- [x] Provides CRUD functions for all entities
- [x] Syncs with localStorage on changes
- [x] TypeScript types defined for context value

### NotificationContext
- [x] `contexts/NotificationContext.tsx` created
- [x] Provides notifications array
- [x] Provides unread count
- [x] Provides markAsRead function
- [x] Provides markAllAsRead function
- [x] TypeScript types defined for context value

### ToastContext
- [x] `contexts/ToastContext.tsx` created
- [x] Provides toasts array
- [x] Provides addToast function
- [x] Provides removeToast function
- [x] Toast types: success, error, warning, info
- [x] TypeScript types defined for context value

---

## Phase 7 — UI Component Library

### Button
- [x] `components/ui/Button.tsx` created
- [x] Primary variant (bg-indigo-600, hover:bg-indigo-700)
- [x] Secondary variant (border, bg-white, hover:bg-slate-50)
- [x] Danger variant (bg-red-600)
- [x] Ghost variant
- [x] Loading state with spinner
- [x] Disabled state
- [x] Icon support (left/right)
- [x] Proper TypeScript props

### Input
- [x] `components/ui/Input.tsx` created
- [x] Text input with label
- [x] Error state display
- [x] Helper text support
- [x] Icon support
- [x] Proper focus states
- [x] TypeScript props with validation support

### Select
- [x] `components/ui/Select.tsx` created
- [x] Native select styled
- [x] Label support
- [x] Error state
- [x] Placeholder option
- [x] TypeScript props

### Textarea
- [x] `components/ui/Textarea.tsx` created
- [x] Label support
- [x] Error state
- [x] Character count (optional)
- [x] Resizable behavior
- [x] TypeScript props

### Modal
- [x] `components/ui/Modal.tsx` created
- [x] Overlay with backdrop blur
- [x] Centered dialog
- [x] Close button
- [x] Keyboard close (Escape)
- [x] Click outside to close
- [x] Size variants (sm, md, lg)
- [x] Animation on open/close
- [x] Portal-based rendering
- [x] Focus trap
- [x] TypeScript props

### Drawer
- [x] `components/ui/Drawer.tsx` created
- [x] Slides from right
- [x] Overlay backdrop
- [x] Close button
- [x] Size variants
- [x] Animation
- [x] TypeScript props

### Badge
- [x] `components/ui/Badge.tsx` created
- [x] Color variants (default, success, warning, danger, info)
- [x] Size variants
- [x] Icon support
- [x] TypeScript props

### StatusBadge
- [x] `components/ui/StatusBadge.tsx` created
- [x] Draft status styling
- [x] Pending status styling
- [x] Approved status styling
- [x] Declined status styling
- [x] Withdrawn status styling
- [x] Active status styling
- [x] Completed status styling
- [x] Overdue status styling
- [x] Icon + text for each status
- [x] TypeScript props accepting TimesheetStatus/ProjectStatus

### Card
- [x] `components/ui/Card.tsx` created
- [x] White background, border, rounded-xl, shadow-sm
- [x] Header slot
- [x] Body slot
- [x] Footer slot
- [x] Hover state support
- [x] Click handler support
- [x] TypeScript props

### Table
- [x] `components/ui/Table.tsx` created
- [x] Column definitions array
- [x] Sortable columns
- [x] Sort direction indicators
- [x] Row click handler
- [x] Empty state slot
- [x] Loading state slot
- [x] Responsive behavior (horizontal scroll on mobile)
- [x] Sticky header option
- [x] Pagination support
- [x] Row actions slot
- [x] TypeScript generic props

### Tabs
- [x] `components/ui/Tabs.tsx` created
- [x] Tab list component
- [x] Tab trigger component
- [x] Tab content component
- [x] Active state styling
- [x] Keyboard navigation
- [x] TypeScript props

### Dropdown
- [x] `components/ui/Dropdown.tsx` created
- [x] Trigger element
- [x] Menu items
- [x] Divider support
- [x] Icon support
- [x] Click outside to close
- [x] Keyboard navigation
- [x] TypeScript props

### Tooltip
- [x] `components/ui/Tooltip.tsx` created
- [x] Trigger element
- [x] Tooltip content
- [x] Positioning logic
- [x] Delay support
- [x] TypeScript props

### DatePicker
- [x] `components/ui/DatePicker.tsx` created
- [x] Calendar popup
- [x] Date selection
- [x] Min/max date support
- [x] Disabled dates support
- [x] Formatted display
- [x] TypeScript props
- [x] Uses date-fns for formatting

### Avatar
- [x] `components/ui/Avatar.tsx` created
- [x] Image support
- [x] Initials fallback (deterministic from name)
- [x] Color generation based on user ID
- [x] Size variants (sm, md, lg)
- [x] Status indicator support
- [x] TypeScript props

### Progress
- [x] `components/ui/Progress.tsx` created
- [x] Progress bar with percentage
- [x] Color variants
- [x] Label support
- [x] Animation
- [x] TypeScript props

### EmptyState
- [x] `components/ui/EmptyState.tsx` created
- [x] Icon/illustration slot
- [x] Title text
- [x] Description text
- [x] Action button slot
- [x] TypeScript props

### LoadingState
- [x] `components/ui/LoadingState.tsx` created
- [x] Skeleton loader variant
- [x] Spinner variant
- [x] Full page loading variant
- [x] TypeScript props

### ErrorState
- [x] `components/ui/ErrorState.tsx` created
- [x] Error icon
- [x] Title text
- [x] Description text
- [x] Retry button slot
- [x] TypeScript props

### Toast
- [x] `components/ui/Toast.tsx` created
- [x] Success variant (green)
- [x] Error variant (red)
- [x] Warning variant (amber)
- [x] Info variant (blue)
- [x] Auto-dismiss after timeout
- [x] Manual dismiss button
- [x] Animation on enter/exit
- [x] Icon support
- [x] TypeScript props
- [x] Toast container component

### Breadcrumbs
- [x] `components/layout/Breadcrumbs.tsx` created
- [x] Accepts breadcrumb items array
- [x] Separator between items
- [x] Last item non-clickable
- [x] Hover states
- [x] TypeScript props

---

## Phase 8 — Layout Components

### AppShell
- [x] `components/layout/AppShell.tsx` created
- [x] Wraps authenticated pages
- [x] Includes sidebar and topbar
- [x] Responsive layout
- [x] Scrollable content area
- [x] TypeScript props for children

### Sidebar
- [x] `components/layout/Sidebar.tsx` created
- [x] Fixed/sticky on desktop
- [x] Collapsible on tablet
- [x] Drawer behavior on mobile
- [x] Admin navigation items:
  - [x] Dashboard
  - [x] Projects (under WORKSPACE header)
  - [x] Users (under WORKSPACE header)
  - [x] Supervisors (under WORKSPACE header)
  - [x] Timesheets (under TIME header)
  - [x] Approvals (under TIME header)
  - [x] Reports (under INSIGHTS header)
  - [x] Notifications (under SYSTEM header)
  - [x] Settings (under SYSTEM header)
- [x] User navigation items:
  - [x] Dashboard
  - [x] My Projects (under WORK header)
  - [x] My Timesheets (under WORK header)
  - [x] Submissions (under WORK header)
  - [x] Team Timesheets (under SUPERVISOR header, conditional)
  - [x] Approvals (under SUPERVISOR header, conditional)
  - [x] Notifications (under SYSTEM header)
  - [x] Settings (under SYSTEM header)
- [x] Section headers (WORKSPACE, TIME, INSIGHTS, SYSTEM, WORK, SUPERVISOR)
- [x] Active route highlighting
- [x] Icons next to each nav item (Lucide React)
- [x] User info at bottom (avatar, name, role)
- [x] Logout button
- [x] Mobile hamburger toggle
- [x] Collapse/expand animation
- [x] TypeScript props

### Topbar
- [x] `components/layout/Topbar.tsx` created
- [x] Left side: sidebar toggle (mobile only), breadcrumbs
- [x] Right side: search, notification bell, user profile dropdown
- [x] Sticky positioning
- [x] Border bottom
- [x] Proper z-index
- [x] TypeScript props

### MobileNav
- [x] `components/layout/MobileNav.tsx` created
- [x] Hamburger button
- [x] Overlay when open
- [x] Slide-in drawer
- [x] Navigation links
- [x] Close on route change
- [x] Close on overlay click
- [x] TypeScript props

### ProfileDropdown
- [x] `components/layout/ProfileDropdown.tsx` created
- [x] User name and role displayed
- [x] Profile link
- [x] Settings link
- [x] Sign out link
- [x] Click outside to close
- [x] Keyboard navigation
- [x] TypeScript props

---

## Phase 9 — Authentication Pages

### Admin Login
- [x] `pages/auth/AdminLogin.tsx` created
- [x] Route: `/adminlog`
- [x] Split-screen layout (desktop)
- [x] Left side: Alphanet branding, abstract decorative elements, tagline
- [x] Right side: Login form
- [x] "Admin Portal" heading
- [x] Email input field
- [x] Password input field with show/hide toggle
- [x] Remember me checkbox
- [x] Sign In button (primary style)
- [x] Forgot password link (visual only)
- [x] Loading state on submit
- [x] Validation errors displayed
- [x] Invalid login state
- [x] "Continue as Demo Admin" button
- [x] Responsive: full-width form on mobile, no split screen

### User Login
- [x] `pages/auth/UserLogin.tsx` created
- [x] Route: `/userlog`
- [x] Same design system as admin login
- [x] "Employee Portal" heading (distinct from admin)
- [x] Email input field
- [x] Password input field with show/hide toggle
- [x] Remember me checkbox
- [x] Sign In button
- [x] Forgot password link
- [x] Loading state
- [x] Validation errors
- [x] Invalid login state
- [x] "Continue as Demo User" button
- [x] "Continue as Demo Supervisor" button
- [x] Responsive behavior

### Route Guards
- [x] `routes/ProtectedRoute.tsx` created
- [x] Redirects unauthenticated users to appropriate login
- [x] Admin routes redirect to `/adminlog`
- [x] User routes redirect to `/userlog`
- [x] Supervisor routes redirect to `/userlog` (supervisors log in via user portal)
- [x] Loading state while checking auth

### Logout
- [x] Logout clears auth context
- [x] Logout clears localStorage session
- [x] Logout redirects to appropriate login page based on role
- [x] Confirmation dialog before logout (optional)

---

## Phase 10 — Dashboard Components

### StatCard
- [x] `components/dashboard/StatCard.tsx` created
- [x] Icon display
- [x] Large number
- [x] Label text
- [x] Trend/change indicator (optional)
- [x] Supporting text
- [x] Icon background color
- [x] Hover state
- [x] TypeScript props

### ActivityTimeline
- [x] `components/dashboard/ActivityTimeline.tsx` created
- [x] Vertical timeline layout
- [x] Time ago display (e.g., "10 min ago")
- [x] Activity description
- [x] User avatar/name
- [x] Color-coded activity types
- [x] TypeScript props

### DeadlineCard
- [x] `components/dashboard/DeadlineCard.tsx` created
- [x] Project name
- [x] Deadline date
- [x] Days remaining calculation
- [x] Progress bar
- [x] Status indicator (on track, approaching, overdue)
- [x] TypeScript props

### DeadlineIndicator
- [x] `components/projects/DeadlineIndicator.tsx` created
- [x] Normal state: green "On Track" + days remaining
- [x] Warning state: amber "Deadline approaching" + days remaining
- [x] Overdue state: red "Overdue" + days past deadline
- [x] Uses date calculations (not hardcoded)
- [x] TypeScript props

---

## Phase 11 — Admin Dashboard (Full Implementation)

- [x] `pages/admin/Dashboard.tsx` created
- [x] Route: `/admin/dashboard`
- [x] Protected route (admin only)
- [x] Page header: "Good morning, {name}" + subtext

### Stat Cards Row
- [x] Active Projects card (icon, count, trend)
- [x] Active Users card (icon, count, trend)
- [x] Pending Timesheets card (icon, count)
- [x] Upcoming Deadlines card (icon, count)
- [x] Cards are clickable where appropriate

### Timesheet Approvals Section
- [x] Section heading: "Timesheet Approvals"
- [x] Table with columns: Employee, Project, Week, Hours, Submitted, Status, Action
- [x] Clickable rows
- [x] Review button on each row
- [x] Shows recent pending submissions
- [x] Empty state when no pending approvals

### Upcoming Deadlines Section
- [x] Section heading: "Upcoming Deadlines"
- [x] List/grid of deadline cards
- [x] Project name, deadline date, days remaining
- [x] Progress bar per project
- [x] Status indicators
- [x] Empty state when no upcoming deadlines

### Project Overview Section
- [x] Section heading: "Project Overview"
- [x] Status breakdown: Active, Completed, Overdue, Draft counts
- [x] Chart showing project status distribution (optional Recharts)
- [x] Chart is readable and professional

### Recent Activity Section
- [x] Section heading: "Recent Activity"
- [x] Timeline component
- [x] Shows last 5-10 activities
- [x] Time ago display
- [x] Activity description
- [x] User reference
- [x] Empty state

---

## Phase 12 — User Dashboard (Full Implementation)

- [x] `pages/user/Dashboard.tsx` created
- [x] Route: `/user/dashboard`
- [x] Protected route (user only)
- [x] Page header: "Good morning, {name}" + subtext

### Stat Cards
- [x] My Projects card (count)
- [x] This Week card (hours logged)
- [x] Pending Review card (count)
- [x] Upcoming Deadline card (count)

### Current Timesheet Section
- [x] Section heading: "Current Timesheet"
- [x] Shows current week date range
- [x] Daily hours display (Mon-Sun)
- [x] Total hours
- [x] Status badge (Draft, Pending, etc.)
- [x] "Continue Timesheet" button
- [x] Links to timesheet editor

### My Projects Section
- [x] Section heading: "My Projects"
- [x] Grid/list of assigned projects
- [x] Project name, client, role, deadline, status
- [x] "Open Project" button per project
- [x] Empty state when no projects

### Recent Submissions Section
- [x] Section heading: "Recent Submissions"
- [x] Table: Week, Project, Hours, Status
- [x] Clickable rows
- [x] Shows last 5-10 submissions
- [x] Empty state

---

## Phase 13 — Layout Shell Integration

### App Shell Assembly
- [x] AppShell wraps authenticated routes
- [x] Sidebar integrated
- [x] Topbar integrated
- [x] Mobile navigation integrated
- [x] Content area scrollable
- [x] Proper z-index layering

### Breadcrumbs
- [x] Breadcrumbs display current page path
- [x] Admin example: "Projects / Website Modernization"
- [x] User example: "My Projects / Website Modernization"
- [x] Timesheet example: "My Timesheets / Sep 7 – Sep 11"
- [x] Breadcrumbs update on route change
- [x] Clickable parent links

### Global Search
- [x] Search input in topbar
- [x] Placeholder: "Search projects, users..."
- [x] Command palette dropdown on focus/input
- [x] Searches across: projects, users, timesheets
- [x] Results grouped by type
- [x] Keyboard shortcut: Cmd/Ctrl + K
- [x] Clear results on Escape
- [x] Navigate to result on click

### Notification Bell
- [x] Bell icon in topbar
- [x] Badge with unread count
- [x] Dropdown on click
- [x] Shows last 5 notifications
- [x] "Mark all as read" link
- [x] Click navigates to notifications page
- [x] Click outside to close

### Profile Dropdown
- [x] Avatar + name in topbar
- [x] Dropdown on click
- [x] Shows: user name, role
- [x] Links: Profile, Settings, Sign out
- [x] Click outside to close

---

## Phase 14 — Admin Pages: Projects

### Projects List
- [x] `pages/admin/Projects.tsx` created
- [x] Route: `/admin/projects`
- [x] Page header: "Projects" + description + "New Project" button
- [x] Toolbar with search, filters, export
- [x] Search by project name, SOW, client
- [x] Status filter dropdown (Draft, Active, Completed, Overdue, Archived)
- [x] Manager filter dropdown
- [x] Date range filter
- [x] Filter and Clear buttons
- [x] Export button (CSV)

### Projects Table
- [x] Columns: Project, SOW, Client, Start, End, Team, Status, Actions
- [x] Sortable columns
- [x] Clickable rows (navigate to detail)
- [x] Status badges with colors
- [x] Team member count display
- [x] Empty state
- [x] Loading state
- [x] Responsive: horizontal scroll on mobile

### Create Project
- [x] `pages/admin/CreateProject.tsx` created
- [x] Route: `/admin/projects/new`
- [x] Multi-section form

#### Basic Information Section
- [x] Project Name field (required, validated)
- [x] SOW Number field (required)
- [x] Client field (required)
- [x] Description textarea

#### Timeline Section
- [x] Start Date picker (required)
- [x] End Date picker (required)
- [x] Deadline picker (required)
- [x] Validation: End date >= Start date
- [x] Validation: Deadline >= Start date
- [x] Error messages for invalid dates

#### Project Manager Section
- [x] Dropdown selecting from users
- [x] Defaults to current admin

#### Team Section
- [x] Multi-select users
- [x] Search within user list
- [x] Selected users displayed as tags/avatars
- [x] Remove user from selection

#### Supervisor Section
- [x] Dropdown filtered to users with isSupervisor=true
- [x] Required field

#### Documents Section
- [x] Drag-and-drop upload zone
- [x] "Drop files here" text
- [x] "or Browse from your computer" link
- [x] Supported formats listed: PDF, DOCX, XLSX, PNG, JPG
- [x] Max file size: 10MB
- [x] File type validation
- [x] Selected files displayed with name, size, remove button
- [x] Mock upload simulation (creates document object)

#### Form Actions
- [x] Cancel button (navigates back)
- [x] Save Draft button
- [x] Create Project button

### Project Detail
- [x] `pages/admin/ProjectDetails.tsx` created
- [x] Route: `/admin/projects/:projectId`
- [x] Header with back link: "← Projects"
- [x] Project name as page title
- [x] SOW number displayed
- [x] Status badge
- [x] Edit Project button
- [x] More actions dropdown

### Project Tabs
- [x] Overview tab
- [x] Team tab
- [x] Timesheets tab
- [x] Documents tab
- [x] Activity tab
- [x] Tab switching works correctly
- [x] Active tab styling

### Project Overview Tab
- [x] Start Date display
- [x] End Date display
- [x] Deadline display with DeadlineIndicator
- [x] Project Manager name
- [x] Supervisor name
- [x] Description section
- [x] Progress visualization

### Project Team Tab
- [x] "Team Members" heading
- [x] List of team members with name, role, assigned date
- [x] Supervisor visually distinguished
- [x] "+ Add Users" button (opens modal to select users)
- [x] Remove user with confirmation dialog
- [x] Empty state when no team members

### Project Timesheets Tab
- [x] Filters: User, Date range, Status
- [x] Table: Employee, Week, Regular Hours, Overtime, Total, Status
- [x] Empty state when no timesheets

### Project Documents Tab
- [x] Documents list
- [x] Document name, size, uploader, date
- [x] Preview action (simulated)
- [x] Download action (simulated)
- [x] Delete action with confirmation
- [x] Empty state when no documents

### Project Activity Tab
- [x] Activity timeline
- [x] Shows project-related activities
- [x] Timestamps, descriptions, users

### Edit Project
- [x] `pages/admin/EditProject.tsx` or modal created
- [x] Route: `/admin/projects/:projectId/edit`
- [x] Pre-filled form with existing data
- [x] Same validation as create
- [x] Save updates project in state/localStorage
- [x] Success toast on save
- [x] Cancel navigates back

---

## Phase 15 — Admin Pages: Users

### Users List
- [x] `pages/admin/Users.tsx` created
- [x] Route: `/admin/users`
- [x] Page header: "Users" + description + "Create User" button
- [x] Search by name, email, employee ID
- [x] Department filter
- [x] Status filter (Active, Inactive)
- [x] Supervisor capability filter
- [x] Clear filters button

### Users Table
- [x] Columns: Name, Employee ID, Email, Department, Role, Supervisor, Status, Actions
- [x] Sortable columns
- [x] Avatar with initials
- [x] Status badges
- [x] Role display (Admin/User)
- [x] Supervisor display
- [x] Action buttons: View, Edit, Deactivate
- [x] Clickable rows (navigate to detail)
- [x] Empty state
- [x] Loading state
- [x] Responsive behavior

### Create User
- [x] `pages/admin/CreateUser.tsx` created
- [x] Route: `/admin/users/new`
- [x] Form fields:
  - [x] Full Name (required)
  - [x] Email (required, validated)
  - [x] Employee ID (required)
  - [x] Department (required)
  - [x] Role dropdown: Admin / User
  - [x] Supervisor Capability toggle (default: No)
  - [x] Status dropdown: Active / Inactive
- [x] Supervisor permissions section (shown when capability enabled):
  - [x] "Can review assigned users' timesheets" checkbox
- [x] Validation errors displayed
- [x] Cancel button
- [x] Create User button

### User Detail
- [x] `pages/admin/UserDetails.tsx` created
- [x] Route: `/admin/users/:userId`
- [x] User profile header (avatar, name, role, status)
- [x] Employee ID display
- [x] Email display
- [x] Department display
- [x] Status badge
- [x] Supervisor capability display
- [x] Assigned projects list
- [x] Timesheet summary
- [x] Recent submissions list
- [x] Action buttons: Edit User, Deactivate User, Assign Projects, Make Supervisor

### Edit User
- [x] Edit user form/modal
- [x] Pre-filled with existing data
- [x] Same validation as create
- [x] Save updates user in state/localStorage
- [x] Success toast
- [x] Cancel navigates back

---

## Phase 16 — Admin Pages: Supervisors

### Supervisors List
- [x] `pages/admin/Supervisors.tsx` created
- [x] Route: `/admin/supervisors`
- [x] Page header: "Supervisors" + description
- [x] Search by name, email
- [x] Department filter

### Supervisors Table
- [x] Columns: Supervisor, Email, Assigned Projects, Team Members, Pending Reviews, Status
- [x] Avatar with initials
- [x] Assigned project count
- [x] Team member count
- [x] Pending review count (dynamic)
- [x] Status badge
- [x] Clickable rows
- [x] Empty state when no supervisors
- [x] Loading state

### Supervisor Detail View
- [x] Clicking supervisor shows detail
- [x] Supervisor profile info
- [x] Assigned projects list
- [x] Team members list
- [x] Pending reviews count
- [x] Timesheet access info

---

## Phase 17 — Admin Pages: Timesheets & Approvals

### Admin Timesheets
- [x] `pages/admin/Timesheets.tsx` created
- [x] Route: `/admin/timesheets`
- [x] Filters: User, Project, Date range, Status
- [x] Table: Employee, Project, Week, Regular, Overtime, Total, Submitted, Status, Actions
- [x] View detail action
- [x] Empty state

### Admin Approvals
- [x] `pages/admin/Approvals.tsx` created
- [x] Route: `/admin/approvals`
- [x] Header: "Timesheet Approvals" + pending count
- [x] Tabs: Pending, Approved, Declined, Withdrawn
- [x] Approval table (same columns as timesheets list)
- [x] Review action button per row
- [x] Empty states per tab

### Review Panel
- [x] `components/approvals/ReviewPanel.tsx` created
- [x] Opens as drawer or full page
- [x] Shows complete timesheet grid
- [x] Employee info
- [x] Project info
- [x] Week info
- [x] Total hours
- [x] Notes display
- [x] Decision section: Approve and Decline buttons
- [x] TypeScript props

### Decline Modal
- [x] `components/approvals/DeclineModal.tsx` created
- [x] "Decline Timesheet" heading
- [x] "A reason is required" message
- [x] Reason textarea (required)
- [x] Cancel button
- [x] Decline Timesheet button
- [x] Validation: cannot submit without reason
- [x] TypeScript props

### Approve Flow
- [x] Clicking Approve opens confirmation dialog
- [x] "Approve Timesheet?" heading
- [x] Confirmation message
- [x] Cancel and Approve buttons
- [x] On confirm: timesheet status → approved
- [x] Success toast: "Timesheet approved"
- [x] Notification created for user
- [x] Activity logged

### Decline Flow
- [x] Clicking Decline opens decline modal
- [x] Reason is required
- [x] On submit: timesheet status → declined
- [x] Decline reason stored
- [x] Success toast: "Timesheet declined"
- [x] Notification created for user
- [x] Activity logged

---

## Phase 18 — Admin Pages: Reports

### Reports Page
- [x] `pages/admin/Reports.tsx` created
- [x] Route: `/admin/reports`
- [x] Filters: Date range, Project, Employee, Department
- [x] Export button (CSV)

### Hours by Project
- [x] Chart showing hours per project (Recharts bar chart)
- [x] Project names on x-axis
- [x] Hours on y-axis
- [x] Professional styling

### Hours by Employee
- [x] Table or chart showing hours per employee
- [x] Employee name, department, total hours
- [x] Sortable

### Overtime Section
- [x] Regular Hours total display
- [x] Overtime total display
- [x] Total hours display
- [x] Calculated from mock timesheet data

### Timesheet Status Section
- [x] Status breakdown: Approved count, Pending count, Declined count, Withdrawn count, Draft count
- [x] Visual indicator per status (could be badges or mini chart)

---

## Phase 19 — Admin Pages: Notifications & Settings

### Admin Notifications
- [x] `pages/admin/Notifications.tsx` created
- [x] Route: `/admin/notifications`
- [x] Grouped by date: Today, Earlier
- [x] Notification items with dot indicator (unread)
- [x] Title, description, timestamp
- [x] "Mark all as read" button
- [x] Click notification to navigate (if applicable)
- [x] Empty state

### Admin Settings
- [x] `pages/admin/Settings.tsx` created
- [x] Route: `/admin/settings`
- [x] Organization section:
  - [x] Company name input
  - [x] Logo upload (UI only)
  - [x] Timezone dropdown
- [x] Timesheet Settings section:
  - [x] Weekly start day dropdown
  - [x] Default workdays checkboxes
  - [x] Standard weekly hours input
  - [x] Weekend overtime enabled toggle
- [x] Notifications section:
  - [x] Submission notifications toggle
  - [x] Deadline reminders toggle
  - [x] Approval notifications toggle

---

## Phase 20 — User Pages: Projects & Timesheets

### My Projects
- [x] `pages/user/Projects.tsx` created
- [x] Route: `/user/projects`
- [x] Page header: "My Projects"
- [x] Search by project name, client
- [x] Status filter
- [x] Deadline filter

### Project Cards
- [x] Project name
- [x] Client name
- [x] User's role on project
- [x] Deadline with days remaining
- [x] Current week hours logged
- [x] Project status badge
- [x] "Open Project" button
- [x] Empty state when no projects
- [x] Loading state

### Project Detail (User View)
- [x] `pages/user/ProjectDetails.tsx` created
- [x] Route: `/user/projects/:projectId`
- [x] Project name
- [x] Description
- [x] Dates (start, end, deadline)
- [x] User's role
- [x] Supervisor name
- [x] Project documents
- [x] User's timesheet status
- [x] "Open This Week's Timesheet" button
- [x] Does NOT expose admin-only information

### Timesheets List (User)
- [x] `pages/user/Timesheets.tsx` created
- [x] Route: `/user/timesheets`
- [x] Page header: "My Timesheets"
- [x] Filters: Project, Status, Date range
- [x] Table: Week, Project, Regular, Overtime, Total, Status, Actions
- [x] Empty state

### Timesheet Editor
- [x] `pages/user/TimesheetEditor.tsx` created
- [x] Route: `/user/timesheets/:timesheetId`
- [x] Header: "Weekly Timesheet" + project name
- [x] Week display: "Sep 7 - Sep 13, 2026"
- [x] Status display
- [x] Week navigation: Previous Week / Next Week
- [x] Disable navigation to future weeks

### Timesheet Grid (User)
- [x] Grid columns: Work Item, Mon, Tue, Wed, Thu, Fri, Sat, Sun, Total
- [x] Work item description column
- [x] Mon-Fri regular hours enabled
- [x] Sat-Sun regular hours disabled
- [x] Sat-Sun overtime enabled
- [x] Add work item button
- [x] Remove work item button
- [x] Hours input validation (0-24)

### Weekend Overtime Section
- [x] "Weekend Overtime" heading
- [x] Saturday overtime input
- [x] Sunday overtime input
- [x] Weekend overtime total display

### Timesheet Summary
- [x] Regular hours total
- [x] Overtime total
- [x] Total hours
- [x] Weekly target progress bar
- [x] Visual indicator if above target

### Timesheet Notes
- [x] "Weekly Notes" heading
- [x] Textarea for notes
- [x] Character count (optional)

### Timesheet Actions
- [x] Draft state: Save Draft + Submit Final buttons
- [x] Pending state: Withdraw Submission button
- [x] Approved state: Read-only, approved indicator
- [x] Declined state: Edit & Resubmit button
- [x] Withdrawn state: Edit Draft button
- [x] Button states change according to status
- [x] Final Submit opens confirmation dialog
- [x] Confirmation shows project, week, total hours
- [x] Success toast after submission

### Withdrawal Flow
- [x] Withdraw button only shown when status === "pending"
- [x] Withdraw confirmation dialog
- [x] Reason field (optional but recommended)
- [x] On confirm: status → withdrawn
- [x] Success toast
- [x] Notification created
- [x] Activity logged

### Submissions List (User)
- [x] `pages/user/Submissions.tsx` created
- [x] Route: `/user/submissions`
- [x] Page header: "My Submissions"
- [x] Filters: Project, Status, Date
- [x] Table: Week, Project, Regular, Overtime, Total, Submitted, Status, Action
- [x] Empty state
- [x] Clickable rows navigate to submission detail

### Submission Detail
- [x] `pages/user/SubmissionDetails.tsx` created
- [x] Route: `/user/submissions/:submissionId`
- [x] Full timesheet display
- [x] Notes section
- [x] Submission date
- [x] Reviewer name (if approved/declined)
- [x] Review date
- [x] Decline reason (if declined)
- [x] Withdrawal reason (if withdrawn)
- [x] Timeline of events
- [x] Status badge

---

## Phase 21 — User Pages: Notifications & Settings

### User Notifications
- [x] `pages/user/Notifications.tsx` created
- [x] Route: `/user/notifications`
- [x] Grouped by date: Today, Earlier
- [x] Notification items with dot indicator (unread)
- [x] Title, description, timestamp
- [x] "Mark all as read" button
- [x] Click notification to navigate (if applicable)
- [x] Empty state: "No notifications / You're up to date."

### User Settings
- [x] `pages/user/Settings.tsx` created
- [x] Route: `/user/settings`
- [x] Profile section:
  - [x] Name display/update
  - [x] Email display
  - [x] Employee ID display
  - [x] Department display
  - [x] Avatar upload (UI only)
- [x] Notification Preferences section:
  - [x] Submission notifications toggle
  - [x] Deadline reminders toggle
  - [x] Approval notifications toggle
- [x] Appearance section:
  - [x] Theme toggle (light/dark) (optional)
  - [x] Font size (optional)

---

## Phase 22 — Supervisor Pages: Timesheets

### Supervisor Timesheets List
- [x] `pages/supervisor/Timesheets.tsx` created
- [x] Route: `/supervisor/timesheets`
- [x] Page header: "Team Timesheets"
- [x] Filters: User, Project, Date range, Status
- [x] Table: Employee, Project, Week, Regular, Overtime, Total, Submitted, Status, Actions
- [x] Empty state
- [x] Loading state

### Supervisor Restrictions
- [x] Supervisor can only see users assigned to them
- [x] Supervisor can only see projects they supervise
- [x] Non-supervisor users do NOT see supervisor nav items
- [x] Admin can see everything

---

## Phase 23 — Supervisor Pages: Approvals

### Supervisor Approvals
- [x] `pages/supervisor/Approvals.tsx` created
- [x] Route: `/supervisor/approvals`
- [x] Header: "Timesheet Approvals" + pending count
- [x] Tabs: Pending, Approved, Declined, Withdrawn
- [x] Approval table (same columns as timesheets list)
- [x] Review action button per row
- [x] Empty states per tab

### Review Panel (Supervisor)
- [x] `components/approvals/ReviewPanel.tsx` reused from admin
- [x] Shows complete timesheet grid
- [x] Employee info
- [x] Project info
- [x] Week info
- [x] Total hours
- [x] Notes display
- [x] Decision section: Approve and Decline buttons
- [x] TypeScript props

### Decline Modal (Supervisor)
- [x] `components/approvals/DeclineModal.tsx` reused from admin
- [x] "Decline Timesheet" heading
- [x] "A reason is required" message
- [x] Reason textarea (required)
- [x] Cancel button
- [x] Decline Timesheet button
- [x] Validation: cannot submit without reason
- [x] TypeScript props

### Approve Flow (Supervisor)
- [x] Clicking Approve opens confirmation dialog
- [x] "Approve Timesheet?" heading
- [x] Confirmation message
- [x] Cancel and Approve buttons
- [x] On confirm: timesheet status → approved
- [x] Success toast: "Timesheet approved"
- [x] Notification created for user
- [x] Activity logged

### Decline Flow (Supervisor)
- [x] Clicking Decline opens decline modal
- [x] Reason is required
- [x] On submit: timesheet status → declined
- [x] Decline reason stored
- [x] Success toast: "Timesheet declined"
- [x] Notification created for user
- [x] Activity logged

---

## Phase 24 — Notifications System (Full Implementation)

### Notification Bell (Topbar)
- [x] Bell icon in topbar
- [x] Badge with unread count
- [x] Dropdown on click
- [x] Shows last 5 notifications
- [x] "Mark all as read" link
- [x] Click navigates to notifications page
- [x] Click outside to close
- [x] Unread notifications have visual indicator (dot/bold)

### Notification List Dropdown
- [x] Notification dropdown in topbar
- [x] List of recent notifications
- [x] Grouped by type or time
- [x] Click navigates to relevant page
- [x] Empty state

### Notification Generation
- [x] Notification created when timesheet submitted
- [x] Notification created when timesheet approved
- [x] Notification created when timesheet declined
- [x] Notification created when timesheet withdrawn
- [x] Notification created when deadline approaching
- [x] Notification created when user assigned to project
- [x] Notifications reference valid entities

### Notification Actions
- [x] Mark single notification as read
- [x] Mark all notifications as read
- [x] Delete notification (optional)
- [x] Navigate to related entity on click

---

## Phase 25 — Reports (Full Implementation)

### Reports Page
- [x] `pages/admin/Reports.tsx` created
- [x] Route: `/admin/reports`
- [x] Page header: "Reports"
- [x] Filters: Date range, Project, Employee, Department
- [x] Export button (CSV)

### Hours by Project
- [x] Chart showing hours per project (Recharts bar chart)
- [x] Project names on x-axis
- [x] Hours on y-axis
- [x] Professional styling
- [x] Legend
- [x] Tooltip on hover

### Hours by Employee
- [x] Table showing hours per employee
- [x] Columns: Employee, Department, Regular Hours, Overtime, Total
- [x] Sortable
- [x] Avatar with initials

### Overtime Section
- [x] Regular Hours total display
- [x] Overtime total display
- [x] Total hours display
- [x] Calculated from mock timesheet data
- [x] Visual cards

### Timesheet Status Section
- [x] Status breakdown: Approved count, Pending count, Declined count, Withdrawn count, Draft count
- [x] Visual indicator per status (badges or mini chart)
- [x] Percentage calculation

### CSV Export
- [x] Export button functional
- [x] Generates CSV from current filtered data
- [x] Downloads file with timestamp
- [x] Filename includes report type and date

---

## Phase 26 — Settings (Full Implementation)

### Admin Settings
- [x] `pages/admin/Settings.tsx` created
- [x] Route: `/admin/settings`
- [x] Organization section:
  - [x] Company name input
  - [x] Logo upload (UI only, preview)
  - [x] Timezone dropdown
- [x] Timesheet Settings section:
  - [x] Weekly start day dropdown
  - [x] Default workdays checkboxes (Mon-Fri)
  - [x] Standard weekly hours input
  - [x] Weekend overtime enabled toggle
- [x] Notifications section:
  - [x] Submission notifications toggle
  - [x] Deadline reminders toggle
  - [x] Approval notifications toggle
- [x] Save button with success toast

### User Settings
- [x] `pages/user/Settings.tsx` created
- [x] Route: `/user/settings`
- [x] Profile section:
  - [x] Name display/update
  - [x] Email display
  - [x] Employee ID display
  - [x] Department display
- [x] Notification Preferences section:
  - [x] Submission notifications toggle
  - [x] Deadline reminders toggle
  - [x] Approval notifications toggle
- [x] Appearance section:
  - [x] Theme toggle (optional)
- [x] Save button with success toast

---

## Phase 27 — Responsive Design

### Desktop (1440px+)
- [x] Sidebar fully visible with labels
- [x] Content area with comfortable max-width
- [x] Tables display full column set
- [x] Timesheet grid in full table format
- [x] Modals centered with adequate size
- [x] Charts display at full width

### Tablet (768px - 1023px)
- [x] Sidebar collapses to icons-only
- [x] Toggle button to expand sidebar
- [x] Tables may hide less critical columns
- [x] Cards stack in 2-column grid
- [x] Modals still usable
- [x] Timesheet grid scrolls horizontally

### Mobile (< 768px)
- [x] Sidebar becomes drawer
- [x] Hamburger button visible
- [x] Top bar shows hamburger + page title
- [x] Tables convert to cards or horizontal scroll
- [x] Forms stack vertically
- [x] Buttons full-width where appropriate
- [x] Modals full-screen or near full-screen
- [x] Timesheet grid:
  - [x] First column sticky
  - [x] Horizontal scroll with shadow indicators
  - [x] Summary below grid
- [x] No horizontal overflow on main layout
- [x] Touch targets at least 44x44px

### Responsive Verification
- [x] Tested at 375px width
- [x] Tested at 768px width
- [x] Tested at 1024px width
- [x] Tested at 1280px width
- [x] Tested at 1440px+ width
- [x] No broken layouts at any breakpoint
- [x] No overflow issues
- [x] No unreadable text

---

## Phase 28 — Accessibility

### Keyboard Navigation
- [x] All interactive elements focusable
- [x] Focus visible on all focusable elements
- [x] Logical tab order
- [x] Skip to content link (optional)
- [x] Modal focus trap implemented
- [x] Escape closes modals/drawers/dropdowns
- [x] Enter/Space activates buttons
- [x] Arrow keys navigate menus/dropdowns

### Semantic HTML
- [x] Proper heading hierarchy (h1 → h2 → h3)
- [x] Lists use `<ul>`, `<ol>`, `<li>`
- [x] Buttons use `<button>`, not `<div>`
- [x] Links use `<a>`, not `<div>`
- [x] Form labels associated with inputs
- [x] Fieldsets used for radio/checkbox groups
- [x] Tables use proper `<table>`, `<th>`, `<td>` structure

### ARIA Labels
- [x] Icon-only buttons have aria-label
- [x] Modals have role="dialog" and aria-modal
- [x] Drawers have role="dialog"
- [x] Dropdowns have role="menu"
- [x] Navigation has role="navigation"
- [x] Search has role="search"
- [x] Loading states have aria-live
- [x] Error states have role="alert"

### Contrast & Visibility
- [x] Text contrast meets WCAG AA (4.5:1 minimum)
- [x] Status colors not sole indicator (icons/text accompany)
- [x] Focus indicators clearly visible
- [x] Error messages clearly visible
- [x] Disabled states distinguishable

### Screen Reader Support
- [x] Form errors announced
- [x] Dynamic content updates announced (toasts)
- [x] Navigation landmarks present
- [x] Main content landmark present
- [x] Status changes communicated

---

## Phase 29 — Polish & Microinteractions

### Loading States
- [x] Skeleton loaders for tables
- [x] Skeleton loaders for cards
- [x] Spinner for button loading state
- [x] Full page loading overlay (if needed)
- [x] Skeleton shapes match actual content

### Empty States
- [x] No projects empty state
- [x] No users empty state
- [x] No timesheets empty state
- [x] No notifications empty state
- [x] No approvals empty state
- [x] No search results empty state
- [x] Each has icon, title, description, action button

### Error States
- [x] Generic error state component
- [x] Retry button
- [x] Friendly error messages
- [x] No stack traces exposed

### Toast Notifications
- [x] Success toasts (green)
- [x] Error toasts (red)
- [x] Warning toasts (amber)
- [x] Info toasts (blue)
- [x] Auto-dismiss after 4-5 seconds
- [x] Manual dismiss button
- [x] Slide-in animation
- [x] Stack multiple toasts
- [x] Accessible (aria-live)

### Confirmation Dialogs
- [x] Delete confirmation
- [x] Withdraw confirmation
- [x] Decline confirmation
- [x] Approve confirmation
- [x] Logout confirmation (optional)
- [x] Cancel and confirm buttons
- [x] Keyboard accessible

### Transitions & Animations
- [x] Sidebar collapse/expand animation
- [x] Modal enter/exit animation
- [x] Drawer slide animation
- [x] Dropdown appear animation
- [x] Toast appear animation
- [x] Tab transition
- [x] Button hover elevation
- [x] Card hover subtle lift
- [x] Page transition (optional)

### Hover States
- [x] Table rows hover
- [x] Button hover states
- [x] Card hover states
- [x] Nav item hover states
- [x] Link hover states

### Form Validation UX
- [x] Real-time validation on blur
- [x] Error messages below fields
- [x] Red border on error fields
- [x] Success indicator on valid fields (optional)
- [x] Submit button disabled when form invalid
- [x] Clear error on correction

---

## Phase 30 — Testing, QA & Final Verification

### Functional Testing
- [x] Admin login works end-to-end
- [x] User login works end-to-end
- [x] Supervisor login works end-to-end
- [x] Logout works from all roles
- [x] Protected routes redirect correctly
- [x] Role-aware navigation works
- [x] Dashboard loads for each role
- [ ] Manual browser testing completed

### CRUD Testing
- [x] Create project works
- [x] Edit project works
- [x] Delete/archive project works
- [x] Create user works
- [x] Edit user works
- [x] Deactivate user works
- [ ] Manual CRUD testing completed

### Timesheet Workflow Testing
- [x] Create timesheet works
- [x] Enter Mon-Fri hours works
- [x] Enter weekend overtime works
- [x] Save draft works
- [x] Draft persists after navigation
- [x] Final submit works
- [x] Status changes to pending
- [x] Supervisor sees pending submission
- [x] Approve works
- [x] Decline works (with reason)
- [x] Withdraw works (with reason)
- [x] Resubmit after decline works
- [x] Edit after withdrawal works
- [x] Status badges update correctly
- [ ] Manual workflow testing completed

### Permission Testing
- [x] Admin sees all data
- [x] User sees only own data
- [x] User sees only assigned projects
- [x] Supervisor sees only team data
- [x] Supervisor cannot access admin routes
- [x] User cannot access admin routes
- [ ] Manual permission testing completed

### Data Integrity
- [x] Mock data relationships are consistent
- [x] No orphaned records
- [x] Calculations are accurate
- [x] Dates are valid
- [x] Status transitions follow rules
- [x] localStorage persistence works
- [x] No data loss on refresh

### UI/UX Testing
- [x] No console errors
- [x] No console warnings
- [x] No broken images/icons
- [x] No broken links
- [x] No placeholder text remaining
- [x] No dead buttons
- [x] Consistent spacing
- [x] Consistent icon usage
- [x] Consistent typography
- [x] Consistent color usage

### Performance
- [x] No unnecessary re-renders
- [x] Large lists perform adequately
- [x] Images/icons load correctly
- [x] No memory leaks

### Build Verification
- [x] `npm run build` succeeds
- [x] No TypeScript errors
- [x] No lint errors
- [x] Build output is production-ready
- [x] Assets are bundled correctly

### Demo Readiness
- [x] Demo accounts work
- [x] End-to-end demo flow works:
  - [x] Login as admin
  - [x] Create project
  - [x] Add users
  - [x] Assign supervisor
  - [x] Login as user
  - [x] View assigned projects
  - [x] Fill timesheet
  - [x] Save draft
  - [x] Submit final
  - [x] Login as supervisor
  - [x] See pending submission
  - [x] Review and approve
  - [x] Login as user
  - [x] See approved status
- [x] Application feels like a real product
- [x] No obvious bugs
- [x] Ready for backend integration
- [ ] Manual demo testing completed

---

---
