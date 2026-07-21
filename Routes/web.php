<?php

use Illuminate\Support\Facades\Route;

Route::group(['prefix' => \Helper::getSubdirectory(), 'middleware' => ['web', 'auth']], function () {
    Route::get('/smart-search', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@index')
        ->name('smartsearch.search');

    // Lightweight autosuggest for the topbar input.
    Route::get('/smart-search/suggest', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@suggest')
        ->name('smartsearch.suggest');

    // Dynamic mailbox-specific custom field list for the search form.
    Route::get('/smart-search/fields', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@fields')
        ->name('smartsearch.fields');
    // Refresh metadata for recent-search conversation shortcuts.
    Route::get('/smart-search/recent-meta', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@recentMeta')
        ->name('smartsearch.recent_meta');

    // Bulk actions for selected Smart Search results.
    Route::post('/smart-search/bulk', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@bulk')
        ->name('smartsearch.bulk');

    // Per-user saved filter presets (stored via Option API, no migration).
    Route::get('/smart-search/presets', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@presetsIndex')
        ->name('smartsearch.presets.index');
    Route::post('/smart-search/presets', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@presetsStore')
        ->name('smartsearch.presets.store');
    // POST instead of DELETE: many local stacks (Apache/nginx) return 405 for DELETE.
    Route::post('/smart-search/presets/{id}/delete', 'Modules\\SmartSearch\\Http\\Controllers\\SmartSearchController@presetsDestroy')
        ->where('id', '[A-Za-z0-9_\\.-]+')
        ->name('smartsearch.presets.destroy');
});
