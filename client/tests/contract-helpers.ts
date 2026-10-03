/**
 * Helpers that close the gaps `satisfies` leaves open on a JSON import.
 *
 * 1. A JSON module's string values are typed `string`, never a literal, so a
 *    fixture cannot satisfy `status: 'todo' | 'doing' | 'done'` as is.
 *    `Wire<T>` widens literal unions to their base type for the compile-time
 *    check; the runtime tests check the actual values instead.
 * 2. A JSON import is not a fresh object literal, so `satisfies` reports
 *    MISSING keys but not EXTRA ones. `keyList<T>()` builds the runtime key
 *    list that catches extras, and refuses to compile unless it names
 *    exactly the keys of T, so the list cannot drift from the interface.
 */

export type Wire<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer U)[]
        ? Wire<U>[]
        : T extends object
          ? { [K in keyof T]: Wire<T[K]> }
          : T;

type MissingKeys<T, K extends readonly PropertyKey[]> = Exclude<keyof T, K[number]>;

export function keyList<T>() {
  return <const K extends readonly (keyof T & string)[]>(
    keys: K & ([MissingKeys<T, K>] extends [never] ? unknown : { missingKeys: MissingKeys<T, K> }),
  ): string[] => [...keys].sort();
}

/** Sorted own keys, for comparing with a `keyList` result. */
export function keysOf(value: object): string[] {
  return Object.keys(value).sort();
}

/**
 * Which keys a fixture object has beyond, or lacks against, the modelled
 * list. Compared as `{ extra: [], missing: [] }` so a failure names the key.
 */
export function keyDrift(value: object, modelled: readonly string[]): { extra: string[]; missing: string[] } {
  const actual = keysOf(value);
  return {
    extra: actual.filter((key) => !modelled.includes(key)),
    missing: modelled.filter((key) => !actual.includes(key)),
  };
}
