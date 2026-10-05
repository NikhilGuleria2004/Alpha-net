import { useMemo, useState } from 'react'
import { Mail, MoreHorizontal, Trash2 } from 'lucide-react'
import { Section, Row } from './kit'
import { DataTable, type DataTableColumn } from '../../components/ems/DataTable'
import { FilterBar, type FilterChip } from '../../components/ems/FilterBar'
import { ViewSwitcher, type EmsViewMode } from '../../components/ems/ViewSwitcher'
import { BulkActionBar, BulkViewSwitch, type BulkAction, type BulkView } from '../../components/ems/BulkActionBar'
import { MOCK_USERS } from '../../mocks/fixtures'
import type { EmsUser } from '../../types/auth'

/** Tables, filters and bulk-selection primitives. */
export function DataSection() {
  const [selectedIds, setSelectedIds] = useState<string[]>(['u-emp1'])
  const [view, setView] = useState<EmsViewMode>('list')
  const [bulkView, setBulkView] = useState<BulkView>('list')
  const [search, setSearch] = useState('')
  const [chips, setChips] = useState<FilterChip[]>([
    { id: 'billable', label: 'Billable', active: true, onToggle: () => {} },
    { id: 'engineering', label: 'Engineering', active: false, onToggle: () => {} },
  ])
  const [columns, setColumns] = useState<Record<string, boolean>>({})

  const data = useMemo(
    () => MOCK_USERS.filter((u) => u.name.toLowerCase().includes(search.toLowerCase())),
    [search],
  )

  const tableColumns: DataTableColumn<EmsUser>[] = useMemo(
    () => [
      { key: 'employeeId', label: 'ID', sortable: true },
      { key: 'name', label: 'Name', sortable: true },
      { key: 'department', label: 'Department', sortable: true },
      { key: 'title', label: 'Title', defaultVisible: false },
      { key: 'email', label: 'Email', render: (u) => <span className="text-muted-foreground">{u.email}</span> },
      { key: 'billable', label: 'Billable', align: 'right', render: (u) => (u.billable ? 'Yes' : 'No') },
    ],
    [],
  )

  const visibleColumns = tableColumns.filter((c) => columns[c.id ?? c.key] !== false)

  const selectedRows = MOCK_USERS.filter((u) => selectedIds.includes(u.id))
  const bulkActions: BulkAction<EmsUser>[] = [
    { id: 'email', label: 'Email', icon: <Mail className="h-3.5 w-3.5" />, run: async () => {} },
    {
      id: 'delete',
      label: 'Delete',
      icon: <Trash2 className="h-3.5 w-3.5" />,
      disabledReason: (rows) => (rows.some((r) => r.role === 'admin') ? 'Admins cannot be deleted' : null),
      run: async () => {},
    },
  ]

  const chipsWithToggle = chips.map((chip) => ({
    ...chip,
    onToggle: () => setChips((prev) => prev.map((c) => (c.id === chip.id ? { ...c, active: !c.active } : c))),
  }))

  return (
    <Section id="data" title="Data display" description="Dense tables, filters and bulk actions — the §4.3 layout grammar.">
      <Row label="Filter bar + view switcher">
        <div className="w-full">
          <FilterBar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search employees…"
            chips={chipsWithToggle}
            onClearAll={() => {
              setSearch('')
              setChips((prev) => prev.map((c) => ({ ...c, active: false })))
            }}
            actions={<ViewSwitcher value={view} onChange={setView} />}
          />
        </div>
      </Row>
      <Row label="Bulk actions (bar appears with rows selected)">
        <div className="w-full">
          <div className="mb-2 flex items-center gap-3">
            <BulkViewSwitch value={bulkView} onChange={setBulkView} />
            <button
              type="button"
              className="text-xs text-muted-foreground underline hover:text-foreground"
              onClick={() => setSelectedIds((prev) => (prev.length === 0 ? ['u-admin', 'u-emp1'] : []))}
            >
              {selectedIds.length === 0 ? 'Select 2 rows' : 'Clear selection'}
            </button>
          </div>
          <BulkActionBar selected={selectedRows} actions={bulkActions} onClear={() => setSelectedIds([])} />
        </div>
      </Row>
      <Row label="DataTable (sort, select, column toggle)">
        <div className="w-full">
          <div className="mb-2 flex flex-wrap gap-2">
            {tableColumns.map((c) => (
              <button
                key={c.id ?? c.key}
                type="button"
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                aria-pressed={columns[c.id ?? c.key] !== false}
                onClick={() => setColumns((prev) => ({ ...prev, [c.id ?? c.key]: !(prev[c.id ?? c.key] ?? true) }))}
              >
                {c.label}
              </button>
            ))}
          </div>
          <DataTable
            columns={visibleColumns}
            data={data}
            getRowId={(u) => u.id}
            selectable
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            columnToggle
            pageSize={5}
            rowActions={(u) => (
              <button type="button" aria-label={`Actions for ${u.name}`} className="rounded p-1 hover:bg-muted">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            )}
          />
        </div>
      </Row>
      <Row label="DataTable — loading / empty states">
        <div className="grid w-full gap-3 lg:grid-cols-2">
          <DataTable columns={visibleColumns} data={[]} loading loadingRows={4} emptyTitle="No employees yet" />
          <DataTable columns={visibleColumns} data={[]} emptyTitle="No employees found" emptyMessage="Try clearing filters." />
        </div>
      </Row>
    </Section>
  )
}
