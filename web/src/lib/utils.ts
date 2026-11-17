type ClassValue = string | false | null | undefined

/**
 * Joins the class names that are actually there.
 *
 * A dependency for this would be one more thing to keep current, and the app
 * never needs conditional merging beyond a falsy check.
 */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
