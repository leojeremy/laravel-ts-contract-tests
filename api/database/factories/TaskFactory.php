<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Task>
 */
class TaskFactory extends Factory
{
    protected $model = Task::class;

    public function definition(): array
    {
        return [
            'title' => fake()->sentence(4),
            'notes' => fake()->optional()->paragraph(),
            'status' => TaskStatus::Todo,
            'due_on' => null,
        ];
    }

    public function locked(): static
    {
        return $this->state(fn (): array => ['locked_at' => now()]);
    }
}
