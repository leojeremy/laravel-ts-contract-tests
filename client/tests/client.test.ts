import { afterEach, describe, expect, it, vi } from 'vitest';
import taskIndex from '../../contracts/tasks.index.json';
import taskShow from '../../contracts/tasks.show.json';
import taskStore from '../../contracts/tasks.store.json';
import deletedError from '../../contracts/error.deleted.json';
import lockedError from '../../contracts/error.locked.json';
import validationError from '../../contracts/error.validation.json';
import {
  ApiError,
  TaskDeletedError,
  TaskLockedError,
  ValidationError,
  createClient,
} from '../src/api';

// The client is exercised against the same captured bodies the API produced,
// so these tests cannot pass against a response shape the API never sends.
function respondWith(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const client = createClient({ baseUrl: 'https://api.example.test/' });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('successful responses', () => {
  it('lists tasks', async () => {
    const fetchMock = respondWith(200, taskIndex);

    const tasks = await client.listTasks();

    expect(tasks).toHaveLength(taskIndex.data.length);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/v1/tasks', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
  });

  it('unwraps a single task', async () => {
    respondWith(200, taskShow);

    await expect(client.getTask(1)).resolves.toEqual(taskShow.data);
  });

  it('sends JSON when creating a task', async () => {
    const fetchMock = respondWith(201, taskStore);

    const task = await client.createTask({ title: 'Review the diff', dueOn: '2026-02-01' });

    expect(task.id).toBe(taskStore.data.id);
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/api/v1/tasks', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Review the diff', dueOn: '2026-02-01' }),
    });
  });
});

describe('status codes become typed results', () => {
  it('returns null for 404 on getTask', async () => {
    respondWith(404, { message: 'Task not found.' });

    await expect(client.getTask(999)).resolves.toBeNull();
  });

  it('throws ApiError for 404 where a task is required', async () => {
    respondWith(404, { message: 'Task not found.' });

    await expect(client.updateTask(999, { title: 'x' })).rejects.toMatchObject({ name: 'ApiError', status: 404 });
  });

  it('throws TaskDeletedError for 410 with the body attached', async () => {
    respondWith(410, deletedError);

    const error = await client.getTask(2).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TaskDeletedError);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 410, message: deletedError.message, body: deletedError });
  });

  it('throws TaskLockedError for 423', async () => {
    respondWith(423, lockedError);

    const error = await client.updateTask(1, { title: 'Renamed' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(TaskLockedError);
    expect(error).toMatchObject({ status: 423, body: { code: 'task_locked' } });
  });

  it('throws ValidationError for 422 with per-field messages', async () => {
    respondWith(422, validationError);

    const error = await client.createTask({ title: '' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ValidationError);
    expect((error as ValidationError).errors).toEqual(validationError.errors);
  });

  it('throws a plain ApiError for other failures', async () => {
    respondWith(500, { message: 'Server Error' });

    const error = await client.listTasks().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(TaskDeletedError);
    expect(error).toMatchObject({ status: 500 });
  });

  it('throws ApiError when an error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 410 })));

    await expect(client.getTask(1)).rejects.toMatchObject({ name: 'ApiError', status: 410 });
  });
});
