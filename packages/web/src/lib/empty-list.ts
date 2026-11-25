/**
 * One shared, frozen empty array. `query.data ?? EMPTY_LIST` keeps the same identity on every
 * render while data loads, so hooks that depend on the list don't rerun.
 */
export const EMPTY_LIST: never[] = Object.freeze([]) as never[]
