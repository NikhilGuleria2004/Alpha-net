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
  className?: string
}

export function Tabs({ tabs, defaultValue, className = '' }: TabsProps) {
  const initial = defaultValue || tabs[0]?.id
  const [activeTab, setActiveTab] = useState(initial)

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabledTabs = tabs.filter((t) => !t.disabled)
    const currentIndex = enabledTabs.findIndex((t) => t.id === activeTab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % enabledTabs.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length
    } else {
      return
    }
    const nextTab = enabledTabs[nextIndex]
    if (nextTab) {
      setActiveTab(nextTab.id)
      const tabButton = document.getElementById(`tab-${nextTab.id}`)
      tabButton?.focus()
    }
  }

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>
        <div
          role="tablist"
          onKeyDown={handleKeyDown}
          className="flex flex-wrap items-center gap-1 border-b border-slate-200"
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
                className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isActive
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-slate-500 hover:text-slate-700'
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

export function TabList({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1 border-b border-slate-200">{children}</div>
}

export function TabTrigger({ id, children, disabled, activeTab, setActiveTab }: { id: string; children: ReactNode; disabled?: boolean; activeTab: string; setActiveTab: (id: string) => void }) {
  const isActive = activeTab === id
  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => setActiveTab(id)}
      className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        isActive ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500 hover:text-slate-700'
      } ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  )
}

export function TabContent({ id, children, activeTab }: { id: string; children: ReactNode; activeTab: string }) {
  const isActive = activeTab === id
  return (
    <div role="tabpanel" hidden={!isActive} className="mt-4">
      {isActive && children}
    </div>
  )
}
