<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

trait HandlesPresets
{
    /**
     * List saved filter presets for the current user.
     * Stored in FreeScout Option API (no schema migration).
     */
    public function presetsIndex()
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['presets' => []], 401);
        }

        return response()->json([
            'presets' => $this->loadUserPresets((int)$user->id),
        ]);
    }

    /**
     * Save a named filter preset for the current user.
     */
    public function presetsStore(Request $request)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $name = trim((string)$request->input('name', ''));
        $name = preg_replace('/\s+/u', ' ', $name);
        if ($name === '') {
            return response()->json(['error' => __('Name is required.')], 422);
        }
        if (mb_strlen($name) > 80) {
            $name = mb_substr($name, 0, 80);
        }

        $filters = $request->input('filters', []);
        if (!is_array($filters)) {
            $filters = [];
        }
        unset($filters['more_open']);
        $q = trim((string)($filters['q'] ?? ''));
        if ($q !== '') {
            if (mb_strlen($q) > 255) {
                $q = mb_substr($q, 0, 255);
            }
            $filters['q'] = $q;
        } else {
            unset($filters['q']);
        }

        $summary = trim((string)$request->input('summary', ''));
        if ($summary === '') {
            $summary = $this->summarizePresetFilters($filters);
        }
        if (mb_strlen($summary) > 100) {
            $summary = rtrim(mb_substr($summary, 0, 97)).'…';
        }

        $presets = $this->loadUserPresets((int)$user->id);
        $preset = [
            // Avoid dots in IDs (uniqid more_entropy) — some stacks mishandle them in URLs.
            'id' => str_replace('.', '', uniqid('ssp_', true)),
            'name' => $name,
            'created_at' => Carbon::now()->toIso8601String(),
            'summary' => $summary,
            'filters' => $filters,
        ];
        array_unshift($presets, $preset);
        if (count($presets) > 30) {
            $presets = array_slice($presets, 0, 30);
        }
        $this->saveUserPresets((int)$user->id, $presets);

        return response()->json([
            'preset' => $preset,
            'presets' => $presets,
        ]);
    }

    /**
     * Delete a saved filter preset for the current user.
     */
    public function presetsDestroy(Request $request, $id)
    {
        $user = Auth::user();
        if (!$user) {
            return response()->json(['error' => 'Unauthorized'], 401);
        }

        $id = (string)$id;
        $presets = $this->loadUserPresets((int)$user->id);
        $kept = [];
        foreach ($presets as $preset) {
            if ((string)($preset['id'] ?? '') !== $id) {
                $kept[] = $preset;
            }
        }
        $this->saveUserPresets((int)$user->id, $kept);

        return response()->json(['presets' => $kept]);
    }

    protected function userPresetsOptionKey(int $userId)
    {
        return 'smartsearch.user_presets.'.$userId;
    }

    protected function loadUserPresets(int $userId)
    {
        $raw = \Option::get($this->userPresetsOptionKey($userId), []);
        if (!is_array($raw)) {
            return [];
        }
        $out = [];
        foreach ($raw as $row) {
            if (!is_array($row) || empty($row['id']) || empty($row['name'])) {
                continue;
            }
            $out[] = [
                'id' => (string)$row['id'],
                'name' => (string)$row['name'],
                'created_at' => (string)($row['created_at'] ?? ''),
                'summary' => (string)($row['summary'] ?? ''),
                'filters' => is_array($row['filters'] ?? null) ? $row['filters'] : [],
            ];
        }

        return $out;
    }

    protected function saveUserPresets(int $userId, array $presets)
    {
        \Option::set($this->userPresetsOptionKey($userId), array_values($presets));
    }

    /**
     * Short human-readable summary of saved filters (max 100 chars).
     * Prefer client-provided labels; this is a fallback for API consumers.
     */
    protected function summarizePresetFilters(array $filters)
    {
        $parts = [];
        $q = trim((string)($filters['q'] ?? ''));
        if ($q !== '') {
            $parts[] = '"'.$q.'"';
        }
        $statuses = array_values(array_filter(array_map('intval', (array)($filters['status'] ?? []))));
        if (count($statuses)) {
            $parts[] = __('Status').': '.implode(',', $statuses);
        }
        $mailboxId = (int)($filters['mailbox_id'] ?? 0);
        if ($mailboxId > 0) {
            $parts[] = __('Mailbox').' #'.$mailboxId;
        }
        $cf = (array)($filters['cf_filters'] ?? []);
        foreach ($cf as $row) {
            if (!is_array($row) || empty($row['id'])) {
                continue;
            }
            $vals = array_values(array_filter(array_map('strval', (array)($row['values'] ?? [])), function ($v) {
                return $v !== '';
            }));
            $op = (string)($row['op'] ?? '');
            $label = 'CF#'.(int)$row['id'];
            if ($op === 'empty') {
                $parts[] = $label.' ∅';
            } elseif (count($vals)) {
                $parts[] = $label.'='.implode('|', array_slice($vals, 0, 3));
            } else {
                $parts[] = $label;
            }
        }
        $presetAssignees = $filters['assignee_id'] ?? [];
        if (!is_array($presetAssignees)) {
            $presetAssignees = ((int)$presetAssignees !== 0) ? [(int)$presetAssignees] : [];
        }
        if (count(array_filter(array_map('intval', $presetAssignees), function ($id) {
            return $id !== 0;
        }))) {
            $parts[] = __('Assignee');
        }
        if ((int)($filters['folder_id'] ?? 0) !== 0) {
            $parts[] = __('Folder');
        }
        if (!empty($filters['tag_ids'])) {
            $parts[] = __('Tags');
        }
        if (($filters['customer_q'] ?? '') !== '') {
            $parts[] = __('Customer name or email');
        }
        if (($filters['date_preset'] ?? '') !== '' || ($filters['date_from'] ?? '') !== '' || ($filters['date_to'] ?? '') !== '') {
            $parts[] = __('Date range');
        }
        if (($filters['waiting_reply'] ?? '') !== '') {
            $parts[] = __('Waiting for reply (last from customer)');
        }
        if (($filters['has_attachments'] ?? '') !== '') {
            $parts[] = __('Attachments');
        }
        $sort = trim((string)($filters['sort'] ?? ''));
        if ($sort !== '' && $sort !== 'updated_desc') {
            $parts[] = __('Sort').': '.$sort;
        }
        $summary = count($parts) ? implode(' · ', $parts) : __('Defaults');
        if (mb_strlen($summary) > 100) {
            $summary = rtrim(mb_substr($summary, 0, 97)).'…';
        }

        return $summary;
    }
}
