import { useState } from 'react'

/**
 * True on Apple platforms, where the "command" modifier is Meta.
 *
 * Guideline (Interactions — "locale-aware keyboard shortcuts: internationalize
 * keyboard shortcuts for non-QWERTY layouts, show platform-specific symbols").
 * The search handler in `Topbar` accepts both `metaKey` and `ctrlKey`, so the
 * shortcut *works* everywhere — but advertising a fixed "⌘K" tells a Windows or
 * Linux user to press a key their keyboard does not have. The hint has to follow
 * the platform, or the visible affordance contradicts the behaviour.
 *
 * Resolved once in a lazy `useState` initialiser rather than in an effect: the
 * platform cannot change for the lifetime of the page, so there is nothing to
 * subscribe to, and this keeps the value correct for the very first render
 * (no flash of the wrong symbol). `userAgentData.platform` is preferred; the
 * deprecated `navigator.platform` is the fallback because `userAgentData` is not
 * universally typed yet. It only ever picks a label, so the downside is a wrong
 * symbol on an exotic platform — never a broken handler.
 */
function detectMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  if (data?.platform) return data.platform === 'macOS'
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent)
}

export function useIsMac(): boolean {
  const [isMac] = useState(detectMac)
  return isMac
}

