<?php

declare(strict_types=1);

use Tests\Support\Contract;

function shape(string $json): mixed
{
    return json_decode($json, false, flags: JSON_THROW_ON_ERROR);
}

it('accepts identical shapes with different values', function (): void {
    expect(Contract::compare(
        shape('{"data": {"id": 1, "title": "a", "tags": ["x"], "due": null}}'),
        shape('{"data": {"id": 2, "title": "b", "tags": ["y", "z"], "due": null}}'),
        'doc',
    ))->toBe([]);
});

it('reports a renamed key as one missing and one unexpected key', function (): void {
    expect(Contract::compare(
        shape('{"data": {"dueOn": "2026-01-20"}}'),
        shape('{"data": {"dueDate": "2026-01-20"}}'),
        'doc',
    ))->toBe([
        'doc.data: missing key [dueOn]',
        'doc.data: unexpected key [dueDate]',
    ]);
});

it('reports a value whose JSON type changed', function (): void {
    expect(Contract::compare(
        shape('{"id": 1, "locked": false}'),
        shape('{"id": "1", "locked": 0}'),
        'doc',
    ))->toBe([
        'doc.id: expected number, got string',
        'doc.locked: expected boolean, got number',
    ]);
});

it('treats null as its own type, so a nullable field needs both cases captured', function (): void {
    expect(Contract::compare(shape('{"notes": "x"}'), shape('{"notes": null}'), 'doc'))
        ->toBe(['doc.notes: expected string, got null']);
});

it('compares list items index by index and falls back to the first item', function (): void {
    expect(Contract::compare(
        shape('[{"notes": "x"}, {"notes": null}]'),
        shape('[{"notes": "a"}, {"notes": null}, {"notes": "c", "extra": 1}]'),
        'list',
    ))->toBe(['list[2]: unexpected key [extra]']);
});

it('keeps an empty object distinct from an empty list', function (): void {
    expect(Contract::compare(shape('{"errors": {}}'), shape('{"errors": []}'), 'doc'))
        ->toBe(['doc.errors: expected object, got array']);
});
