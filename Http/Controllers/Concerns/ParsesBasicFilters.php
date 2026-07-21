<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Conversation;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

trait ParsesBasicFilters
{
    /**
     * Multi-assignee filter (OR). Accepts assignee_id[] or legacy scalar assignee_id.
     * Values: -1 = unassigned, >0 = user id. Empty = any assignee.
     *
     * @return int[]
     */
    protected function parseAssigneeFilter(Request $request, array $assignees)
    {
        $raw = $request->input('assignee_id', null);
        if ($raw === null) {
            return [];
        }
        if (!is_array($raw)) {
            $raw = [$raw];
        }

        $allowed = [];
        foreach ($assignees as $assignee) {
            $id = (int)($assignee['id'] ?? 0);
            if ($id > 0) {
                $allowed[$id] = true;
            }
        }

        $out = [];
        foreach ($raw as $value) {
            $id = (int)$value;
            if ($id === 0) {
                continue;
            }
            if ($id === -1) {
                $out[-1] = -1;
                continue;
            }
            if ($id > 0 && isset($allowed[$id])) {
                $out[$id] = $id;
            }
        }

        return array_values($out);
    }

    /**
     * Build SQL fragment for multi-assignee OR filter.
     *
     * @param int[] $assigneeIds
     * @return array{sql:string,bindings:array}
     */
    protected function buildAssigneeFilterSql(array $assigneeIds)
    {
        $userIds = [];
        $includeUnassigned = false;
        foreach ($assigneeIds as $id) {
            $id = (int)$id;
            if ($id === -1) {
                $includeUnassigned = true;
            } elseif ($id > 0) {
                $userIds[$id] = $id;
            }
        }
        $userIds = array_values($userIds);

        if (!count($userIds) && !$includeUnassigned) {
            return ['sql' => '', 'bindings' => []];
        }

        if (!count($userIds) && $includeUnassigned) {
            return [
                'sql' => ' AND (c.user_id IS NULL OR c.user_id <= 0)',
                'bindings' => [],
            ];
        }

        $in = implode(',', array_fill(0, count($userIds), '?'));
        if ($includeUnassigned) {
            return [
                'sql' => " AND (c.user_id IN ($in) OR c.user_id IS NULL OR c.user_id <= 0)",
                'bindings' => $userIds,
            ];
        }

        return [
            'sql' => " AND c.user_id IN ($in)",
            'bindings' => $userIds,
        ];
    }

    /**
     * Parse status filter from request.
     * Accepts status[] array or legacy single status int.
     * Empty / [-1] => no status filter.
     *
     * @return array
     */
    protected function parseStatusFilter(Request $request)
    {
        $statusOptions = $this->statusOptions();
        $raw = $request->input('status', null);
        if ($raw === null) {
            return [];
        }
        if (!is_array($raw)) {
            $raw = [$raw];
        }

        $out = [];
        foreach ($raw as $value) {
            $code = (int)$value;
            if ($code === -1) {
                continue;
            }
            if (array_key_exists($code, $statusOptions)) {
                $out[$code] = $code;
            }
        }

        return array_values($out);
    }

    /**
     * Allowed relative date presets (resolved to absolute Y-m-d range).
     *
     * @return string[]
     */
    protected function datePresetKeys()
    {
        return [
            'today',
            'yesterday',
            'last_7_days',
            'last_30_days',
            'this_month',
            'last_month',
        ];
    }

    /**
     * Resolve a relative date preset to [date_from, date_to] (Y-m-d).
     * Empty / unknown preset => ['', ''].
     *
     * @return array{0:string,1:string}
     */
    protected function resolveDatePreset($preset, Carbon $now = null)
    {
        $preset = strtolower(trim((string)$preset));
        if ($preset === '' || !in_array($preset, $this->datePresetKeys(), true)) {
            return ['', ''];
        }

        if (!$now) {
            $now = Carbon::now();
        }
        $today = $now->copy()->startOfDay();

        switch ($preset) {
            case 'today':
                $from = $today->copy();
                $to = $today->copy();
                break;
            case 'yesterday':
                $from = $today->copy()->subDay();
                $to = $from->copy();
                break;
            case 'last_7_days':
                // Inclusive: today and the previous 6 days.
                $to = $today->copy();
                $from = $today->copy()->subDays(6);
                break;
            case 'last_30_days':
                $to = $today->copy();
                $from = $today->copy()->subDays(29);
                break;
            case 'this_month':
                $from = $today->copy()->startOfMonth();
                $to = $today->copy();
                break;
            case 'last_month':
                // Carbon 1.x compatible (no subMonthNoOverflow).
                $from = $today->copy()->startOfMonth()->subMonth();
                $to = $from->copy()->endOfMonth();
                break;
            default:
                return ['', ''];
        }

        return [$from->format('Y-m-d'), $to->format('Y-m-d')];
    }

    /**
     * @param array<int, array{id:int,name:string}> $tags
     * @return array{
     *   date_field:string,
     *   date_preset:string,
     *   date_from:string,
     *   date_to:string,
     *   tag_ids:int[],
     *   customer_q:string,
     *   has_attachments:?string,
     *   waiting_reply:string,
     *   search_in:string[]
     * }
     */
    protected function parseAdvancedFilters(Request $request, array $tags = [])
    {
        $dateField = strtolower(trim((string)$request->get('date_field', 'updated')));
        if (!in_array($dateField, ['updated', 'created'], true)) {
            $dateField = 'updated';
        }

        $datePreset = strtolower(trim((string)$request->get('date_preset', '')));
        if (!in_array($datePreset, $this->datePresetKeys(), true)) {
            $datePreset = '';
        }

        $dateFrom = $this->normalizeDateInput((string)$request->get('date_from', ''));
        $dateTo = $this->normalizeDateInput((string)$request->get('date_to', ''));

        // Relative preset wins over absolute inputs when set.
        if ($datePreset !== '') {
            list($dateFrom, $dateTo) = $this->resolveDatePreset($datePreset);
        }
        $allowedTagIds = [];
        foreach ($tags as $tag) {
            $allowedTagIds[(int)$tag['id']] = true;
        }
        $tagIds = [];
        foreach ((array)$request->input('tag_ids', []) as $raw) {
            $id = (int)$raw;
            if ($id > 0 && isset($allowedTagIds[$id])) {
                $tagIds[] = $id;
            }
        }
        $tagIds = array_values(array_unique($tagIds));

        $customerQ = $this->sanitizeSearchString(trim((string)$request->get('customer_q', '')));

        $hasAttachments = $request->get('has_attachments', '');
        if ($hasAttachments === null || $hasAttachments === '') {
            $hasAttachments = '';
        } else {
            $hasAttachments = ((string)$hasAttachments === '1') ? '1' : (((string)$hasAttachments === '0') ? '0' : '');
        }
        if ($hasAttachments !== '' && !Schema::hasColumn('conversations', 'has_attachments')) {
            $hasAttachments = '';
        }

        $waitingReply = strtolower(trim((string)$request->get('waiting_reply', '')));
        if (!in_array($waitingReply, ['customer', 'user'], true)) {
            $waitingReply = '';
        }
        if ($waitingReply !== '' && !Schema::hasColumn('conversations', 'last_reply_from')) {
            $waitingReply = '';
        }

        $allowedScopes = ['subject' => true, 'messages' => true, 'notes' => true];
        $searchIn = [];
        if ($request->has('search_in')) {
            foreach ((array)$request->input('search_in', []) as $scope) {
                $scope = strtolower(trim((string)$scope));
                if (isset($allowedScopes[$scope])) {
                    $searchIn[] = $scope;
                }
            }
            $searchIn = array_values(array_unique($searchIn));
        }
        if (!count($searchIn)) {
            $searchIn = ['subject', 'messages', 'notes'];
        }

        return [
            'date_field' => $dateField,
            'date_preset' => $datePreset,
            'date_from' => $dateFrom,
            'date_to' => $dateTo,
            'tag_ids' => $tagIds,
            'customer_q' => $customerQ,
            'has_attachments' => $hasAttachments,
            'waiting_reply' => $waitingReply,
            'search_in' => $searchIn,
        ];
    }

    protected function normalizeDateInput(string $value)
    {
        $value = trim($value);
        if ($value === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return '';
        }
        try {
            $dt = Carbon::createFromFormat('Y-m-d', $value);
            if (!$dt || $dt->format('Y-m-d') !== $value) {
                return '';
            }
            return $value;
        } catch (\Throwable $e) {
            return '';
        }
    }

    protected function advancedFiltersActive(array $advanced)
    {
        if (($advanced['date_preset'] ?? '') !== '') {
            return true;
        }
        if (($advanced['date_from'] ?? '') !== '' || ($advanced['date_to'] ?? '') !== '') {
            return true;
        }
        if (!empty($advanced['tag_ids'])) {
            return true;
        }
        if (($advanced['customer_q'] ?? '') !== '') {
            return true;
        }
        if (($advanced['has_attachments'] ?? '') !== '') {
            return true;
        }
        if (($advanced['waiting_reply'] ?? '') !== '') {
            return true;
        }
        $searchIn = (array)($advanced['search_in'] ?? []);
        sort($searchIn);
        if ($searchIn && $searchIn !== ['messages', 'notes', 'subject']) {
            return true;
        }
        if (($advanced['date_field'] ?? 'updated') === 'created'
            && (($advanced['date_from'] ?? '') !== '' || ($advanced['date_to'] ?? '') !== '')
        ) {
            return true;
        }
        return false;
    }

    /**
     * @return array{sql:string,bindings:array,needs_customer_join:bool}
     */
    protected function buildAdvancedFilterSql(array $advanced, string $op = 'LIKE', string $fullNameExpr = '')
    {
        $sql = '';
        $bindings = [];
        $needsCustomerJoin = false;

        $dateField = (($advanced['date_field'] ?? 'updated') === 'created') ? 'created_at' : 'updated_at';
        if (!Schema::hasColumn('conversations', $dateField)) {
            $dateField = 'updated_at';
        }
        $dateFrom = (string)($advanced['date_from'] ?? '');
        $dateTo = (string)($advanced['date_to'] ?? '');
        if ($dateFrom !== '') {
            $sql .= " AND c.$dateField >= ?";
            $bindings[] = $dateFrom.' 00:00:00';
        }
        if ($dateTo !== '') {
            $sql .= " AND c.$dateField <= ?";
            $bindings[] = $dateTo.' 23:59:59';
        }

        $tagIds = array_values(array_unique(array_map('intval', (array)($advanced['tag_ids'] ?? []))));
        $tagIds = array_values(array_filter($tagIds, function ($id) {
            return $id > 0;
        }));
        if (count($tagIds) && $this->tagsOk()) {
            $placeholders = implode(',', array_fill(0, count($tagIds), '?'));
            $sql .= " AND EXISTS (
                    SELECT 1 FROM conversation_tag ct
                    WHERE ct.conversation_id = c.id
                      AND ct.tag_id IN ($placeholders)
                )";
            $bindings = array_merge($bindings, $tagIds);
        }

        $hasAttachments = (string)($advanced['has_attachments'] ?? '');
        if ($hasAttachments === '1' && Schema::hasColumn('conversations', 'has_attachments')) {
            $sql .= ' AND c.has_attachments = 1';
        } elseif ($hasAttachments === '0' && Schema::hasColumn('conversations', 'has_attachments')) {
            $sql .= ' AND (c.has_attachments = 0 OR c.has_attachments IS NULL)';
        }

        $waitingReply = (string)($advanced['waiting_reply'] ?? '');
        if ($waitingReply !== '' && Schema::hasColumn('conversations', 'last_reply_from')) {
            $personCustomer = defined(Conversation::class.'::PERSON_CUSTOMER')
                ? (int)constant(Conversation::class.'::PERSON_CUSTOMER')
                : 1;
            $personUser = defined(Conversation::class.'::PERSON_USER')
                ? (int)constant(Conversation::class.'::PERSON_USER')
                : 2;
            if ($waitingReply === 'customer') {
                $sql .= ' AND c.last_reply_from = ?';
                $bindings[] = $personCustomer;
            } elseif ($waitingReply === 'user') {
                $sql .= ' AND c.last_reply_from = ?';
                $bindings[] = $personUser;
            }
        }

        $customerQ = trim((string)($advanced['customer_q'] ?? ''));
        if ($customerQ !== '') {
            $needsCustomerJoin = true;
            if ($fullNameExpr === '') {
                $driver = null;
                try {
                    $driver = DB::connection()->getDriverName();
                } catch (\Throwable $e) {
                    $driver = null;
                }
                $fullNameExpr = in_array($driver, ['pgsql', 'sqlite'], true)
                    ? "COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')"
                    : "CONCAT(COALESCE(cu.first_name,''), ' ', COALESCE(cu.last_name,''))";
                if ($driver === 'pgsql') {
                    $op = 'ILIKE';
                }
            }
            $like = '%'.$customerQ.'%';
            $sql .= " AND (
                    COALESCE(c.customer_email,'') $op ?
                    OR COALESCE(cu.first_name,'') $op ?
                    OR COALESCE(cu.last_name,'') $op ?
                    OR $fullNameExpr $op ?
                    OR COALESCE(cu.phones,'') $op ?
                )";
            $bindings = array_merge($bindings, [$like, $like, $like, $like, $like]);
        }

        return [
            'sql' => $sql,
            'bindings' => $bindings,
            'needs_customer_join' => $needsCustomerJoin,
        ];
    }

    /**
     * Build SQL fragment for multi-status OR filter.
     * Empty / [-1] => no filter.
     * Deleted (-10) uses c.state = deleted and ORs with normal statuses.
     *
     * @param array $statuses
     * @return array
     */
    protected function buildStatusFilterSql(array $statuses)
    {
        $normalized = [];
        $includeDeleted = false;
        $deletedCode = $this->deletedStatusFilterValue();

        foreach ($statuses as $status) {
            $status = (int)$status;
            if ($status === -1) {
                continue;
            }
            if ($status === $deletedCode) {
                $includeDeleted = true;
                continue;
            }
            $normalized[$status] = $status;
        }
        $normalized = array_values($normalized);

        if (!count($normalized) && !$includeDeleted) {
            return ['sql' => '', 'bindings' => []];
        }

        $deletedState = $this->deletedStateValue();

        if (!count($normalized) && $includeDeleted) {
            return [
                'sql' => ' AND c.state = ?',
                'bindings' => [$deletedState],
            ];
        }

        $in = implode(',', array_fill(0, count($normalized), '?'));
        if ($includeDeleted) {
            return [
                'sql' => " AND (c.status IN ($in) OR c.state = ?)",
                'bindings' => array_merge($normalized, [$deletedState]),
            ];
        }

        return [
            'sql' => " AND c.status IN ($in) AND (c.state IS NULL OR c.state <> ?)",
            'bindings' => array_merge($normalized, [$deletedState]),
        ];
    }

    /**
     * Default statuses from Manage → Settings → Smart Search.
     *
     * @param array $statusOptions
     * @return int[]
     */
    protected function getDefaultStatusesSetting(array $statusOptions)
    {
        $raw = \Option::get(
            'smartsearch.default_statuses',
            (array)config('smartsearch.default_statuses', [1, 2])
        );
        if (!is_array($raw)) {
            $raw = [$raw];
        }

        $out = [];
        foreach ($raw as $value) {
            $code = (int)$value;
            if (array_key_exists($code, $statusOptions)) {
                $out[$code] = $code;
            }
        }

        return array_values($out);
    }

    /**
     * Default mailbox from Manage → Settings → Smart Search.
     */
    protected function getDefaultMailboxIdSetting()
    {
        return (int)\Option::get(
            'smartsearch.default_mailbox_id',
            (int)config('smartsearch.default_mailbox_id', 0)
        );
    }

    /**
     * Whether message/note body search is enabled.
     */
    protected function shouldSearchThreadBody()
    {
        $value = \Option::get(
            'smartsearch.search_thread_body',
            config('smartsearch.search_thread_body', true)
        );

        return (bool)$value;
    }
}
