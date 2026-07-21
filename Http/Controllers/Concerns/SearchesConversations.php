<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Thread;
use Illuminate\Support\Facades\DB;

trait SearchesConversations
{
    /**
     * Default listing when query is empty: newest conversations the user can access.
     */
    protected function recent(array $allowedMailboxIds, int $mailboxId, array $statuses, int $folderId, array $assigneeIds, int $assignedOnlyUserId, int $page, int $perPage, string $sort = 'updated_desc', array $cfFilters = [], array $advanced = [])
    {
        if (!count($allowedMailboxIds)) {
            return [[], 0];
        }

        $ids = $allowedMailboxIds;
        if ($mailboxId) {
            $ids = [$mailboxId];
        }
        if (!count($ids)) {
            return [[], 0];
        }

        $offset = ($page - 1) * $perPage;
        $in = implode(',', array_fill(0, count($ids), '?'));

        $where = "c.mailbox_id IN ($in)";
        $bWhere = $ids;
        $statusFilter = $this->buildStatusFilterSql($statuses);
        if ($statusFilter['sql'] !== '') {
            $where .= $statusFilter['sql'];
            $bWhere = array_merge($bWhere, $statusFilter['bindings']);
        }
        if ($folderId) {
            $where .= " AND c.folder_id = ?";
            $bWhere[] = $folderId;
        }
        $assigneeFilter = $this->buildAssigneeFilterSql($assigneeIds);
        if ($assigneeFilter['sql'] !== '') {
            $where .= $assigneeFilter['sql'];
            $bWhere = array_merge($bWhere, $assigneeFilter['bindings']);
        }

        $visibility = $this->buildAssignedVisibilitySql($assignedOnlyUserId, 'c');
        $where .= (string)$visibility['sql'];
        $bWhere = array_merge($bWhere, (array)$visibility['bindings']);

        if (count($cfFilters) && $this->customFieldsOk()) {
            $cfFilter = $this->buildMultiCustomFieldFiltersSql($cfFilters, '', 'LIKE');
            if ($cfFilter['sql'] !== '') {
                $where .= $cfFilter['sql'];
                $bWhere = array_merge($bWhere, $cfFilter['bindings']);
            }
        }

        $advancedFilter = $this->buildAdvancedFilterSql($advanced);
        $where .= (string)$advancedFilter['sql'];
        $bWhere = array_merge($bWhere, (array)$advancedFilter['bindings']);
        $fromSql = 'conversations c';
        if (!empty($advancedFilter['needs_customer_join'])) {
            $fromSql .= ' LEFT JOIN customers cu ON cu.id = c.customer_id';
        }

        $allowedCfSortIds = [];
        foreach ($cfFilters as $filter) {
            $cid = (int)($filter['id'] ?? 0);
            if ($cid > 0) {
                $allowedCfSortIds[] = $cid;
            }
        }
        $sortInfo = $this->resolveSort($sort, $allowedCfSortIds);
        $fromSql .= (string)$sortInfo['join_sql'];
        $orderBy = (string)$sortInfo['order_by'];
        if (count($sortInfo['bindings'])) {
            // JOIN bindings appear before WHERE bindings in the SQL string.
            $bWhere = array_merge((array)$sortInfo['bindings'], $bWhere);
        }

        $total = 0;
        try {
            $row = DB::selectOne("SELECT COUNT(DISTINCT c.id) as cnt FROM $fromSql WHERE $where", $bWhere);
            $total = $row ? (int)$row->cnt : 0;
        } catch (\Throwable $e) {
            $total = 0;
        }

        $rows = [];
        try {
            $rows = DB::select(
                "SELECT DISTINCT c.id, c.subject, c.status, c.state, c.updated_at, c.mailbox_id
                 FROM $fromSql
                 WHERE $where
                 ORDER BY $orderBy
                 LIMIT ? OFFSET ?",
                array_merge($bWhere, [$perPage, $offset])
            );
        } catch (\Throwable $e) {
            $rows = [];
        }

        $results = [];
        foreach ($rows as $r) {
            $results[] = [
                'id' => (int)$r->id,
                'subject' => (string)$r->subject,
                'status' => (int)$r->status,
                'state' => isset($r->state) ? (int)$r->state : 0,
                'updated_at' => (string)$r->updated_at,
                'mailbox_id' => (int)$r->mailbox_id,
            ];
        }

        return [$results, $total];
    }

    protected function search(string $q, array $allowedMailboxIds, int $mailboxId, array $cfFilters, array $statuses, int $folderId, array $assigneeIds, int $assignedOnlyUserId, int $page, int $perPage, string $sort = 'updated_desc', array $advanced = [])
    {
        $offset = ($page - 1) * $perPage;
        $like = '%'.$q.'%';

        // Determine LIKE operator by driver.
        $driver = null;
        try {
            $driver = DB::connection()->getDriverName();
        } catch (\Throwable $e) {
            $driver = null;
        }
        $op = ($driver === 'pgsql') ? 'ILIKE' : 'LIKE';
        $cfOk = $this->customFieldsOk();
        $cfDefsOk = $this->customFieldDefinitionsOk();
        $allowedCfSortIds = [];
        foreach ($cfFilters as $filter) {
            $cid = (int)($filter['id'] ?? 0);
            if ($cid > 0) {
                $allowedCfSortIds[] = $cid;
            }
        }
        $sortInfo = $this->resolveSort($sort, $allowedCfSortIds);
        $orderBy = (string)$sortInfo['order_by'];
        $sortJoinSql = (string)$sortInfo['join_sql'];
        $sortBindings = (array)$sortInfo['bindings'];

        $ids = $allowedMailboxIds;
        if ($mailboxId) {
            $ids = [$mailboxId];
        }
        if (!count($ids)) {
            return [[], 0];
        }

        $in = implode(',', array_fill(0, count($ids), '?'));

        // Strict numeric resolution.
        // If user typed a numeric query (#1234 or 1234), treat it as a conversation/thread ID and jump.
        $numericTicket = $this->normalizeTicketNumberExact($q);
        $isStrictNumeric = (!count($cfFilters) && !$this->advancedFiltersActive($advanced) && $numericTicket !== null && $this->isStrictNumericQuery($q));
        if ($isStrictNumeric) {
            $resolved = $this->resolveNumericConversation(
                $numericTicket,
                $ids,
                $in,
                $statuses,
                $folderId,
                $assigneeIds,
                $assignedOnlyUserId,
                $this->isDisplayNumberQuery($q)
            );
            if ($resolved !== null) {
                // Deterministic hit: return a single conversation.
                return [[[
                    'id' => (int)$resolved['id'],
                    'subject' => (string)$resolved['subject'],
                    'mailbox_id' => (int)$resolved['mailbox_id'],
                    'status' => (int)$resolved['status'],
                    'state' => (int)($resolved['state'] ?? 0),
                    'updated_at' => (string)$resolved['updated_at'],
                ]], 1];
            }

            // Compatibility fallback:
            // if the numeric input is not an actual conversation/thread ID,
            // continue into the normal LIKE-based search so order numbers or
            // other numeric values present in the conversation subject/title,
            // preview, email, customer data, or custom fields still match.
        }

        $cfExistsSql = $cfOk ? "EXISTS (\n                    SELECT 1 FROM conversation_custom_field ccf\n                    WHERE ccf.conversation_id = c.id\n                      AND ccf.value $op ?\n                )" : "0=1";

        // Driver-specific concats.
        $fullNameExpr = in_array($driver, ['pgsql', 'sqlite'], true)
            ? "COALESCE(cu.first_name,'') || ' ' || COALESCE(cu.last_name,'')"
            : "CONCAT(COALESCE(cu.first_name,''), ' ', COALESCE(cu.last_name,''))";

        $bindings = [];
        $bindings = array_merge($bindings, $ids);

        // Optional filters (ANDed).
        $filterSql = '';
        $filterBindings = [];
        $statusFilter = $this->buildStatusFilterSql($statuses);
        if ($statusFilter['sql'] !== '') {
            $filterSql .= $statusFilter['sql'];
            $filterBindings = array_merge($filterBindings, $statusFilter['bindings']);
        }
        if ($folderId) {
            $filterSql .= " AND c.folder_id = ?";
            $filterBindings[] = $folderId;
        }
        $assigneeFilter = $this->buildAssigneeFilterSql($assigneeIds);
        if ($assigneeFilter['sql'] !== '') {
            $filterSql .= $assigneeFilter['sql'];
            $filterBindings = array_merge($filterBindings, $assigneeFilter['bindings']);
        }

        $visibility = $this->buildAssignedVisibilitySql($assignedOnlyUserId, 'c');
        $filterSql .= (string)$visibility['sql'];
        $filterBindings = array_merge($filterBindings, (array)$visibility['bindings']);

        $advancedFilter = $this->buildAdvancedFilterSql($advanced, $op, $fullNameExpr);
        $filterSql .= (string)$advancedFilter['sql'];
        $filterBindings = array_merge($filterBindings, (array)$advancedFilter['bindings']);
        $needsCustomerJoin = !empty($advancedFilter['needs_customer_join']);

        // Custom-field filters are ANDed with the free-text query (when present).
        $cfFilterSql = '';
        $cfFilterBindings = [];
        if (count($cfFilters)) {
            $cfFilter = $this->buildMultiCustomFieldFiltersSql($cfFilters, $q, $op);
            $cfFilterSql = (string)($cfFilter['sql'] ?? '');
            $cfFilterBindings = (array)($cfFilter['bindings'] ?? []);
        }

        // Unified search across selected scopes (and full defaults when all scopes selected).
        $textSearch = $this->buildTextSearchWhere($q, $op, $like, $cfExistsSql, $cfOk, $fullNameExpr, $advanced);
        $searchBindings = (array)($textSearch['bindings'] ?? []);
        $whereSql = (string)($textSearch['sql'] ?? '');
        $needsCustomerJoin = $needsCustomerJoin || !empty($textSearch['needs_customer_join']);

        // CF-only browse (no query): filters alone are enough.
        // With a query: text match is required; if no searchable scope is available, match nothing.
        if ($whereSql === '') {
            if ($q !== '') {
                return [[], 0];
            }
            if ($cfFilterSql === '') {
                return [[], 0];
            }
        }

        $fromSql = 'conversations c';
        if ($needsCustomerJoin) {
            $fromSql .= ' LEFT JOIN customers cu ON cu.id = c.customer_id';
        }
        $fromSql .= $sortJoinSql;

        $textSql = ($whereSql !== '') ? " AND (\n                $whereSql\n              )" : '';

        $countSql = "SELECT COUNT(DISTINCT c.id) AS cnt
            FROM $fromSql
            WHERE c.mailbox_id IN ($in)
              $filterSql
              $cfFilterSql
              $textSql";

        $sql = "SELECT DISTINCT c.id, c.subject, c.mailbox_id, c.status, c.state, c.updated_at
            FROM $fromSql
            WHERE c.mailbox_id IN ($in)
              $filterSql
              $cfFilterSql
              $textSql
            ORDER BY $orderBy
            LIMIT $perPage OFFSET $offset";

        $b = array_merge($sortBindings, $bindings, $filterBindings, $cfFilterBindings, $searchBindings);
        return $this->runSearch($countSql, $sql, $b);
    }

    /**
     * Build OR-combined free-text match across selected search scopes.
     *
     * @return array{sql:string,bindings:array,needs_customer_join:bool}
     */
    protected function buildTextSearchWhere(string $q, string $op, string $like, string $cfExistsSql, bool $cfOk, string $fullNameExpr, array $advanced)
    {
        if ($q === '') {
            return ['sql' => '', 'bindings' => [], 'needs_customer_join' => false];
        }

        $searchIn = (array)($advanced['search_in'] ?? ['subject', 'messages', 'notes']);
        $wantSubject = in_array('subject', $searchIn, true);
        $wantMessages = in_array('messages', $searchIn, true);
        $wantNotes = in_array('notes', $searchIn, true);
        $isDefaultScopes = $wantSubject && $wantMessages && $wantNotes;

        $whereParts = [];
        $searchBindings = [];
        $needsCustomerJoin = false;

        if ($isDefaultScopes && $cfOk) {
            $whereParts[] = $cfExistsSql;
            $searchBindings[] = $like;
        }

        if ($wantSubject) {
            $whereParts[] = "COALESCE(c.subject,'') $op ?";
            $searchBindings[] = $like;
            $whereParts[] = "COALESCE(c.preview,'') $op ?";
            $searchBindings[] = $like;
        }

        if ($isDefaultScopes) {
            $needsCustomerJoin = true;
            $whereParts[] = "COALESCE(c.customer_email,'') $op ?";
            $searchBindings[] = $like;
            $whereParts[] = "COALESCE(cu.first_name,'') $op ?";
            $searchBindings[] = $like;
            $whereParts[] = "COALESCE(cu.last_name,'') $op ?";
            $searchBindings[] = $like;
            $whereParts[] = "$fullNameExpr $op ?";
            $searchBindings[] = $like;
            $whereParts[] = "COALESCE(cu.phones,'') $op ?";
            $searchBindings[] = $like;
        }

        // Search published content without joining threads into the result set.
        if (($wantMessages || $wantNotes) && $this->shouldSearchThreadBody() && $this->threadsSearchOk()) {
            $publishedState = defined(Thread::class.'::STATE_PUBLISHED')
                ? (int)constant(Thread::class.'::STATE_PUBLISHED')
                : 2;
            $threadTypes = [];
            if ($wantMessages) {
                foreach (['TYPE_CUSTOMER', 'TYPE_MESSAGE'] as $constantName) {
                    $constant = Thread::class.'::'.$constantName;
                    if (defined($constant)) {
                        $threadTypes[] = (int)constant($constant);
                    }
                }
            }
            if ($wantNotes) {
                $constant = Thread::class.'::TYPE_NOTE';
                if (defined($constant)) {
                    $threadTypes[] = (int)constant($constant);
                }
            }
            $threadTypes = array_values(array_unique(array_filter($threadTypes)));
            if (count($threadTypes)) {
                $threadTypePlaceholders = implode(',', array_fill(0, count($threadTypes), '?'));
                $whereParts[] = "EXISTS (\n                    SELECT 1 FROM threads st\n                    WHERE st.conversation_id = c.id\n                      AND st.state = ?\n                      AND st.type IN ($threadTypePlaceholders)\n                      AND COALESCE(st.body,'') $op ?\n                )";
                $searchBindings[] = $publishedState;
                $searchBindings = array_merge($searchBindings, $threadTypes);
                $searchBindings[] = $like;
            }
        }

        if (!count($whereParts)) {
            return ['sql' => '', 'bindings' => [], 'needs_customer_join' => false];
        }

        return [
            'sql' => implode("\n                OR ", $whereParts),
            'bindings' => $searchBindings,
            'needs_customer_join' => $needsCustomerJoin,
        ];
    }

    protected function runSearch(string $countSql, string $sql, array $bindings)
    {
        try {
            $cntRow = DB::select($countSql, $bindings);
            $total = (int)($cntRow[0]->cnt ?? 0);

            $rows = DB::select($sql, $bindings);
            $results = [];
            foreach ($rows as $r) {
                $results[] = [
                    'id' => (int)$r->id,
                    'subject' => (string)$r->subject,
                    'mailbox_id' => (int)$r->mailbox_id,
                    'status' => (int)$r->status,
                    'state' => isset($r->state) ? (int)$r->state : 0,
                    'updated_at' => (string)$r->updated_at,
                ];
            }

            return [$results, $total];
        } catch (\Throwable $e) {
            // Fail-safe: return no results, never crash UI.
            try {
                \Helper::logException($e);
            } catch (\Throwable $ignored) {
                // no-op
            }
            return [[], 0];
        }
    }
}
