import { describe, expect, it } from 'vitest';
import taskIndex from '../../contracts/tasks.index.json';
import taskShow from '../../contracts/tasks.show.json';
import taskStore from '../../contracts/tasks.store.json';
import taskUpdate from '../../contracts/tasks.update.json';
import deletedError from '../../contracts/error.deleted.json';
import lockedError from '../../contracts/error.locked.json';
import validationError from '../../contracts/error.validation.json';
import { TASK_STATUSES } from '../src/api';
import type { ErrorBody, Task, TaskListResponse, TaskResponse, ValidationErrorBody } from '../src/api';
import { keyDrift, keyList, keysOf, type Wire } from './contract-helpers';

// Compile-time lock: every captured API response must be assignable to the
// hand-written interface it is read as. `tsc --noEmit` fails on a missing
// key or a changed type. (Extra keys are caught at runtime below.)
const fixtures = {
  index: taskIndex satisfies Wire<TaskListResponse>,
  show: taskShow satisfies Wire<TaskResponse>,
  store: taskStore satisfies Wire<TaskResponse>,
  update: taskUpdate satisfies Wire<TaskResponse>,
  deleted: deletedError satisfies Wire<ErrorBody>,
  locked: lockedError satisfies Wire<ErrorBody>,
  validation: validationError satisfies Wire<ValidationErrorBody>,
};

const taskKeys = keyList<Task>()(['id', 'title', 'notes', 'status', 'dueOn', 'locked', 'createdAt', 'updatedAt']);
const errorKeys = keyList<ErrorBody>()(['message', 'code']);
const validationKeys = keyList<ValidationErrorBody>()(['message', 'errors']);

function expectTask(task: Wire<Task>): void {
  expect(keyDrift(task, taskKeys), `task ${task.id}`).toEqual({ extra: [], missing: [] });
  expect(TASK_STATUSES).toContain(task.status);
  if (task.dueOn !== null) expect(task.dueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(Number.isNaN(Date.parse(task.createdAt))).toBe(false);
  expect(Number.isNaN(Date.parse(task.updatedAt))).toBe(false);
}

describe('client ↔ API contract', () => {
  it('task list envelope and every item carry exactly the modelled keys', () => {
    expect(keysOf(fixtures.index)).toEqual(['data']);
    expect(fixtures.index.data.length).toBeGreaterThan(0);
    fixtures.index.data.forEach(expectTask);
  });

  it.each([
    ['tasks.show', fixtures.show],
    ['tasks.store', fixtures.store],
    ['tasks.update', fixtures.update],
  ])('%s carries exactly the modelled keys', (_name, fixture) => {
    expect(keysOf(fixture)).toEqual(['data']);
    expectTask(fixture.data);
  });

  it('nullable fields are captured both filled and null', () => {
    // Otherwise the fixtures would never exercise one side of `T | null`.
    const notes = fixtures.index.data.map((task) => task.notes);
    const dueOn = fixtures.index.data.map((task) => task.dueOn);
    expect(notes).toContain(null);
    expect(notes.some((value) => typeof value === 'string')).toBe(true);
    expect(dueOn).toContain(null);
    expect(dueOn.some((value) => typeof value === 'string')).toBe(true);
  });

  it.each([
    ['error.deleted', fixtures.deleted, 'task_deleted'],
    ['error.locked', fixtures.locked, 'task_locked'],
  ])('%s carries exactly the modelled keys', (_name, fixture, code) => {
    expect(keyDrift(fixture, errorKeys)).toEqual({ extra: [], missing: [] });
    expect(fixture.code).toBe(code);
  });

  it('error.validation carries field errors as string lists', () => {
    expect(keyDrift(fixtures.validation, validationKeys)).toEqual({ extra: [], missing: [] });
    for (const messages of Object.values(fixtures.validation.errors)) {
      expect(messages.length).toBeGreaterThan(0);
      for (const message of messages) expect(typeof message).toBe('string');
    }
  });
});
