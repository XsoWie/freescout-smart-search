<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Conversation;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

trait ResolvesExactMatches
{
    /**
     * Normalize an exact numeric query into an integer.
     *
     * Plain digits prefer the internal conversation ID. A # prefix prefers
     * FreeScout's display conversation number. Thread IDs remain a fallback.
     */
    protected function normalizeTicketNumberExact(string $q)
    {
        $q = trim($q);
        if ($q === '') {
            return null;
        }

        // Remove common wrappers/prefixes.
        $q2 = preg_replace('/^[\s\[#\(]+/', '', $q) ?? '';
        $q2 = preg_replace('/[\]\)\s]+$/', '', $q2) ?? '';

        if (!preg_match('/^\d{1,12}$/', $q2)) {
            return null;
        }
        $n = (int)$q2;
        return $n > 0 ? $n : null;
    }

    protected function isDisplayNumberQuery(string $q)
    {
        return (bool)preg_match('/^\s*[\[\(]?\s*#\s*\d{1,12}\s*[\]\)]?\s*$/', trim($q));
    }

    protected function conversationNumberFieldName()
    {
        $field = 'number';
        try {
            if (method_exists(Conversation::class, 'numberFieldName')) {
                $candidate = (string)Conversation::numberFieldName();
                if (preg_match('/^[a-z][a-z0-9_]*$/i', $candidate)
                    && Schema::hasColumn('conversations', $candidate)
                ) {
                    $field = $candidate;
                }
            }
        } catch (\Throwable $e) {
            $field = 'number';
        }

        if (!preg_match('/^[a-z][a-z0-9_]*$/i', $field)) {
            return null;
        }

        try {
            return Schema::hasColumn('conversations', $field) ? $field : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * Strict numeric query heuristic.
     * Treat plain numeric input and common wrappers as an intentional "go to conversation" lookup.
     */
    protected function isStrictNumericQuery(string $q)
    {
        $q = trim($q);
        if ($q === '') {
            return false;
        }
        // Allow: 123, #123, [#123], (123)
        return (bool)preg_match('/^\s*[\[#\(]*\s*\d{1,12}\s*[\]\)]*\s*$/', $q);
    }

    /**
     * Deterministically resolve a numeric query to the correct conversation.
     * Plain digits prefer conversations.id; #digits prefer FreeScout's display number.
     * A matching thread ID is accepted as the final backward-compatible fallback.
     */
    protected function resolveNumericConversation(
        int $number,
        array $mailboxIds,
        string $inPlaceholders,
        array $statuses = [],
        int $folderId = 0,
        array $assigneeIds = [],
        int $assignedOnlyUserId = 0,
        bool $preferDisplayNumber = false
    ) {
        try {
            $filter = $this->buildExactConversationFilterSql(
                $statuses,
                $folderId,
                $assigneeIds,
                $assignedOnlyUserId
            );

            $lookups = $preferDisplayNumber ? ['number', 'id'] : ['id', 'number'];
            foreach ($lookups as $lookup) {
                if ($lookup === 'id') {
                    $row = $this->fetchExactConversationById(
                        $number,
                        $mailboxIds,
                        $inPlaceholders,
                        (string)$filter['sql'],
                        (array)$filter['bindings']
                    );
                } else {
                    $row = $this->fetchExactConversationByNumber(
                        $number,
                        $mailboxIds,
                        $inPlaceholders,
                        (string)$filter['sql'],
                        (array)$filter['bindings']
                    );
                }

                if ($row !== null && $this->canViewConversationId((int)$row['id'])) {
                    return $row;
                }
            }

            // A thread ID is also accepted for backward compatibility.
            if ($this->threadsTableOk()) {
                $thread = DB::selectOne(
                    'SELECT conversation_id FROM threads WHERE id = ? LIMIT 1',
                    [$number]
                );
                $conversationId = $thread ? (int)($thread->conversation_id ?? 0) : 0;
                if ($conversationId > 0) {
                    $row = $this->fetchExactConversationById(
                        $conversationId,
                        $mailboxIds,
                        $inPlaceholders,
                        (string)$filter['sql'],
                        (array)$filter['bindings']
                    );
                    if ($row !== null && $this->canViewConversationId((int)$row['id'])) {
                        return $row;
                    }
                }
            }
        } catch (\Throwable $e) {
            // Fall through to normal text search.
        }

        return null;
    }

    protected function buildExactConversationFilterSql(array $statuses, int $folderId, array $assigneeIds = [], int $assignedOnlyUserId = 0)
    {
        $sql = '';
        $bindings = [];

        $statusFilter = $this->buildStatusFilterSql($statuses);
        if ($statusFilter['sql'] !== '') {
            $sql .= $statusFilter['sql'];
            $bindings = array_merge($bindings, $statusFilter['bindings']);
        }

        if ($folderId) {
            $sql .= ' AND c.folder_id = ?';
            $bindings[] = $folderId;
        }

        $assigneeFilter = $this->buildAssigneeFilterSql($assigneeIds);
        if ($assigneeFilter['sql'] !== '') {
            $sql .= $assigneeFilter['sql'];
            $bindings = array_merge($bindings, $assigneeFilter['bindings']);
        }

        $visibility = $this->buildAssignedVisibilitySql($assignedOnlyUserId, 'c');
        $sql .= (string)$visibility['sql'];
        $bindings = array_merge($bindings, (array)$visibility['bindings']);

        return [
            'sql' => $sql,
            'bindings' => $bindings,
        ];
    }

    protected function fetchExactConversationById(int $conversationId, array $mailboxIds, string $inPlaceholders, string $extraSql = '', array $extraBindings = [])
    {
        $row = DB::select(
            "SELECT c.id, c.subject, c.mailbox_id, c.status, c.state, c.updated_at\n".
            "FROM conversations c\n".
            "WHERE c.mailbox_id IN ($inPlaceholders) AND c.id = ?".$extraSql."\n".
            "LIMIT 1",
            array_merge($mailboxIds, [$conversationId], $extraBindings)
        );

        if (empty($row)) {
            return null;
        }

        $r = $row[0];
        return [
            'id' => (int)$r->id,
            'subject' => (string)$r->subject,
            'mailbox_id' => (int)$r->mailbox_id,
            'status' => (int)$r->status,
            'state' => isset($r->state) ? (int)$r->state : 0,
            'updated_at' => (string)$r->updated_at,
        ];
    }

    protected function fetchExactConversationByNumber(int $number, array $mailboxIds, string $inPlaceholders, string $extraSql = '', array $extraBindings = [])
    {
        $numberField = $this->conversationNumberFieldName();
        if (!$numberField) {
            return null;
        }

        $rows = DB::select(
            "SELECT c.id, c.subject, c.mailbox_id, c.status, c.state, c.updated_at\n".
            "FROM conversations c\n".
            "WHERE c.mailbox_id IN ($inPlaceholders) AND c.$numberField = ?".$extraSql."\n".
            "LIMIT 1",
            array_merge($mailboxIds, [$number], $extraBindings)
        );

        if (empty($rows)) {
            return null;
        }

        $row = $rows[0];
        return [
            'id' => (int)$row->id,
            'subject' => (string)$row->subject,
            'mailbox_id' => (int)$row->mailbox_id,
            'status' => (int)$row->status,
            'state' => isset($row->state) ? (int)$row->state : 0,
            'updated_at' => (string)$row->updated_at,
        ];
    }

    /**
     * @param int[] $allowedCfIds
     * @return array{key:string,order_by:string,join_sql:string,bindings:array}
     */
    protected function resolveSort(string $sort, array $allowedCfIds = [])
    {
        $sort = trim(strtolower($sort));
        if (preg_match('/^cf_(\d+)_(asc|desc)$/', $sort, $m)) {
            $fieldId = (int)$m[1];
            $allowedCfIds = array_values(array_unique(array_map('intval', $allowedCfIds)));
            if ($fieldId > 0 && in_array($fieldId, $allowedCfIds, true) && $this->customFieldsOk()) {
                $dir = $m[2] === 'asc' ? 'ASC' : 'DESC';
                return [
                    'key' => 'cf_'.$fieldId.'_'.$m[2],
                    'order_by' => 'ccf_sort.value '.$dir.', c.id '.$dir,
                    'join_sql' => ' LEFT JOIN conversation_custom_field ccf_sort ON ccf_sort.conversation_id = c.id AND ccf_sort.custom_field_id = ?',
                    'bindings' => [$fieldId],
                ];
            }
        }

        $key = $this->normalizeSort($sort);
        return [
            'key' => $key,
            'order_by' => $this->sortToOrderBy($key),
            'join_sql' => '',
            'bindings' => [],
        ];
    }

    protected function normalizeSort(string $sort)
    {
        $sort = trim(strtolower($sort));
        $allowed = ['updated_desc', 'updated_asc', 'created_desc', 'created_asc', 'id_desc', 'id_asc'];
        return in_array($sort, $allowed, true) ? $sort : 'updated_desc';
    }

    /**
     * Convert sort key into a safe ORDER BY clause.
     */
    protected function sortToOrderBy(string $sort)
    {
        switch ($sort) {
            case 'updated_asc':
                return 'c.updated_at ASC, c.id ASC';
            case 'created_desc':
                return 'c.created_at DESC, c.id DESC';
            case 'created_asc':
                return 'c.created_at ASC, c.id ASC';
            case 'id_desc':
                return 'c.id DESC';
            case 'id_asc':
                return 'c.id ASC';
            case 'updated_desc':
            default:
                return 'c.updated_at DESC, c.id DESC';
        }
    }

    protected function buildAssignedVisibilitySql(int $assignedOnlyUserId, string $alias = 'c')
    {
        if ($assignedOnlyUserId <= 0) {
            return ['sql' => '', 'bindings' => []];
        }

        if (!preg_match('/^[a-z][a-z0-9_]*$/i', $alias)) {
            $alias = 'c';
        }

        $bindings = [$assignedOnlyUserId];
        $conditions = [$alias.'.user_id = ?'];
        if ($this->conversationCreatorColumnOk()) {
            $conditions[] = $alias.'.created_by_user_id = ?';
            $bindings[] = $assignedOnlyUserId;
        }

        $result = [
            'sql' => ' AND ('.implode(' OR ', $conditions).')',
            'bindings' => $bindings,
        ];

        // Assignment modules may extend this condition without a core edit.
        try {
            $filtered = \Eventy::filter(
                'smartsearch.assigned_visibility_sql',
                $result,
                Auth::user(),
                $alias
            );
            if (is_array($filtered)
                && isset($filtered['sql'], $filtered['bindings'])
                && is_string($filtered['sql'])
                && is_array($filtered['bindings'])
            ) {
                $result = $filtered;
            }
        } catch (\Throwable $e) {
            // Keep the safe core condition.
        }

        return $result;
    }

    protected function sanitizeSearchString($value)
    {
        $value = (string)$value;

        try {
            if (class_exists('Helper') && method_exists('Helper', 'sqlSanitizeString')) {
                $value = \Helper::sqlSanitizeString($value);
            } else {
                $value = str_replace("\0", '', $value);
            }
        } catch (\Throwable $e) {
            $value = str_replace("\0", '', $value);
        }

        return trim($value);
    }
}
