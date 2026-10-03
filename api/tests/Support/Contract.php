<?php

declare(strict_types=1);

namespace Tests\Support;

use Illuminate\Testing\TestResponse;
use JsonException;
use PHPUnit\Framework\Assert;
use stdClass;

/**
 * Two-sided contract fixtures.
 *
 * The JSON files in contracts/ (repo root) are real responses from this API,
 * captured by the feature tests. The TypeScript client's Vitest suite reads
 * the same files, so:
 *
 *   - rename or drop a key here and `Contract::check()` fails in Pest;
 *   - re-capture the fixtures without updating the client and `tsc` / Vitest
 *     fail on the TypeScript side.
 *
 * Normal runs only VERIFY. Set UPDATE_CONTRACTS=1 to (re)write the fixtures
 * from the current responses, then review the diff like any other code.
 */
final class Contract
{
    public static function directory(): string
    {
        return dirname(base_path()).'/contracts';
    }

    public static function updating(): bool
    {
        return getenv('UPDATE_CONTRACTS') === '1';
    }

    public static function check(string $name, TestResponse $response): void
    {
        $actual = self::decode((string) $response->getContent(), "response for [{$name}]");
        $file = self::directory()."/{$name}.json";

        if (self::updating()) {
            file_put_contents($file, self::encode($actual));
            Assert::assertFileExists($file);

            return;
        }

        Assert::assertFileExists($file, "Contract fixture [{$name}] is missing. Run `make contracts` to capture it.");

        $expected = self::decode((string) file_get_contents($file), "fixture [{$name}]");
        $problems = self::compare($expected, $actual, $name);

        Assert::assertSame([], $problems, "Response drifted from contracts/{$name}.json:\n  ".implode("\n  ", $problems));
    }

    /**
     * Compares the SHAPE of two decoded JSON documents: the exact key set of
     * every object (missing and unexpected keys both count), and the JSON
     * type of every value. Values themselves are not compared.
     *
     * List items are compared index by index; items beyond the fixture's
     * length are compared against its first item. An empty fixture list
     * pins nothing about its items, so capture fixtures with seeded data.
     *
     * @return list<string> one line per problem, empty when the shapes match
     */
    public static function compare(mixed $expected, mixed $actual, string $path): array
    {
        $expectedType = self::type($expected);
        $actualType = self::type($actual);

        if ($expectedType !== $actualType) {
            return ["{$path}: expected {$expectedType}, got {$actualType}"];
        }

        if ($expected instanceof stdClass && $actual instanceof stdClass) {
            $expectedKeys = array_keys(get_object_vars($expected));
            $actualKeys = array_keys(get_object_vars($actual));
            $problems = [];

            foreach (array_diff($expectedKeys, $actualKeys) as $key) {
                $problems[] = "{$path}: missing key [{$key}]";
            }

            foreach (array_diff($actualKeys, $expectedKeys) as $key) {
                $problems[] = "{$path}: unexpected key [{$key}]";
            }

            foreach (array_intersect($expectedKeys, $actualKeys) as $key) {
                array_push($problems, ...self::compare($expected->{$key}, $actual->{$key}, "{$path}.{$key}"));
            }

            return $problems;
        }

        if (is_array($expected) && is_array($actual) && $expected !== []) {
            $problems = [];

            foreach ($actual as $index => $item) {
                array_push($problems, ...self::compare($expected[$index] ?? $expected[0], $item, "{$path}[{$index}]"));
            }

            return $problems;
        }

        return [];
    }

    private static function type(mixed $value): string
    {
        return match (true) {
            $value === null => 'null',
            is_bool($value) => 'boolean',
            is_int($value), is_float($value) => 'number',
            is_string($value) => 'string',
            is_array($value) => 'array',
            default => 'object',
        };
    }

    private static function decode(string $json, string $what): mixed
    {
        try {
            // Objects stay stdClass so `{}` and `[]` remain distinguishable.
            return json_decode($json, false, flags: JSON_THROW_ON_ERROR);
        } catch (JsonException $e) {
            Assert::fail("The {$what} is not valid JSON: {$e->getMessage()}");
        }
    }

    private static function encode(mixed $value): string
    {
        return json_encode($value, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)."\n";
    }
}
