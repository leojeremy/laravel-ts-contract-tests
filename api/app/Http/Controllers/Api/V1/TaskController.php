<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTaskRequest;
use App\Http\Requests\UpdateTaskRequest;
use App\Http\Resources\TaskResource;
use App\Models\Task;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Status codes the client maps to typed errors (client/src/api.ts):
 *   404 → `null` from getTask(), 410 → TaskDeletedError,
 *   422 → ValidationError, 423 → TaskLockedError.
 */
class TaskController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        return TaskResource::collection(Task::query()->orderBy('id')->limit(100)->get());
    }

    public function show(int $task): TaskResource|JsonResponse
    {
        $model = $this->find($task);

        if ($model->trashed()) {
            return $this->deleted();
        }

        return new TaskResource($model);
    }

    public function store(StoreTaskRequest $request): JsonResponse
    {
        $task = Task::create($request->attributesForModel());

        return (new TaskResource($task->refresh()))->response()->setStatusCode(201);
    }

    public function update(UpdateTaskRequest $request, int $task): TaskResource|JsonResponse
    {
        $model = $this->find($task);

        if ($model->trashed()) {
            return $this->deleted();
        }

        if ($model->isLocked()) {
            return response()->json([
                'message' => 'This task is locked and cannot be changed.',
                'code' => 'task_locked',
            ], 423);
        }

        $model->update($request->attributesForModel());

        return new TaskResource($model->refresh());
    }

    private function find(int $id): Task
    {
        // withTrashed() so a deleted task answers 410 rather than 404.
        return Task::withTrashed()->find($id) ?? abort(404, 'Task not found.');
    }

    private function deleted(): JsonResponse
    {
        return response()->json([
            'message' => 'This task has been deleted.',
            'code' => 'task_deleted',
        ], 410);
    }
}
