<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

trait ChecksSchema
{
    protected function rememberSchemaCheck($key, $callback)
    {
        $cacheMinutes = (int)config('smartsearch.schema_cache_minutes', 10);
        $cacheMinutes = max(1, min(1440, $cacheMinutes));

        return (bool)Cache::remember(
            'smart_search.'.$key,
            Carbon::now()->addMinutes($cacheMinutes),
            $callback
        );
    }

    protected function threadsTableOk()
    {
        return $this->rememberSchemaCheck('threads_table_ok', function () {
            try {
                return Schema::hasTable('threads')
                    && Schema::hasColumn('threads', 'id')
                    && Schema::hasColumn('threads', 'conversation_id');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function threadsSearchOk()
    {
        return $this->rememberSchemaCheck('threads_search_ok', function () {
            try {
                return $this->threadsTableOk()
                    && Schema::hasColumn('threads', 'type')
                    && Schema::hasColumn('threads', 'state')
                    && Schema::hasColumn('threads', 'body');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function conversationCreatorColumnOk()
    {
        return $this->rememberSchemaCheck('conversation_creator_column_ok', function () {
            try {
                return Schema::hasTable('conversations')
                    && Schema::hasColumn('conversations', 'created_by_user_id');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function customFieldDefinitionsOk()
    {
        return $this->rememberSchemaCheck('custom_field_defs_ok', function () {
            try {
                return Schema::hasTable('custom_fields')
                    && Schema::hasColumn('custom_fields', 'id')
                    && Schema::hasColumn('custom_fields', 'name')
                    && Schema::hasColumn('custom_fields', 'mailbox_id')
                    && Schema::hasColumn('custom_fields', 'type')
                    && Schema::hasColumn('custom_fields', 'options');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function customFieldsOk()
    {
        return $this->rememberSchemaCheck('custom_fields_ok', function () {
            try {
                return $this->customFieldDefinitionsOk()
                    && Schema::hasTable('conversation_custom_field')
                    && Schema::hasColumn('conversation_custom_field', 'conversation_id')
                    && Schema::hasColumn('conversation_custom_field', 'custom_field_id')
                    && Schema::hasColumn('conversation_custom_field', 'value');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    /**
     * True when the Custom Fields module is installed/active and schema is usable.
     */
    protected function customFieldsModuleActive()
    {
        try {
            if (class_exists('\Module') && method_exists('\Module', 'isActive')) {
                // FreeScout Module::isActive() expects the module alias (lowercase).
                $active = \Module::isActive('customfields')
                    || \Module::isActive('CustomFields')
                    || \Module::isActive('Custom Fields');
                if (!$active) {
                    return false;
                }
            } elseif (!class_exists('Modules\CustomFields\Entities\CustomField')) {
                return false;
            }
            return $this->customFieldsOk();
        } catch (\Throwable $e) {
            return $this->customFieldsOk();
        }
    }

    protected function schemaOk()
    {
        return $this->rememberSchemaCheck('schema_ok', function () {
            try {
                $requiredColumns = [
                    'id',
                    'subject',
                    'status',
                    'state',
                    'updated_at',
                    'mailbox_id',
                    'user_id',
                    'customer_id',
                    'preview',
                    'customer_email',
                ];

                if (!Schema::hasTable('conversations')) {
                    return false;
                }

                foreach ($requiredColumns as $column) {
                    if (!Schema::hasColumn('conversations', $column)) {
                        return false;
                    }
                }

                return Schema::hasTable('customers')
                    && Schema::hasColumn('customers', 'id')
                    && Schema::hasColumn('customers', 'first_name')
                    && Schema::hasColumn('customers', 'last_name')
                    && Schema::hasColumn('customers', 'phones');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function foldersOk()
    {
        return $this->rememberSchemaCheck('folders_ok', function () {
            try {
                return Schema::hasTable('folders')
                    && Schema::hasColumn('folders', 'id')
                    && Schema::hasColumn('folders', 'mailbox_id')
                    && Schema::hasColumn('folders', 'type')
                    && Schema::hasColumn('folders', 'user_id')
                    && Schema::hasColumn('conversations', 'folder_id');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }

    protected function tagsOk()
    {
        return $this->rememberSchemaCheck('tags_ok', function () {
            try {
                return Schema::hasTable('tags')
                    && Schema::hasColumn('tags', 'id')
                    && Schema::hasColumn('tags', 'name')
                    && Schema::hasTable('conversation_tag')
                    && Schema::hasColumn('conversation_tag', 'conversation_id')
                    && Schema::hasColumn('conversation_tag', 'tag_id');
            } catch (\Throwable $e) {
                return false;
            }
        });
    }
}
