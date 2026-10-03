<?php

declare(strict_types=1);

use App\Enums\TaskStatus;
use App\Models\Task;
use Illuminate\Support\Carbon;
use Tests\Support\Contract;

/**
 * Pins every response the TypeScript client consumes (client/src/api.ts)
 * against the shared fixtures in contracts/. Each case seeds fixed data at a
 * frozen time, so `make contracts` re-captures byte-identical files unless
 * the API really changed.
 */
beforeEach(function (): void {
    $this->travelTo(Carbon::parse('2026-01-15 09:30:00', 'UTC'));

    // Two rows on purpose: one with every nullable field filled and one with
    // them null, so both cases are captured for the TypeScript side.
    Task::factory()->create([
        'title' => 'Write the contract test',
        'notes' => 'Both suites read contracts/*.json.',
        'status' => TaskStatus::Doing,
        'due_on' => '2026-01-20',
    ]);
    Task::factory()->create([
        'title' => 'Ship it',
        'notes' => null,
        'status' => TaskStatus::Todo,
        'due_on' => null,
    ]);
});

it('lists tasks', function (): void {
    $response = $this->getJson('/api/v1/tasks')->assertOk();

    Contract::check('tasks.index', $response);
});

it('shows one task', function (): void {
    $response = $this->getJson('/api/v1/tasks/1')->assertOk();

    Contract::check('tasks.show', $response);
});

it('creates a task', function (): void {
    $response = $this->postJson('/api/v1/tasks', [
        'title' => 'Review the diff',
        'dueOn' => '2026-02-01',
    ])->assertCreated();

    Contract::check('tasks.store', $response);
});

it('updates a task', function (): void {
    $response = $this->patchJson('/api/v1/tasks/2', ['status' => 'done'])->assertOk();

    expect($response->json('data.status'))->toBe('done');
    Contract::check('tasks.update', $response);
});

it('answers 404 for a task that never existed', function (): void {
    $this->getJson('/api/v1/tasks/999')->assertNotFound();
});

it('answers 410 with a typed body for a deleted task', function (): void {
    Task::findOrFail(2)->delete();

    $response = $this->getJson('/api/v1/tasks/2')->assertGone();

    expect($response->json('code'))->toBe('task_deleted');
    Contract::check('error.deleted', $response);
});

it('answers 423 with a typed body for a locked task', function (): void {
    Task::findOrFail(1)->forceFill(['locked_at' => now()])->save();

    $response = $this->patchJson('/api/v1/tasks/1', ['title' => 'Renamed'])->assertStatus(423);

    expect($response->json('code'))->toBe('task_locked')
        ->and(Task::findOrFail(1)->title)->toBe('Write the contract test');
    Contract::check('error.locked', $response);
});

it('answers 422 with field errors for invalid input', function (): void {
    $response = $this->postJson('/api/v1/tasks', ['status' => 'someday', 'dueOn' => '20/01/2026'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['title', 'status', 'dueOn']);

    Contract::check('error.validation', $response);
});
