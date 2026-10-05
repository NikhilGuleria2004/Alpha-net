/**
 * Settings page (EMSFrontend.md §7.11, Phase 7).
 * Density theme + org settings. Shared across namespaces.
 */
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useTheme } from '../../contexts/ThemeContext'
import { useDensity } from '../../hooks/useDensity'
import { useSurfaceStyle } from '../../hooks/useSurfaceStyle'
import { useUiStore } from '../../stores/uiStore'
import { FormSection } from '../../components/ems/FormSection'
import { Button } from '../../components/ui/Button'
import { Switch } from '../../components/ui/Switch'
import { Select } from '../../components/ui/Select'
import { Input } from '../../components/ui/Input'
import { ThemeToggle } from '../../components/ui/ThemeToggle'
import { Save, Monitor } from 'lucide-react'

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black (OLED)' },
]

export function SettingsPage() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const { density, setDensity } = useDensity()
  const { surfaceStyle, setSurfaceStyle } = useSurfaceStyle()
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const [saved, setSaved] = useState(false)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user?.name ?? '…'}</p>
      </div>

      <FormSection title="Appearance" description="Theme, density, and layout preferences.">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-foreground">Theme</span>
              <p className="text-xs text-muted-foreground">Cycle through light / dark / black</p>
            </div>
            <ThemeToggle showLabel />
          </div>

          <Select
            label="Preferred Theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'black')}
            options={THEMES}
          />

          <div>
            <Select
              label="Surface Style"
              value={surfaceStyle}
              onChange={(e) => setSurfaceStyle(e.target.value as 'soft' | 'hard')}
              options={[
                { value: 'soft', label: 'Soft' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Soft keeps the rounded, softly-shadowed Eniac look. Hard is monochrome and
              brutalist — hairline borders, no shadows, square geometry.
            </p>
          </div>

          <Select
            label="Density"
            value={density}
            onChange={(e) => setDensity(e.target.value as 'comfortable' | 'compact')}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact', label: 'Compact' },
            ]}
          />

          <Switch
            label="Collapse sidebar"
            description="Hide the navigation sidebar on wide screens"
            checked={sidebarCollapsed}
            onChange={setSidebarCollapsed}
          />

          <Switch
            label="System theme (auto)"
            description="Follow your operating system's light/dark setting"
            checked={false}
            onChange={() => {}}
          />
        </div>
      </FormSection>

      <FormSection title="Organization" description="Company-level settings that affect all users.">
        <div className="space-y-3">
          <Input label="Company Name" defaultValue={user?.name ? 'Eniac EMS' : ''} placeholder="Acme Corp" />
          <Input label="Default Currency" placeholder="USD" />
          <Select
            label="Date Format"
            options={[
              { value: 'MM/dd/yyyy', label: 'MM/dd/yyyy' },
              { value: 'dd/MM/yyyy', label: 'dd/MM/yyyy' },
              { value: 'yyyy-MM-dd', label: 'ISO (yyyy-MM-dd)' },
            ]}
            defaultValue="MM/dd/yyyy"
          />
          <Switch label="Timesheet platform integration" description="Sync client and assignment data to the timesheet platform" checked={true} onChange={() => {}} />
          <Switch label="Auto-sync every 6 hours" description="Background sync of payroll and assignment data" checked={true} onChange={() => {}} />
        </div>
      </FormSection>

      <FormSection title="Profile" description="Your personal account details.">
        <div className="space-y-3">
          <Input label="Display Name" defaultValue={user?.name ?? ''} />
          <Input label="Email" type="email" defaultValue={user?.email ?? ''} />
          <Input label="Job Title" defaultValue={user?.title ?? ''} />
          <Select
            label="Theme accent color"
            options={[
              { value: 'default', label: 'Default (blue)' },
              { value: 'green', label: 'Sage' },
              { value: 'amber', label: 'Amber' },
            ]}
            defaultValue="default"
          />
        </div>
      </FormSection>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="ghost" leftIcon={<Monitor className="h-4 w-4" />}>
          Reset to defaults
        </Button>
        <Button variant="primary" leftIcon={<Save className="h-4 w-4" />} onClick={handleSave}>
          {saved ? 'Saved!' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
