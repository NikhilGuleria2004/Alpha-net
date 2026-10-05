import { Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { Section, Row } from './playground/kit'
import { BadgesSection } from './playground/BadgesSection'
import { FormsSection } from './playground/FormsSection'
import { DataSection } from './playground/DataSection'
import { LayoutSection } from './playground/LayoutSection'
import { FeedbackSection } from './playground/FeedbackSection'
import { OverlaySection } from './playground/OverlaySection'
import { Button } from '../components/ui/Button'
import { StatusRail } from '../components/ems/StatusRail'
import { KpiStrip } from '../components/ems/KpiStrip'
import { KpiStat } from '../components/ems/KpiStat'
import { Sparkline } from '../components/ems/Sparkline'
import { StatDelta } from '../components/ems/StatDelta'
import { DensityToggle } from '../components/ems/DensityToggle'
import { ThemeToggle } from '../components/ui/ThemeToggle'

const SECTIONS = [
  ['actions', 'Actions'],
  ['kpis', 'KPIs'],
  ['badges', 'Badges'],
  ['forms', 'Forms'],
  ['data', 'Data'],
  ['layout', 'Boards'],
  ['feedback', 'Feedback'],
  ['overlays', 'Overlays'],
] as const

/**
 * Phase 1 dev component playground (`/dev/components`, DEV-only).
 * Renders every primitive in every state; themes (light/dark/black) and both
 * densities are switchable from the sticky header.
 */
export function DesignSystemPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6">
        <Link
          to="/"
          className="inline-flex min-h-[32px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Home
        </Link>
        <span className="ems-overline text-muted-foreground">Phase 1 · Design system playground</span>
        <span className="ml-auto flex items-center gap-2">
          <DensityToggle />
          <ThemeToggle />
        </span>
      </header>

      <nav aria-label="Playground sections" className="flex flex-wrap gap-1.5">
        {SECTIONS.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {label}
          </a>
        ))}
      </nav>

      <Section id="actions" title="Buttons & deltas" description="Every variant/size/state; StatDelta flips colour when `invert` is set.">
        <Row label="Variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="pill">Pill</Button>
          <Button variant="icon" aria-label="Notifications">
            <Plus className="h-4 w-4" />
          </Button>
        </Row>
        <Row label="Sizes / states">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button loading>Saving…</Button>
          <Button disabled>Disabled</Button>
          <Button leftIcon={<Trash2 className="h-4 w-4" />} variant="danger">
            Delete
          </Button>
        </Row>
        <Row label="StatDelta">
          <StatDelta value={4.2} unit="%" label="vs Aug" />
          <StatDelta value={-1.5} unit="%" label="WoW" />
          <StatDelta value={-0.8} unit="pt" label="MoM" invert />
          <StatDelta value={0} unit="%" label="flat" />
        </Row>
      </Section>

      <Section id="kpis" title="Status rail & KPI strip" description="§4.3 layout grammar: rail → KPI band → widgets.">
        <StatusRail
          items={[
            { label: 'Headcount', value: 128 },
            { label: 'Present today', value: '112', tone: 'success' },
            { label: 'On leave', value: 6, tone: 'warning' },
            { label: 'Unmarked', value: 3, tone: 'danger' },
            { label: 'Open seats', value: 9, tone: 'info' },
          ]}
        />
        <KpiStrip>
          <KpiStat
            label="Headcount"
            value="128"
            delta={{ value: 4, unit: '%', label: 'vs Aug' }}
            sparkline={<Sparkline data={[4, 6, 5, 8, 9, 11, 12]} />}
          />
          <KpiStat label="Attendance" value="94.2%" delta={{ value: 1.1, unit: '%', label: 'WoW' }} />
          <KpiStat label="Utilization" value="81%" hint="billable FTE" />
          <KpiStat label="Payroll MTD" value="$412k" hint="vs $398k budget" />
          <KpiStat label="Margin" value="38%" delta={{ value: -0.8, unit: 'pt', label: 'MoM', invert: true }} />
        </KpiStrip>
      </Section>

      <BadgesSection />
      <FormsSection />
      <DataSection />
      <LayoutSection />
      <FeedbackSection />
      <OverlaySection />
    </div>
  )
}

