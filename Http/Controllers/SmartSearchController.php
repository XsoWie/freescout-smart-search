<?php

namespace Modules\SmartSearch\Http\Controllers;

use App\Conversation;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Modules\SmartSearch\Http\Controllers\Concerns\BuildsCustomFieldFilterSql;
use Modules\SmartSearch\Http\Controllers\Concerns\ChecksSchema;
use Modules\SmartSearch\Http\Controllers\Concerns\FormatsSearchResults;
use Modules\SmartSearch\Http\Controllers\Concerns\HandlesBulkActions;
use Modules\SmartSearch\Http\Controllers\Concerns\HandlesPresets;
use Modules\SmartSearch\Http\Controllers\Concerns\LoadsMetadata;
use Modules\SmartSearch\Http\Controllers\Concerns\ParsesBasicFilters;
use Modules\SmartSearch\Http\Controllers\Concerns\ParsesCustomFieldFilters;
use Modules\SmartSearch\Http\Controllers\Concerns\ResolvesExactMatches;
use Modules\SmartSearch\Http\Controllers\Concerns\SearchesConversations;

class SmartSearchController extends Controller
{
    use BuildsCustomFieldFilterSql,
        ChecksSchema,
        FormatsSearchResults,
        HandlesBulkActions,
        HandlesPresets,
        LoadsMetadata,
        ParsesBasicFilters,
        ParsesCustomFieldFilters,
        ResolvesExactMatches,
        SearchesConversations;

    public function index(Request $request)
    {
        $q = trim((string)$request->get('q', ''));
        $q = $this->sanitizeSearchString($q);
        $page = max(1, (int)$request->get('page', 1));
        $perPage = (int)config('smartsearch.per_page', 50);
        if ($perPage < 10) {
            $perPage = 10;
        }
        if ($perPage > 200) {
            $perPage = 200;
        }

        $mailboxId = (int)$request->get('mailbox_id', 0);
        $folderId = (int)$request->get('folder_id', 0);
        $formSubmitted = $request->has('ss');

        $user = Auth::user();
        $mailboxes = $user ? $user->mailboxesCanView(true) : collect();
        $allowedMailboxIds = [];
        foreach ($mailboxes as $mailbox) {
            $allowedMailboxIds[] = (int)$mailbox->id;
        }
        $allowedMailboxIds = array_values(array_unique($allowedMailboxIds));
        $assignedOnlyUserId = $this->getAssignedOnlyUserId($user);

        // Apply module defaults on first open / deep links without form marker.
        if (!$formSubmitted && !$request->has('mailbox_id')) {
            $mailboxId = $this->getDefaultMailboxIdSetting();
        }

        // If user selected a mailbox they cannot access, ignore it.
        if ($mailboxId && !in_array($mailboxId, $allowedMailboxIds, true)) {
            $mailboxId = 0;
        }

        // Multi-status filter (OR). Empty selection = any status (no filter).
        $statusOptions = $this->statusOptions();
        if ($formSubmitted || $request->has('status')) {
            $statuses = $this->parseStatusFilter($request);
        } else {
            $statuses = $this->getDefaultStatusesSetting($statusOptions);
        }

        // Folder list is optional (depends on schema).
        $folders = [];
        $foldersOk = $this->foldersOk();
        if ($foldersOk) {
            $folders = $this->loadFolders($allowedMailboxIds, $mailboxId);
            if ($folderId) {
                $isValidFolder = false;
                foreach ($folders as $f) {
                    if ((int)($f['id'] ?? 0) === $folderId) {
                        $isValidFolder = true;
                        break;
                    }
                }
                if (!$isValidFolder) {
                    $folderId = 0;
                }
            }
        } else {
            $folderId = 0;
        }

        $assignees = $this->loadAssignees($allowedMailboxIds, $mailboxId, $assignedOnlyUserId);
        $assigneeIds = $this->parseAssigneeFilter($request, $assignees);

        $schemaOk = $this->schemaOk();
        $cfModuleOk = $this->customFieldsModuleActive();
        $cfOk = $cfModuleOk && $this->customFieldsOk();
        $cfDefsOk = $cfModuleOk && $this->customFieldDefinitionsOk();
        $error = $schemaOk ? null : __('The FreeScout conversations table is unavailable.');

        $fields = [];
        $fieldsById = [];
        if ($cfDefsOk) {
            $fields = $this->loadFields($allowedMailboxIds, $mailboxId);
            foreach ($fields as $f) {
                $fieldsById[(int)$f['id']] = $f;
            }
        }

        $cfFilters = $this->parseCfFilters($request, $fieldsById, $cfOk && $cfDefsOk);
        // Resolve meta for filters not in current mailbox field list.
        foreach ($cfFilters as $i => $filter) {
            if (empty($filter['meta'])) {
                $meta = $this->loadFieldById($allowedMailboxIds, (int)$filter['id']);
                if ($meta) {
                    $cfFilters[$i]['meta'] = $meta;
                    $fieldsById[(int)$filter['id']] = $meta;
                }
            }
        }
        $fieldId = count($cfFilters) ? (int)$cfFilters[0]['id'] : 0;
        $fieldValues = count($cfFilters) ? (array)$cfFilters[0]['values'] : [];
        $selectedField = count($cfFilters) ? ($cfFilters[0]['meta'] ?? null) : null;

        $allowedCfSortIds = [];
        foreach ($cfFilters as $filter) {
            $cid = (int)($filter['id'] ?? 0);
            if ($cid > 0) {
                $allowedCfSortIds[] = $cid;
            }
        }
        $sortInfo = $this->resolveSort((string)$request->get('sort', 'updated_desc'), $allowedCfSortIds);
        $sort = (string)$sortInfo['key'];

        $tagsOk = $this->tagsOk();
        $tags = $tagsOk ? $this->loadTags() : [];
        $advanced = $this->parseAdvancedFilters($request, $tagsOk ? $tags : []);

        $results = [];
        $total = 0;
        // Idle: bare page open (navbar "more", no ss/q) — form only, no DB listing.
        // Search/recent only when form was submitted (ss=1) or an explicit q is present.
        $mode = 'idle';

        // Native behavior: if user entered a conversation ID (or thread ID), jump directly to the conversation.
        // FreeScout core routes by conversations.id.
        if ($schemaOk && !count($cfFilters) && $q !== '' && mb_strlen($q) >= (int)config('smartsearch.min_query_len', 2)) {
            $numericTicket = $this->normalizeTicketNumberExact($q);
            if ($numericTicket !== null && $this->isStrictNumericQuery($q)) {
                $ids = $allowedMailboxIds;
                if ($mailboxId) {
                    $ids = [$mailboxId];
                }
                if (count($ids)) {
                    $in = implode(',', array_fill(0, count($ids), '?'));
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
                        return redirect()->route('conversations.view', ['id' => (int)$resolved['id']]);
                    }
                }
            }
        }

        if ($schemaOk && $q !== '' && mb_strlen($q) >= (int)config('smartsearch.min_query_len', 2)) {
            [$results, $total] = $this->search(
                $q,
                $allowedMailboxIds,
                $mailboxId,
                $cfFilters,
                $statuses,
                $folderId,
                $assigneeIds,
                $assignedOnlyUserId,
                $page,
                $perPage,
                $sort,
                $advanced
            );
            $mode = 'search';
        } elseif ($schemaOk && $formSubmitted && $q === '') {
            // Form submit without query: show newest conversations (filters still apply).
            [$results, $total] = $this->recent(
                $allowedMailboxIds,
                $mailboxId,
                $statuses,
                $folderId,
                $assigneeIds,
                $assignedOnlyUserId,
                $page,
                $perPage,
                $sort,
                $cfFilters,
                $advanced
            );
            $mode = 'recent';
        }

        // If a specific custom field is selected, always hydrate its value column
        // for the current results page (including "recent" mode).
        if (count($cfFilters) && $cfOk && count($results)) {
            $results = $this->appendMultipleCustomFieldValues($results, $cfFilters);
        }

        if (count($results)) {
            $results = $this->appendStatusMeta($results);
        }

        return view('smartsearch::search', [
            'q' => $q,
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'results' => $results,
            'mode' => $mode,
            'mailboxId' => $mailboxId,
            'fieldId' => $fieldId,
            'fieldValues' => $fieldValues,
            'cfFilters' => $cfFilters,
            'statuses' => $statuses,
            'statusOptions' => $statusOptions,
            'folderId' => $folderId,
            'folders' => $folders,
            'foldersOk' => $foldersOk,
            'assigneeIds' => $assigneeIds,
            'assignees' => $assignees,
            'bulkAssignableUsers' => $this->loadAssignableUsers($allowedMailboxIds, $mailboxId),
            'bulkStatusOptions' => $this->writableStatusOptions(),
            'sort' => $sort,
            'fields' => $fields,
            'selectedField' => $selectedField,
            'advanced' => $advanced,
            'tags' => $tags,
            'tagsOk' => $tagsOk,
            'cfModuleOk' => $cfModuleOk,
            'allowedMailboxIds' => $allowedMailboxIds,
            'mailboxes' => $mailboxes,
            'error' => $error,
        ]);
    }

    /**
     * Lightweight autosuggest endpoint for the topbar input.
     * Returns a small list of matches the user is allowed to view.
     */
    public function suggest(Request $request)
    {
        try {
            $q = trim((string)$request->get('q', ''));
            $q = $this->sanitizeSearchString($q);
            $minLen = (int)config('smartsearch.min_query_len', 2);
            if ($q === '' || mb_strlen($q) < $minLen) {
                return response()->json(['items' => []]);
            }

            $user = Auth::user();
            $allowedMailboxIds = $user ? $user->mailboxesIdsCanView() : [];
            $assignedOnlyUserId = $this->getAssignedOnlyUserId($user);
            if (!count($allowedMailboxIds)) {
                return response()->json(['items' => []]);
            }

            $mailboxId = (int)$request->get('mailbox_id', 0);
            if ($mailboxId && !in_array($mailboxId, array_map('intval', $allowedMailboxIds), true)) {
                $mailboxId = 0;
            }

            $statuses = $this->parseStatusFilter($request);
            if (!$request->has('ss') && !$request->has('status')) {
                $statuses = $this->getDefaultStatusesSetting($this->statusOptions());
            }

            $folderId = (int)$request->get('folder_id', 0);
            if (!$this->foldersOk()) {
                $folderId = 0;
            }

            $assigneesSuggest = $this->loadAssignees($allowedMailboxIds, $mailboxId, $assignedOnlyUserId);
            $assigneeIds = $this->parseAssigneeFilter($request, $assigneesSuggest);
            $tagsOk = $this->tagsOk();
            $tags = $tagsOk ? $this->loadTags() : [];
            $advanced = $this->parseAdvancedFilters($request, $tagsOk ? $tags : []);

            $cfOkSuggest = $this->customFieldsOk();
            $fieldsById = [];
            if ($cfOkSuggest && $this->customFieldDefinitionsOk()) {
                foreach ($this->loadFields($allowedMailboxIds, $mailboxId) as $f) {
                    $fieldsById[(int)$f['id']] = $f;
                }
            }
            $cfFilters = $this->parseCfFilters($request, $fieldsById, $cfOkSuggest);

            if (!$this->schemaOk()) {
                return response()->json(['items' => []]);
            }

            // Keep it intentionally small and fast.
            $perPage = 8;
            // Always suggest newest first (deterministic UX).
            [$results, $total] = $this->search(
                $q,
                $allowedMailboxIds,
                $mailboxId,
                $cfFilters,
                $statuses,
                $folderId,
                $assigneeIds,
                $assignedOnlyUserId,
                1,
                $perPage,
                'updated_desc',
                $advanced
            );

            // Optional: hydrate selected custom field value for suggestions.
            if (count($cfFilters) && $cfOkSuggest && count($results)) {
                $results = $this->appendMultipleCustomFieldValues($results, $cfFilters);
            }

            $items = $this->buildConversationMetaItems($results);

            return response()->json([
                'items' => $items,
                'total' => (int)$total,
            ]);
        } catch (\Throwable $e) {
            // Never break the navbar.
            return response()->json(['items' => []]);
        }
    }

    /**
     * Refresh conversation metadata used by recent-search shortcuts in the navbar.
     * This keeps status badges and timestamps from drifting when a conversation
     * changes after it was first stored in localStorage.
     */
    public function recentMeta(Request $request)
    {
        try {
            $rawIds = (string)$request->get('ids', '');
            if ($rawIds === '') {
                return response()->json(['items' => []]);
            }

            $parts = preg_split('/[^0-9]+/', $rawIds);
            $ids = [];
            foreach ((array)$parts as $part) {
                $id = (int)$part;
                if ($id > 0) {
                    $ids[$id] = $id;
                }
            }
            $ids = array_values($ids);
            if (!count($ids)) {
                return response()->json(['items' => []]);
            }
            if (count($ids) > 10) {
                $ids = array_slice($ids, 0, 10);
            }

            $user = Auth::user();
            $allowedMailboxIds = $user ? $user->mailboxesIdsCanView() : [];
            if (!count($allowedMailboxIds) || !$this->schemaOk()) {
                return response()->json(['items' => []]);
            }

            $rows = Conversation::whereIn('id', $ids)
                ->whereIn('mailbox_id', $allowedMailboxIds)
                ->get(['id', 'subject', 'mailbox_id', 'status', 'state', 'updated_at']);

            if (!count($rows)) {
                return response()->json(['items' => []]);
            }

            $results = [];
            foreach ($rows as $conversation) {
                if (!$this->canViewConversation($conversation, $user)) {
                    continue;
                }

                $results[] = [
                    'id' => (int)$conversation->id,
                    'subject' => (string)$conversation->subject,
                    'mailbox_id' => (int)$conversation->mailbox_id,
                    'status' => (int)$conversation->status,
                    'state' => isset($conversation->state) ? (int)$conversation->state : 0,
                    'updated_at' => (string)$conversation->updated_at,
                ];
            }

            return response()->json([
                'items' => $this->buildConversationMetaItems($results),
            ])->header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
              ->header('Pragma', 'no-cache')
              ->header('Expires', '0');
        } catch (\Throwable $e) {
            return response()->json(['items' => []]);
        }
    }

    /**
     * Return available custom fields for a selected mailbox.
     * Used by the Smart Search form before submitting the search.
     */
    public function fields(Request $request)
    {
        try {
            $user = Auth::user();
            $allowedMailboxIds = $user ? $user->mailboxesIdsCanView() : [];
            if (!count($allowedMailboxIds)) {
                return response()->json(['status' => 'success', 'fields' => []]);
            }

            $mailboxId = (int)$request->get('mailbox_id', 0);
            if ($mailboxId && !in_array($mailboxId, array_map('intval', $allowedMailboxIds), true)) {
                $mailboxId = 0;
            }

            if (!$this->customFieldDefinitionsOk()) {
                return response()->json(['status' => 'success', 'fields' => []]);
            }

            $fields = $this->loadFields($allowedMailboxIds, $mailboxId);

            return response()->json([
                'status' => 'success',
                'fields' => $fields,
            ]);
        } catch (\Throwable $e) {
            try {
                \Helper::logException($e);
            } catch (\Throwable $ignored) {}

            return response()->json([
                'status' => 'error',
                'fields' => [],
            ]);
        }
    }
}
