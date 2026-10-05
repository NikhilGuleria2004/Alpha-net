import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Section, Row } from './kit'
import { Button } from '../../components/ui/Button'
import { Modal } from '../../components/ui/Modal'
import { Drawer } from '../../components/ui/Drawer'
import { Dropdown, DropdownItem } from '../../components/ui/Dropdown'
import { Tooltip } from '../../components/ui/Tooltip'
import { SlideOver } from '../../components/ems/SlideOver'
import { CommandPalette, type Command } from '../../components/ems/CommandPalette'
import { SearchPalette, type SearchPaletteResult } from '../../components/ems/SearchPalette'
import { NotificationBell } from '../../components/ems/NotificationBell'
import { PermissionGate } from '../../components/ems/PermissionGate'
import { DensityToggle } from '../../components/ems/DensityToggle'
import { usePermissions } from '../../hooks/usePermissions'
import { useToast } from '../../contexts/ToastContext'
import { MOCK_USERS } from '../../mocks/fixtures'
import { MOCK_NOTIFICATIONS } from '../../mocks/fixtures2'
import { Badge } from '../../components/ui/Badge'

type Person = { id: string; name: string; department: string }

const PEOPLE: Person[] = MOCK_USERS.map((u) => ({ id: u.id, name: u.name, department: u.department ?? 'Unassigned' }))

/** Overlays (modal, drawer, slide-over, palettes) + permission gating. */
export function OverlaySection() {
  const { addToast } = useToast()
  const [modalOpen, setModalOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [slideOpen, setSlideOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')

  const adminCaps = usePermissions(MOCK_USERS[0] ?? null)
  const employeeCaps = usePermissions(MOCK_USERS[4] ?? null)

  const commands: Command[] = [
    { id: 'nav-employees', title: 'Go to Employees', group: 'Navigation', run: () => addToast('info', 'Navigating to Employees…') },
    { id: 'nav-attendance', title: 'Go to Attendance', group: 'Navigation', run: () => addToast('info', 'Navigating to Attendance…') },
    { id: 'act-invite', title: 'Invite employee', group: 'Actions', keywords: 'onboarding hire', run: () => addToast('success', 'Invite dialog would open.') },
    { id: 'act-mark', title: 'Mark attendance', group: 'Actions', run: () => addToast('success', 'Attendance marked.') },
  ]

  const results: SearchPaletteResult<Person>[] = PEOPLE.filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()),
  ).map((p) => ({ id: p.id, title: p.name, subtitle: p.department, item: p }))

  return (
    <Section id="overlays" title="Overlays & permissions" description="Modal, drawer, slide-over, Cmd/Ctrl+K palette, search, notifications, capability gate.">
      <Row label="Modal / drawer / slide-over">
        <Button size="sm" onClick={() => setModalOpen(true)}>
          Open modal
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setDrawerOpen(true)}>
          Open drawer
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setSlideOpen(true)}>
          Open slide-over
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setPaletteOpen(true)}>
          Command palette (⌘K)
        </Button>
      </Row>
      <Row label="Dropdown / tooltip / toggles">
        <Dropdown trigger={<Button size="sm" variant="secondary">Actions ▾</Button>} align="right">
          <DropdownItem icon={<UserPlus className="h-4 w-4" />} onClick={() => addToast('success', 'Invite started.')}>
            Invite employee
          </DropdownItem>
          <DropdownItem onClick={() => addToast('info', 'Export queued.')}>Export CSV</DropdownItem>
          <DropdownItem divider>{''}</DropdownItem>
          <DropdownItem destructive onClick={() => addToast('error', 'Deactivated.')}>
            Deactivate
          </DropdownItem>
        </Dropdown>
        <Tooltip content="Tooltip appears after a short delay, instantly on re-hover.">
          <Button size="sm" variant="ghost">
            Hover / focus me
          </Button>
        </Tooltip>
        <DensityToggle />
      </Row>
      <Row label="Notification bell">
        <NotificationBell notifications={MOCK_NOTIFICATIONS} onOpen={() => addToast('info', 'Would open /notifications.')} />
      </Row>
      <Row label="Search palette (employee lookup)">
        <div className="w-full max-w-sm">
          <SearchPalette
            query={query}
            onQueryChange={setQuery}
            results={results}
            onSelect={(p) => addToast('info', `Selected ${p.name}`)}
            placeholder="Search people…"
            emptyTitle="No matches"
            emptyMessage="Try a different name."
          />
        </div>
      </Row>
      <Row label="Permission gate (capability-based, never raw roles)">
        <div className="grid w-full gap-3 lg:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <p className="ems-overline mb-2 text-muted-foreground">Admin · manageUsers</p>
            <PermissionGate capabilities={adminCaps} allow="manageUsers">
              <Button size="sm" leftIcon={<UserPlus className="h-4 w-4" />}>
                Invite employee
              </Button>
            </PermissionGate>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="ems-overline mb-2 text-muted-foreground">Employee · manageUsers (denied)</p>
            <PermissionGate
              capabilities={employeeCaps}
              allow="manageUsers"
              fallback={
                <p className="text-sm text-muted-foreground">
                  Locked — your role does not have this capability. (Fallback slot renders here.)
                </p>
              }
            >
              {''}
            </PermissionGate>
          </div>
        </div>
      </Row>
      <Row label="Silent gate (renders nothing when denied)">
        <PermissionGate capabilities={employeeCaps} allow="viewPayroll" silent>
          <Badge variant="info">Payroll visible</Badge>
        </PermissionGate>
      </Row>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Invite employee"
        description="An invitation email will be sent."
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => { setModalOpen(false); addToast('success', 'Invitation sent.') }}>Send invite</Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">Modal traps focus and restores it on close.</p>
      </Modal>

      <Drawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title="Filters" resizable>
        <p className="text-sm text-muted-foreground">Resizable drawer with persisted width.</p>
      </Drawer>

      <SlideOver
        isOpen={slideOpen}
        onClose={() => setSlideOpen(false)}
        title="Employee detail"
        footer={<Button onClick={() => setSlideOpen(false)}>Close</Button>}
      >
        <p className="text-sm text-muted-foreground">Slide-over panel for record previews.</p>
      </SlideOver>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </Section>
  )
}
