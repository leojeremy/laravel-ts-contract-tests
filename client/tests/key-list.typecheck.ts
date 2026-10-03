/**
 * Compile-time tests for `keyList`. Not run by Vitest: `tsc --noEmit`
 * (npm test runs it first) fails if any `@ts-expect-error` stops erroring.
 */
import { keyList } from './contract-helpers';

interface Example {
  id: number;
  name: string;
}

export const exact = keyList<Example>()(['id', 'name']);

// @ts-expect-error: `name` is missing from the list.
export const missing = keyList<Example>()(['id']);

// @ts-expect-error: `email` is not a key of Example.
export const unknownKey = keyList<Example>()(['id', 'name', 'email']);
