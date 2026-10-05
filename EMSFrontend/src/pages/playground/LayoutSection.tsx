import { useState } from 'react'
import { Section, Row } from './kit'
import { TimelineRail, type TimelineItem } from '../../components/ems/TimelineRail'
import { AttendanceHeatmap, type HeatmapDay } from '../../components/ems/AttendanceHeatmap'
import { Board } from '../../components/ems/Board'
import { WidgetGrid } from '../../components/ems/WidgetGrid'
import { EmsCard, CollapsiblePanel } from '../../components/ems/EmsCard'
import { CollapsibleCard } from '../../components/ems/CollapsibleCard'
import { Progress } from '../../components/ui/Progress'
import { Tabs } from '../../components/ui/Tabs'
import { MOCK_ACTIVITY } from '../../mocks/fixtures2'
import type { AttendanceStatus } from '../../types/attendance'

const TIMELINE_ITEMS: TimelineItem[] = MOCK_ACTIVITY.map((a) => ({
  id: a.id,
  title: a.description,
  timestamp: a.createdAt,
  actor: a.actorName,
  tone: a.kind === 'payrate' ? 'info' : a.kind === 'assignment' ? 'success' : 'default',
}))

const HEATMAP_STATUSES: AttendanceStatus[] = ['present', 'remote', 'late', 'absent', 'on_leave', 'holiday', 'weekend', 'half_day']
const HEATMAP_DAYS: HeatmapDay[] = Array.from({ length: 84 }, (_, i) => ({
  date: `2026-0${7 + Math.floor(i / 31)}-${String((i % 31) + 1).padStart(2, '0')}`,
  status: HEATMAP_STATUSES[i % HEATMAP_STATUSES.length]!,
  value: (i * 7) % 9,
}))

type Candidate = { id: string; name: string }

const INITIAL_BOARD: Record<string, Candidate[]> = {
  invited: [
    { id: 'c1', name: 'Riya Sharma' },
    { id: 'c2', name: 'Tom Becker' },
  ],
  screening: [{ id: 'c3', name: 'Anil Kumar' }],
  offer: [{ id: 'c4', name: 'Zoe Chen' }],
}

const BOARD_KEYS = ['invited', 'screening', 'offer'] as const
const BOARD_TITLES: Record<string, string> = { invited: 'Invited', screening: 'Screening', offer: 'Offer' }

/** Timelines, boards, heatmap and dashboard cards. */
export function LayoutSection() {
  const [board, setBoard] = useState(INITIAL_BOARD)

  return (
    <Section id="layout" title="Timelines, boards & cards" description="Kanban (drag + keyboard move), activity rail, heatmap and widget grid.">
      <Row label="Tabs">
        <div className="w-full">
          <Tabs
            tabs={[
              { id: 'profile', label: 'Profile', content: <p className="p-2 text-sm text-muted-foreground">Profile content.</p> },
              { id: 'attendance', label: 'Attendance', content: <p className="p-2 text-sm text-muted-foreground">Attendance history.</p> },
              { id: 'payroll', label: 'Payroll', content: <p className="p-2 text-sm text-muted-foreground">Payroll records.</p> },
              { id: 'docs', label: 'Documents', content: <p className="p-2 text-sm text-muted-foreground">Documents.</p>, disabled: true },
            ]}
          />
        </div>
      </Row>
      <Row label="Progress">
        <div className="grid w-full gap-2">
          <Progress value={72} label="Onboarding completion" showValue />
          <Progress value={94} variant="success" />
          <Progress value={45} variant="warning" />
          <Progress value={12} variant="danger" />
          <Progress value={66} variant="info" />
        </div>
      </Row>
      <Row label="Timeline rail">
        <div className="w-full">
          <TimelineRail items={TIMELINE_ITEMS} />
        </div>
      </Row>
      <Row label="Attendance heatmap (12 weeks, keyboard operable)">
        <div className="w-full">
          <AttendanceHeatmap days={HEATMAP_DAYS} />
        </div>
      </Row>
      <Row label="Kanban board (drag + keyboard move)">
        <div className="w-full">
          <Board
            ariaLabel="Onboarding pipeline"
            columns={BOARD_KEYS.map((key) => ({
              key,
              title: BOARD_TITLES[key]!,
              items: board[key] ?? [],
              renderItem: (c: Candidate) => (
                <div className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm">{c.name}</div>
              ),
              emptyText: 'Drop candidates here',
            }))}
            moveTargets={[...BOARD_KEYS]}
            getItemId={(c) => c.id}
            onMove={(item, toColumn) =>
              setBoard((prev) => {
                const next: Record<string, Candidate[]> = {}
                for (const key of Object.keys(prev)) next[key] = (prev[key] ?? []).filter((c) => c.id !== item.id)
                next[toColumn] = [...(next[toColumn] ?? []), item]
                return next
              })
            }
          />
        </div>
      </Row>
      <Row label="Cards & widget grid">
        <div className="w-full">
          <WidgetGrid columns={3}>
            <EmsCard title="Team pulse" subtitle="This week">
              <p className="text-sm text-muted-foreground">Card body with title-case header (§8.2).</p>
            </EmsCard>
            <CollapsibleCard title="Collapsible" badge="3">
              <p className="text-sm text-muted-foreground">Toggle-able body with count badge.</p>
            </CollapsibleCard>
            <CollapsiblePanel title="Panel" subtitle="Default open">
              <p className="text-sm text-muted-foreground">EmsCard variant with collapse action.</p>
            </CollapsiblePanel>
          </WidgetGrid>
        </div>
      </Row>
    </Section>
  )
}
