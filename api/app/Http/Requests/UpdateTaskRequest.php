<?php

declare(strict_types=1);

namespace App\Http\Requests;

class UpdateTaskRequest extends StoreTaskRequest
{
    /** @return array<string, mixed> */
    public function rules(): array
    {
        $rules = parent::rules();
        $rules['title'] = ['sometimes', 'string', 'max:200'];

        return $rules;
    }
}
