import { Section, Row } from './kit'
import { Badge } from '../../components/ui/Badge'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { KpiChip } from '../../components/ui/KpiChip'
import { ChipStrip } from '../../components/ui/ChipStrip'
import { Avatar } from '../../components/ui/Avatar'
import { AvatarStack } from '../../components/ems/AvatarStack'
import { RoleBadge } from '../../components/ems/RoleBadge'
import { BillableChip } from '../../components/ems/BillableChip'
import { PayRateCell } from '../../components/ems/PayRateCell'
import { ClientIdBadge } from '../../components/ems/ClientIdBadge'
import { EmployeeIdBadge } from '../../components/ems/EmployeeIdBadge'
import { IntegrationStatusChip } from '../../components/ems/IntegrationStatusChip'
import { AttendanceStatusDot } from '../../components/ems/AttendanceStatusDot'
import type { UserRole } from '../../types/auth'
import type { AttendanceStatus } from '../../types/attendance'

const ROLES: UserRole[] = ['admin', 'hr', 'manager', 'employee']
const ATTENDANCE: AttendanceStatus[] = [
  'present',
  'remote',
  'late',
  'half_day',
  'on_leave',
  'absent',
  'holiday',
  'weekend',
]
const PROJECT_STATUSES = [
  'draft',
  'sent',
  'pending',
  'approved',
  'declined',
  'active',
  'completed',
  'overdue',
  'archived',
  'withdrawn',
] as const

/** Badges, chips, avatars and every status marker. */
export function BadgesSection() {
  return (
    <Section id="badges" title="Badges & identity" description="Role, status and identifier chips — icon + text, never colour alone.">
      <Row label="Badge variants">
        <Badge>Default</Badge>
        <Badge variant="success">Success</Badge>
        <Badge variant="warning">Warning</Badge>
        <Badge variant="danger">Danger</Badge>
        <Badge variant="info">Info</Badge>
        <Badge size="sm">Small</Badge>
        <Badge variant="success" size="sm">
          Small success
        </Badge>
      </Row>
      <Row label="Role badges">
        {ROLES.map((role) => (
          <RoleBadge key={role} role={role} />
        ))}
        {ROLES.map((role) => (
          <RoleBadge key={`sm-${role}`} role={role} size="sm" />
        ))}
      </Row>
      <Row label="Status badges">
        {PROJECT_STATUSES.map((status) => (
          <StatusBadge key={status} status={status} />
        ))}
      </Row>
      <Row label="KPI chips">
        <KpiChip label="Headcount" value={128} />
        <KpiChip label="Attendance" value="94.2%" color="success" />
        <KpiChip label="Unmarked" value={3} color="warning" />
        <KpiChip label="Overdue" value={1} color="danger" />
        <KpiChip label="Utilization" value="81%" color="info" />
      </Row>
      <Row label="Employment markers">
        <BillableChip billable />
        <BillableChip billable={false} />
        <EmployeeIdBadge id="E000101" />
        <ClientIdBadge id="CL-2026-001" />
        <PayRateCell amount={85} />
        <PayRateCell amount={95} currency="EUR" />
        <PayRateCell amount={12000} period="flat" />
        <PayRateCell amount={null} />
      </Row>
      <Row label="Sync status">
        <IntegrationStatusChip status="synced" />
        <IntegrationStatusChip status="pending" />
        <IntegrationStatusChip status="error" />
        <IntegrationStatusChip status="synced" label="Clients synced: 12" size="md" />
      </Row>
      <Row label="Attendance dots">
        {ATTENDANCE.map((status) => (
          <AttendanceStatusDot key={status} status={status} showLabel />
        ))}
      </Row>
      <Row label="Avatars">
        <Avatar name="Aarav Admin" size="sm" />
        <Avatar name="Hina Rao" size="md" status="online" />
        <Avatar name="Meera Manager" size="lg" status="away" />
        <Avatar name="Offline User" size="md" status="offline" />
        <AvatarStack
          people={[
            { name: 'Esha Employee' },
            { name: 'Dev Contractor' },
            { name: 'Kabir Rao' },
            { name: 'Riya Nair' },
            { name: 'Arjun Mehta' },
            { name: 'Asha Verma' },
          ]}
          max={4}
        />
      </Row>
      <Row label="Chip strip (filters)">
        <ChipStrip>
          <Badge>All (24)</Badge>
          <Badge variant="info">Engineering (9)</Badge>
          <Badge variant="success">Active (21)</Badge>
        </ChipStrip>
      </Row>
    </Section>
  )
}
