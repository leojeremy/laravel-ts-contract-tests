<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Enums\TaskStatus;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreTaskRequest extends FormRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:200'],
            'notes' => ['nullable', 'string'],
            'status' => ['sometimes', Rule::enum(TaskStatus::class)],
            'dueOn' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    /**
     * The validated input with API names mapped to column names.
     *
     * @return array<string, mixed>
     */
    public function attributesForModel(): array
    {
        $data = $this->validated();

        if (array_key_exists('dueOn', $data)) {
            $data['due_on'] = $data['dueOn'];
            unset($data['dueOn']);
        }

        return $data;
    }
}
