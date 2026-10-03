/**
 * Typed client for the tasks API (api/routes/api.php).
 *
 * The interfaces below are written by hand. They mirror
 * api/app/Http/Resources/TaskResource.php and the controller's error
 * bodies, and are pinned to them from both sides by the JSON fixtures in
 * contracts/: the API's Pest suite checks real responses against the
 * fixtures, and tests/contract.test.ts checks the fixtures against these
 * types. A shape change on either side fails one of the two suites.
 */

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: number;
  title: string;
  notes: string | null;
  status: TaskStatus;
  /** Calendar date, `YYYY-MM-DD`. */
  dueOn: string | null;
  locked: boolean;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface TaskResponse {
  data: Task;
}

export interface TaskListResponse {
  data: Task[];
}

/** Body of a 410 or 423 answer. */
export interface ErrorBody {
  message: string;
  code: string;
}

/** Body of a 422 answer: Laravel's validation error format. */
export interface ValidationErrorBody {
  message: string;
  errors: Record<string, string[]>;
}

export interface NewTask {
  title: string;
  notes?: string | null;
  status?: TaskStatus;
  dueOn?: string | null;
}

export type TaskPatch = Partial<NewTask>;

/** Any answer the client has no more specific error for. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 410: the task existed but has been deleted. Retrying will not help. */
export class TaskDeletedError extends ApiError {
  constructor(readonly body: ErrorBody) {
    super(410, body.message);
    this.name = 'TaskDeletedError';
  }
}

/** 423: the task is locked and the change was refused. */
export class TaskLockedError extends ApiError {
  constructor(readonly body: ErrorBody) {
    super(423, body.message);
    this.name = 'TaskLockedError';
  }
}

/** 422: the input was rejected; `errors` is keyed by request field. */
export class ValidationError extends ApiError {
  readonly errors: Record<string, string[]>;

  constructor(body: ValidationErrorBody) {
    super(422, body.message);
    this.name = 'ValidationError';
    this.errors = body.errors;
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetch?: typeof fetch;
}

export interface TasksClient {
  listTasks(): Promise<Task[]>;
  /** Resolves to `null` when the task never existed (404). */
  getTask(id: number): Promise<Task | null>;
  createTask(input: NewTask): Promise<Task>;
  updateTask(id: number, patch: TaskPatch): Promise<Task>;
}

export function createClient(options: ClientOptions): TasksClient {
  const base = options.baseUrl.replace(/\/+$/, '');
  // Read `fetch` at call time so tests can stub the global after creating a client.
  const doFetch: typeof fetch = (input, init) => (options.fetch ?? fetch)(input, init);

  async function request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const init: RequestInit = { method, headers };

    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await doFetch(`${base}/api/v1${path}`, init);

    if (response.status === 404) return null;
    if (response.status === 410) throw new TaskDeletedError(await readJson<ErrorBody>(response));
    if (response.status === 422) throw new ValidationError(await readJson<ValidationErrorBody>(response));
    if (response.status === 423) throw new TaskLockedError(await readJson<ErrorBody>(response));
    if (!response.ok) {
      throw new ApiError(response.status, `${method} ${path} failed: HTTP ${response.status}`);
    }

    return readJson<T>(response);
  }

  async function required<T>(method: string, path: string, body?: unknown): Promise<T> {
    const result = await request<T>(method, path, body);

    if (result === null) {
      throw new ApiError(404, `${method} ${path} failed: HTTP 404`);
    }

    return result;
  }

  return {
    async listTasks() {
      return (await required<TaskListResponse>('GET', '/tasks')).data;
    },
    async getTask(id) {
      return (await request<TaskResponse>('GET', `/tasks/${id}`))?.data ?? null;
    },
    async createTask(input) {
      return (await required<TaskResponse>('POST', '/tasks', input)).data;
    },
    async updateTask(id, patch) {
      return (await required<TaskResponse>('PATCH', `/tasks/${id}`, patch)).data;
    },
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, `Expected JSON, got: ${text.slice(0, 100)}`);
  }
}
