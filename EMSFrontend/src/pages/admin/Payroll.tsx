/**
 * Payroll page (EMSFrontend.md §7.8, Phase 7).
 * Admin-only: payroll rows + rate-change log + CSV export.
 */
import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { useDelayedLoading } from '../../hooks/useDelayedLoading'
import { DashboardShell } from '../../components/ems/DashboardShell'
import { EmsCard } from '../../components/ems/EmsCard'
import { KpiStrip } from '../../components/ems/KpiStrip'
import { KpiStat } from '../../components/ems/KpiStat'
import { DataTable, type Column } from '../../components/ems/DataTable'
import { Button } from '../../components/ui/Button'
import { Select } from '../../components/ui/Select'
import { Badge } from '../../components/ui/Badge'
import { Download } from 'lucide-react'
import { useEmployeeBase } from '../../hooks/useEmployeeBase'
import { getPayroll } from '../../services/financeService'
import type { PayrollRow, PayRateChange } from '../../types/payroll'
import { formatMoney, formatNumber } from '../../utils/currency'
import { formatDate } from '../../utils/date'

const PAYROLL_PERIODS = [
  { value: '2026-09', label: 'September 2026' },
  { value: '2026-08', label: 'August 2026' },
  { value: '2026-07', label: 'July 2026' },
]

interface PayrollResponse {
  rows: PayrollRow[]
  rateChanges: PayRateChange[]
  totalGross: number
  period: string
}

export function AdminPayrollPage() {
  // This page is reachable from both namespaces; keep employee links in whichever
  // one the viewer is in (see useEmployeeBase).
  const employeeBase = useEmployeeBase()
  const { user } = useAuth()
  const { addToast } = useToast()
  const [data, setData] = useState<PayrollResponse | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [period, setPeriod] = useState('2026-09')
  const loading = useDelayedLoading(!data && !error)

  useEffect(() => {
    let cancelled = false
    getPayroll(period)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load payroll'))
          addToast('error', 'Could not load payroll data.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [period, addToast])

  const totalGross = useMemo(() => data?.totalGross ?? 0, [data])
  const rowCount = useMemo(() => data?.rows.length ?? 0, [data])

  const handleExportCsv = () => {
    if (!data) return
    const headers = ['Employee', 'Role', 'Period', 'Hours', 'Rate', 'Currency', 'Gross', 'Status']
    const rows = data.rows.map((r) => [
      r.employeeName,
      r.role,
      r.period,
      r.hours.toString(),
      r.payRate.toString(),
      r.currency,
      r.gross.toString(),
      r.status,
    ])
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${data.period}.csv`
    a.click()
    URL.revokeObjectURL(url)
    addToast('success', `Exported ${data.rows.length} rows to payroll-${data.period}.csv.`)
  }

  const columns: Column<PayrollRow>[] = [
    {
      key: 'employeeName',
      label: 'Employee',
      sortable: true,
      render: (row) => (
        <Link to={`${employeeBase}/${row.userId}`} className="font-medium text-accent hover:underline">
          {row.employeeName}
        </Link>
      ),
    },
    { key: 'role', label: 'Role', sortable: true, render: (row) => <span className="text-sm text-foreground">{row.role}</span> },
    { key: 'period', label: 'Period', sortable: true, render: (row) => <span className="ems-tabular">{row.period}</span> },
    { key: 'hours', label: 'Hours', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatNumber(row.hours, 1)}</span> },
    { key: 'payRate', label: 'Pay Rate', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatMoney(row.payRate, row.currency)}/hr</span> },
    { key: 'gross', label: 'Gross', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatMoney(row.gross, row.currency)}</span> },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge variant={row.status === 'approved' ? 'success' : row.status === 'paid' ? 'info' : 'warning'}>
          {row.status}
        </Badge>
      ),
    },
  ]

  return (
    <DashboardShell
      title="Payroll"
      subtitle={`Period: ${data?.period ?? period} · Signed in as ${user?.name ?? '…'}`}
      kpiCount={3}
      loading={loading}
      error={error}
      data={data}
      onRetry={() => {
        setData(null)
        setError(null)
      }}
    >
      {() => (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Select value={period} onChange={(e) => setPeriod(e.target.value)} options={PAYROLL_PERIODS} />
            <Button variant="secondary" leftIcon={<Download className="h-4 w-4" />} onClick={handleExportCsv}>
              Export CSV
            </Button>
          </div>

          <KpiStrip>
            <KpiStat label="Payable Employees" value={rowCount} />
            <KpiStat label="Total Gross Pay" value={formatMoney(totalGross)} />
            <KpiStat label="Rate Changes" value={data?.rateChanges.length ?? 0} />
          </KpiStrip>

          <EmsCard title="Payroll Rows" subtitle={`Gross pay for ${data?.period ?? period}`} padding="tight">
            <DataTable
              columns={columns}
              data={data?.rows ?? []}
              getRowId={(row) => row.id}
              pageSize={25}
              emptyTitle="No payroll rows"
              emptyMessage="No hours recorded for this period."
            />
          </EmsCard>

          <EmsCard title="Rate Change Log" subtitle="Audit trail of pay-rate modifications">
            <DataTable
              columns={[
                { key: 'employeeName', label: 'Employee', sortable: true, render: (row) => <span className="font-medium text-foreground">{row.userId}</span> },
                { key: 'oldRate', label: 'Old Rate', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{row.oldRate ? formatMoney(row.oldRate, row.currency) : '—'}</span> },
                { key: 'newRate', label: 'New Rate', sortable: true, align: 'right', render: (row) => <span className="ems-tabular">{formatMoney(row.newRate, row.currency)}</span> },
                { key: 'changedBy', label: 'Changed By', sortable: true, render: (row) => <span className="text-sm">{row.changedBy}</span> },
                { key: 'reason', label: 'Reason', sortable: true, render: (row) => <span className="text-sm">{row.reason ?? '—'}</span> },
                { key: 'createdAt', label: 'Date', sortable: true, render: (row) => <span className="ems-tabular">{formatDate(row.createdAt)}</span> },
              ]}
              data={data?.rateChanges ?? []}
              getRowId={(row) => row.id}
              pageSize={15}
              emptyTitle="No rate changes"
              emptyMessage="No rate changes in this period."
            />
          </EmsCard>
        </div>
      )}
    </DashboardShell>
  )
}
