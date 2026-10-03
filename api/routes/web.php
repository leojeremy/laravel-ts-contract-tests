<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json(['tasks' => url('/api/v1/tasks')]));
