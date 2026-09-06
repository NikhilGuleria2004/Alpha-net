import type { Timesheet, TimesheetEntry } from '../types/timesheet'

function makeEntry(id: string, description: string, entryType: TimesheetEntry['entryType'], hours: Partial<Record<string, number>>): TimesheetEntry {
  const fullHours = {
    mon: 0,
    tue: 0,
    wed: 0,
    thu: 0,
    fri: 0,
    sat: 0,
    sun: 0,
    ...hours,
  }
  return { id, description, entryType, hours: fullHours }
}

function calcTotals(entries: TimesheetEntry[]) {
  let regularHours = 0
  let overtimeHours = 0
  for (const entry of entries) {
    if (entry.entryType === 'regular') {
      regularHours += entry.hours.mon + entry.hours.tue + entry.hours.wed + entry.hours.thu + entry.hours.fri
    } else {
      overtimeHours += entry.hours.sat + entry.hours.sun
    }
  }
  return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
}

function review(reviewedBy: string, at: string, reason?: string) {
  return { reviewedBy, reviewedAt: at, reason }
}

export const timesheets: Timesheet[] = [
  // John Smith - project-1
  {
    id: 'timesheet-1',
    userId: 'user-1',
    projectId: 'project-1',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-1a', 'Frontend development', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
      makeEntry('entry-1b', 'Code review', 'regular', { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 }),
    ],
    notes: 'Completed homepage redesign and component library updates.',
    ...calcTotals([
      makeEntry('entry-1a', 'Frontend development', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
      makeEntry('entry-1b', 'Code review', 'regular', { mon: 1, tue: 1, wed: 1, thu: 1, fri: 1 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-2', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-2',
    userId: 'user-1',
    projectId: 'project-1',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-2a', 'API integration', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-2b', 'Bug fixes', 'regular', { mon: 1, tue: 0, wed: 1, thu: 0, fri: 2 }),
      makeEntry('entry-2c', 'Weekend deployment', 'overtime', { sat: 4 }),
    ],
    notes: 'Completed API integration and supported deployment over the weekend.',
    ...calcTotals([
      makeEntry('entry-2a', 'API integration', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-2b', 'Bug fixes', 'regular', { mon: 1, tue: 0, wed: 1, thu: 0, fri: 2 }),
      makeEntry('entry-2c', 'Weekend deployment', 'overtime', { sat: 4 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-2', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-3',
    userId: 'user-1',
    projectId: 'project-7',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-3a', 'Security patches', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-3b', 'Testing', 'regular', { mon: 0, tue: 0, wed: 0, thu: 0, fri: 5 }),
    ],
    notes: 'Applied security patches and completed regression testing.',
    ...calcTotals([
      makeEntry('entry-3a', 'Security patches', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-3b', 'Testing', 'regular', { mon: 0, tue: 0, wed: 0, thu: 0, fri: 5 }),
    ]),
    status: 'pending',
    submittedAt: '2026-08-21T16:30:00Z',
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-21T16:30:00Z',
  },
  {
    id: 'timesheet-4',
    userId: 'user-1',
    projectId: 'project-1',
    weekStart: '2026-08-24',
    entries: [
      makeEntry('entry-4a', 'UI polish', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
    ],
    notes: 'Working on UI polish and responsive fixes.',
    ...calcTotals([
      makeEntry('entry-4a', 'UI polish', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
    ]),
    status: 'draft',
    createdAt: '2026-08-24T09:00:00Z',
    updatedAt: '2026-08-24T09:00:00Z',
  },
  {
    id: 'timesheet-5',
    userId: 'user-1',
    projectId: 'project-7',
    weekStart: '2026-08-31',
    entries: [
      makeEntry('entry-5a', 'Auth module', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-5b', 'Documentation', 'regular', { mon: 0, tue: 0, wed: 0, thu: 0, fri: 4 }),
    ],
    notes: 'Implemented authentication module.',
    ...calcTotals([
      makeEntry('entry-5a', 'Auth module', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-5b', 'Documentation', 'regular', { mon: 0, tue: 0, wed: 0, thu: 0, fri: 4 }),
    ]),
    status: 'declined',
    submittedAt: '2026-09-04T08:00:00Z',
    review: review('user-2', '2026-09-04T10:00:00Z', 'Thursday hours do not align with sprint log. Please correct and resubmit.'),
    createdAt: '2026-08-31T09:00:00Z',
    updatedAt: '2026-09-04T10:00:00Z',
  },

  // Priya Sharma - project-1
  {
    id: 'timesheet-6',
    userId: 'user-4',
    projectId: 'project-1',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-6a', 'Design system', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Built design tokens and component library.',
    ...calcTotals([
      makeEntry('entry-6a', 'Design system', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-2', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-7',
    userId: 'user-4',
    projectId: 'project-1',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-7a', 'Iconography', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Created icon set and updated brand guidelines.',
    ...calcTotals([
      makeEntry('entry-7a', 'Iconography', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-2', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-8',
    userId: 'user-4',
    projectId: 'project-5',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-8a', 'CRM UX', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-8b', 'Weekend review', 'overtime', { sat: 4 }),
    ],
    notes: 'Completed CRM onboarding flows.',
    ...calcTotals([
      makeEntry('entry-8a', 'CRM UX', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-8b', 'Weekend review', 'overtime', { sat: 4 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-21T17:00:00Z',
    review: review('user-2', '2026-08-22T09:00:00Z'),
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-22T09:00:00Z',
  },
  {
    id: 'timesheet-9',
    userId: 'user-4',
    projectId: 'project-1',
    weekStart: '2026-08-24',
    entries: [
      makeEntry('entry-9a', 'Prototypes', 'regular', { mon: 8, tue: 8, wed: 8, thu: 6, fri: 0 }),
    ],
    notes: 'Built interactive prototypes for stakeholder review.',
    ...calcTotals([
      makeEntry('entry-9a', 'Prototypes', 'regular', { mon: 8, tue: 8, wed: 8, thu: 6, fri: 0 }),
    ]),
    status: 'withdrawn',
    submittedAt: '2026-08-28T16:00:00Z',
    review: review('user-2', '2026-08-28T16:30:00Z', 'Withdrawn by user to update estimates.'),
    createdAt: '2026-08-24T09:00:00Z',
    updatedAt: '2026-08-28T16:30:00Z',
  },
  {
    id: 'timesheet-10',
    userId: 'user-4',
    projectId: 'project-1',
    weekStart: '2026-08-31',
    entries: [
      makeEntry('entry-10a', 'Design review', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-10b', 'Weekend assets', 'overtime', { sat: 2 }),
    ],
    notes: 'Finalized designs and exported assets.',
    ...calcTotals([
      makeEntry('entry-10a', 'Design review', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-10b', 'Weekend assets', 'overtime', { sat: 2 }),
    ]),
    status: 'pending',
    submittedAt: '2026-09-04T08:30:00Z',
    createdAt: '2026-08-31T09:00:00Z',
    updatedAt: '2026-09-04T08:30:00Z',
  },

  // David Lee - project-1
  {
    id: 'timesheet-11',
    userId: 'user-5',
    projectId: 'project-1',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-11a', 'Backend APIs', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Built REST endpoints for content management.',
    ...calcTotals([
      makeEntry('entry-11a', 'Backend APIs', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-2', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-12',
    userId: 'user-5',
    projectId: 'project-6',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-12a', 'E-commerce backend', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-12b', 'Weekend hotfix', 'overtime', { sat: 4, sun: 2 }),
    ],
    notes: 'Implemented payment gateway and fixed checkout issues.',
    ...calcTotals([
      makeEntry('entry-12a', 'E-commerce backend', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-12b', 'Weekend hotfix', 'overtime', { sat: 4, sun: 2 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-3', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-13',
    userId: 'user-5',
    projectId: 'project-6',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-13a', 'Inventory sync', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
    ],
    notes: 'Worked on inventory synchronization module.',
    ...calcTotals([
      makeEntry('entry-13a', 'Inventory sync', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
    ]),
    status: 'pending',
    submittedAt: '2026-08-21T17:00:00Z',
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-21T17:00:00Z',
  },
  {
    id: 'timesheet-14',
    userId: 'user-5',
    projectId: 'project-1',
    weekStart: '2026-08-24',
    entries: [],
    notes: '',
    ...calcTotals([]),
    status: 'draft',
    createdAt: '2026-08-24T09:00:00Z',
    updatedAt: '2026-08-24T09:00:00Z',
  },

  // Emily Davis - project-2
  {
    id: 'timesheet-15',
    userId: 'user-6',
    projectId: 'project-2',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-15a', 'Marketing pages', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Launched landing page and campaign assets.',
    ...calcTotals([
      makeEntry('entry-15a', 'Marketing pages', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-3', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-16',
    userId: 'user-6',
    projectId: 'project-2',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-16a', 'Campaign analytics', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-16b', 'Weekend reporting', 'overtime', { sat: 4 }),
    ],
    notes: 'Analyzed campaign performance and prepared reports.',
    ...calcTotals([
      makeEntry('entry-16a', 'Campaign analytics', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-16b', 'Weekend reporting', 'overtime', { sat: 4 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-3', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-17',
    userId: 'user-6',
    projectId: 'project-2',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-17a', 'A/B testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
    ],
    notes: 'Ran A/B tests for onboarding funnel.',
    ...calcTotals([
      makeEntry('entry-17a', 'A/B testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
    ]),
    status: 'pending',
    submittedAt: '2026-08-21T17:00:00Z',
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-21T17:00:00Z',
  },

  // Raj Patel - project-2
  {
    id: 'timesheet-18',
    userId: 'user-7',
    projectId: 'project-2',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-18a', 'Mobile UI', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Completed mobile UI screens.',
    ...calcTotals([
      makeEntry('entry-18a', 'Mobile UI', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-3', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-19',
    userId: 'user-7',
    projectId: 'project-4',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-19a', 'Cloud research', 'regular', { mon: 8, tue: 8, wed: 4, thu: 0, fri: 0 }),
    ],
    notes: 'Researching cloud providers and migration paths.',
    ...calcTotals([
      makeEntry('entry-19a', 'Cloud research', 'regular', { mon: 8, tue: 8, wed: 4, thu: 0, fri: 0 }),
    ]),
    status: 'draft',
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-10T09:00:00Z',
  },
  {
    id: 'timesheet-20',
    userId: 'user-7',
    projectId: 'project-2',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-20a', 'Push notifications', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 2 }),
    ],
    notes: 'Integrated push notification service.',
    ...calcTotals([
      makeEntry('entry-20a', 'Push notifications', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 2 }),
    ]),
    status: 'declined',
    submittedAt: '2026-08-21T17:00:00Z',
    review: review('user-3', '2026-08-22T09:00:00Z', 'Friday hours missing context. Please add notes and resubmit.'),
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-22T09:00:00Z',
  },

  // Tom Wilson - project-2 / project-6
  {
    id: 'timesheet-21',
    userId: 'user-9',
    projectId: 'project-2',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-21a', 'Sales enablement', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Prepared sales collateral and demo scripts.',
    ...calcTotals([
      makeEntry('entry-21a', 'Sales enablement', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-3', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-22',
    userId: 'user-9',
    projectId: 'project-6',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-22a', 'Checkout flow', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-22b', 'Weekend migration', 'overtime', { sat: 6, sun: 2 }),
    ],
    notes: 'Redesigned checkout and migrated payment configs.',
    ...calcTotals([
      makeEntry('entry-22a', 'Checkout flow', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 3 }),
      makeEntry('entry-22b', 'Weekend migration', 'overtime', { sat: 6, sun: 2 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-3', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-23',
    userId: 'user-9',
    projectId: 'project-2',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-23a', 'Partner onboarding', 'regular', { mon: 8, tue: 8, wed: 8, thu: 4, fri: 0 }),
      makeEntry('entry-23b', 'Weekend training', 'overtime', { sat: 4 }),
    ],
    notes: 'Onboarded two channel partners.',
    ...calcTotals([
      makeEntry('entry-23a', 'Partner onboarding', 'regular', { mon: 8, tue: 8, wed: 8, thu: 4, fri: 0 }),
      makeEntry('entry-23b', 'Weekend training', 'overtime', { sat: 4 }),
    ]),
    status: 'withdrawn',
    submittedAt: '2026-08-21T16:00:00Z',
    review: review('user-3', '2026-08-21T16:30:00Z', 'Withdrawn to reallocate hours to correct project.'),
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-21T16:30:00Z',
  },

  // Jessica Martinez - project-3 / project-7
  {
    id: 'timesheet-24',
    userId: 'user-10',
    projectId: 'project-3',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-24a', 'QA testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Executed regression suite for dashboard release.',
    ...calcTotals([
      makeEntry('entry-24a', 'QA testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-2', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-25',
    userId: 'user-10',
    projectId: 'project-7',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-25a', 'Penetration testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-25b', 'Weekend scan', 'overtime', { sat: 2 }),
    ],
    notes: 'Ran security scans and documented findings.',
    ...calcTotals([
      makeEntry('entry-25a', 'Penetration testing', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 4 }),
      makeEntry('entry-25b', 'Weekend scan', 'overtime', { sat: 2 }),
    ]),
    status: 'pending',
    submittedAt: '2026-08-14T17:00:00Z',
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-14T17:00:00Z',
  },
  {
    id: 'timesheet-26',
    userId: 'user-10',
    projectId: 'project-3',
    weekStart: '2026-08-17',
    entries: [],
    notes: '',
    ...calcTotals([]),
    status: 'draft',
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-17T09:00:00Z',
  },

  // Kevin Chen - project-3 / project-7
  {
    id: 'timesheet-27',
    userId: 'user-11',
    projectId: 'project-3',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-27a', 'Data pipeline', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Built ETL pipeline for analytics dashboard.',
    ...calcTotals([
      makeEntry('entry-27a', 'Data pipeline', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-2', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
  {
    id: 'timesheet-28',
    userId: 'user-11',
    projectId: 'project-7',
    weekStart: '2026-08-10',
    entries: [
      makeEntry('entry-28a', 'Vulnerability fixes', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-28b', 'Weekend patch', 'overtime', { sat: 4 }),
    ],
    notes: 'Patched critical vulnerabilities.',
    ...calcTotals([
      makeEntry('entry-28a', 'Vulnerability fixes', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 6 }),
      makeEntry('entry-28b', 'Weekend patch', 'overtime', { sat: 4 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-14T17:00:00Z',
    review: review('user-2', '2026-08-15T10:00:00Z'),
    createdAt: '2026-08-10T09:00:00Z',
    updatedAt: '2026-08-15T10:00:00Z',
  },
  {
    id: 'timesheet-29',
    userId: 'user-11',
    projectId: 'project-3',
    weekStart: '2026-08-17',
    entries: [
      makeEntry('entry-29a', 'Dashboard widgets', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
      makeEntry('entry-29b', 'Weekend cleanup', 'overtime', { sun: 6 }),
    ],
    notes: 'Built new dashboard widgets and cleaned up legacy queries.',
    ...calcTotals([
      makeEntry('entry-29a', 'Dashboard widgets', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 0 }),
      makeEntry('entry-29b', 'Weekend cleanup', 'overtime', { sun: 6 }),
    ]),
    status: 'pending',
    submittedAt: '2026-08-21T17:00:00Z',
    createdAt: '2026-08-17T09:00:00Z',
    updatedAt: '2026-08-21T17:00:00Z',
  },

  // Lisa Wang - project-2 (inactive)
  {
    id: 'timesheet-30',
    userId: 'user-8',
    projectId: 'project-2',
    weekStart: '2026-08-03',
    entries: [
      makeEntry('entry-30a', 'Visual design', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ],
    notes: 'Created visual design concepts.',
    ...calcTotals([
      makeEntry('entry-30a', 'Visual design', 'regular', { mon: 8, tue: 8, wed: 8, thu: 8, fri: 8 }),
    ]),
    status: 'approved',
    submittedAt: '2026-08-07T17:00:00Z',
    review: review('user-3', '2026-08-08T09:00:00Z'),
    createdAt: '2026-08-03T09:00:00Z',
    updatedAt: '2026-08-08T09:00:00Z',
  },
]
