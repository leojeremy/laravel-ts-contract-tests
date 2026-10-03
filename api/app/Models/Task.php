<?php

declare(strict_types=1);

namespace App\Models;

use App\Enums\TaskStatus;
use Database\Factories\TaskFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Carbon;

/**
 * @property int $id
 * @property string $title
 * @property string|null $notes
 * @property TaskStatus $status
 * @property Carbon|null $due_on
 * @property Carbon|null $locked_at
 * @property Carbon $created_at
 * @property Carbon $updated_at
 */
class Task extends Model
{
    /** @use HasFactory<TaskFactory> */
    use HasFactory;

    use SoftDeletes;

    protected $fillable = ['title', 'notes', 'status', 'due_on'];

    protected $attributes = ['status' => 'todo'];

    protected function casts(): array
    {
        return [
            'status' => TaskStatus::class,
            'due_on' => 'date',
            'locked_at' => 'datetime',
        ];
    }

    public function isLocked(): bool
    {
        return $this->locked_at !== null;
    }
}
