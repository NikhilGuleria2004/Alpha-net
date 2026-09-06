const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateEmail(email: string): { valid: boolean; message?: string } {
  if (!email.trim()) {
    return { valid: false, message: 'Email is required' }
  }
  if (!EMAIL_REGEX.test(email)) {
    return { valid: false, message: 'Invalid email format' }
  }
  return { valid: true }
}

export function validateRequired(value: string, fieldName: string): { valid: boolean; message?: string } {
  if (!value.trim()) {
    return { valid: false, message: `${fieldName} is required` }
  }
  return { valid: true }
}

export function validateHours(hours: number): { valid: boolean; message?: string } {
  if (Number.isNaN(hours)) {
    return { valid: false, message: 'Hours must be a number' }
  }
  if (hours < 0) {
    return { valid: false, message: 'Hours cannot be negative' }
  }
  if (hours > 24) {
    return { valid: false, message: 'Hours cannot exceed 24 per day' }
  }
  return { valid: true }
}

export function validateDateRange(start: string, end: string): { valid: boolean; message?: string } {
  if (!start || !end) {
    return { valid: false, message: 'Start and end dates are required' }
  }
  if (new Date(end) < new Date(start)) {
    return { valid: false, message: 'End date cannot be before start date' }
  }
  return { valid: true }
}

export function validateTimesheet(entries: { regularHours: number; overtimeHours: number }[]): { valid: boolean; message?: string } {
  if (!entries.length) {
    return { valid: false, message: 'At least one timesheet entry is required' }
  }
  const hasHours = entries.some((entry) => entry.regularHours > 0 || entry.overtimeHours > 0)
  if (!hasHours) {
    return { valid: false, message: 'Please enter hours for at least one day' }
  }
  return { valid: true }
}
