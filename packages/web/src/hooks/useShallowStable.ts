import { useState } from 'react'

function shallowEqual<T extends object>(a: T, b: T): boolean {
  const aKeys = Object.keys(a) as (keyof T)[]
  return aKeys.length === Object.keys(b).length && aKeys.every((key) => Object.is(a[key], b[key]))
}

/**
 * Returns the previous object while every property is unchanged (`Object.is`), so a caller that
 * builds an object each render can memoize on it without listing its fields.
 */
export function useShallowStable<T extends object>(value: T): T {
  const [stable, setStable] = useState(value)
  if (stable === value || shallowEqual(stable, value)) return stable
  // Storing information from previous renders: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  setStable(value)
  return value
}
