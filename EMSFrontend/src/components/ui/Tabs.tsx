import { type ReactNode, useState, createContext, useContext, type KeyboardEvent } from 'react'

interface Tab {
  id: string
  label: string
  content: ReactNode
  disabled?: boolean
}

interface TabsContextValue {
  activeTab: string
  setActiveTab: (id: string) => void
}

const TabsContext = createContext<TabsContextValue | undefined>(undefined)

export function useTabs() {
  const context = useContext(TabsContext)
  if (!context) throw new Error('Tabs components must be used within Tabs')
  return context
}

interface TabsProps {
  tabs: Tab[]
  defaultValue?: string
  /** Controlled active tab — pair with `onValueChange` to drive it from the URL. */
  value?: string
  onValueChange?: (id: string) => void
  className?: string
}

export function Tabs({ tabs, defaultValue, value, onValueChange, className = '' }: TabsProps) {
  const initial = defaultValue || tabs[0]?.id
  const [uncontrolled, setUncontrolled] = useState(initial)
  // Controlled when `value` is supplied, uncontrolled otherwise, so existing
  // callers keep working while a page can put the tab in the URL.
  const isControlled = value !== undefined
  const activeTab = isControlled ? value : uncontrolled
  const setActiveTab = (id: string) => {
    if (!isControlled) setUncontrolled(id)
    onValueChange?.(id)
  }

  const focusTab = (id: string) => {
    setActiveTab(id)
    document.getElementById(`tab-${id}`)?.focus()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledTabs = tabs.filter((t) => !t.disabled)
    if (enabledTabs.length === 0) return
    const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab)
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabledTabs.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = enabledTabs.length - 1
    } else {
      return
    }
    const nextTab = enabledTabs[nextIndex]
    if (nextTab) focusTab(nextTab.id)
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>
        <div
          role="tablist"
          onKeyDown={handleKeyDown}
          className="flex flex-wrap items-center gap-1 border-b border-border"
        >
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`tab-${tab.id}`}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                disabled={tab.disabled}
                onClick={() => setActiveTab(tab.id)}
                // Roving tabindex: only the selected tab is a tab stop, which is
                // what the ARIA tabs pattern expects. Without it every tab joins
                // the tab order and the arrow keys duplicate what Tab does.
                tabIndex={isActive ? 0 : -1}
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  isActive
                    ? 'border-b-2 border-accent text-accent'
                    : 'text-muted-foreground hover:text-foreground'
                } ${tab.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <div className="mt-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <div
                key={tab.id}
                id={`panel-${tab.id}`}
                role="tabpanel"
                hidden={!isActive}
                aria-labelledby={`tab-${tab.id}`}
              >
                {isActive && tab.content}
              </div>
            )
          })}
        </div>
      </div>
    </TabsContext.Provider>
  )
}
