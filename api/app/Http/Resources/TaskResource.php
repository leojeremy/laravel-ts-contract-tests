<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Task;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The response shape the TypeScript client consumes. It is mirrored by hand
 * in client/src/api.ts (`Task`) and pinned from both sides by the fixtures in
 * contracts/: renaming a key here fails tests/Feature/ContractTest.php.
 *
 * @mixin Task
 */
class TaskResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'title' => $this->title,
            'notes' => $this->notes,
            'status' => $this->status->value,
            'dueOn' => $this->due_on?->toDateString(),
            'locked' => $this->isLocked(),
            'createdAt' => $this->created_at->toIso8601String(),
            'updatedAt' => $this->updated_at->toIso8601String(),
        ];
    }
}
