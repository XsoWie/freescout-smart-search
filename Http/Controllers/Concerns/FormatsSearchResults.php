<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Conversation;
use App\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

trait FormatsSearchResults
{
    protected function getAssignedOnlyUserId($user = null)
    {
        try {
            if (!$user) {
                $user = Auth::user();
            }
            if (!$user) {
                return 0;
            }

            if (method_exists($user, 'isAdmin')) {
                if ($user->isAdmin()) {
                    return 0;
                }
            } else {
                $adminRole = defined(User::class.'::ROLE_ADMIN')
                    ? (int)constant(User::class.'::ROLE_ADMIN')
                    : 2;
                if ((int)($user->role ?? 0) === $adminRole) {
                    return 0;
                }
            }

            // FreeScout 1.8.225+ exposes this as a user permission.
            if (method_exists($user, 'canSeeOnlyAssignedConversations')) {
                return $user->canSeeOnlyAssignedConversations() ? (int)$user->id : 0;
            }

            if (defined(User::class.'::PERM_ONLY_ASSIGNED_TICKETS') && method_exists($user, 'hasPermission')) {
                $permission = (int)constant(User::class.'::PERM_ONLY_ASSIGNED_TICKETS');
                if ($user->hasPermission($permission)) {
                    return (int)$user->id;
                }
            }

            // Backward compatibility for installations using the legacy config list.
            $raw = config('app.show_only_assigned_conversations');
            $raw = is_string($raw) ? trim($raw) : '';
            if ($raw === '') {
                return 0;
            }

            $ids = preg_split('/[^0-9]+/', $raw);
            foreach ((array)$ids as $id) {
                if ((int)$id === (int)($user->id ?? 0) && (int)$id > 0) {
                    return (int)$id;
                }
            }
        } catch (\Throwable $e) {
            return 0;
        }

        return 0;
    }

    protected function canViewConversation($conversation, $user = null)
    {
        if (!$conversation) {
            return false;
        }
        if (!$user) {
            $user = Auth::user();
        }
        if (!$user) {
            return false;
        }

        try {
            return (bool)$user->can('view', $conversation);
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function canViewConversationId(int $conversationId, $user = null)
    {
        if ($conversationId <= 0) {
            return false;
        }

        try {
            return $this->canViewConversation(Conversation::find($conversationId), $user);
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function formatAssigneeLabel($row)
    {
        try {
            if (is_object($row) && method_exists($row, 'getFullName')) {
                $modelName = trim((string)$row->getFullName());
                if ($modelName !== '') {
                    return $modelName;
                }
            }
        } catch (\Throwable $e) {
            // Fall back to the selected attributes below.
        }

        $firstName = trim((string)($row->first_name ?? ''));
        $lastName = trim((string)($row->last_name ?? ''));
        $email = trim((string)($row->email ?? ''));

        $fullName = trim($firstName.' '.$lastName);
        if ($fullName !== '') {
            return $fullName;
        }

        if ($email !== '') {
            return $email;
        }

        return '#'.((int)($row->id ?? 0));
    }

    /**
     * Append selected custom field values to results (single query, no N+1).
     */
    protected function appendCustomFieldValues(array $results, int $fieldId, $fieldMeta = null)
    {
        try {
            if (!$fieldId || !count($results)) {
                return $results;
            }

            $convIds = [];
            foreach ($results as $r) {
                $id = (int)($r['id'] ?? 0);
                if ($id) {
                    $convIds[] = $id;
                }
            }
            $convIds = array_values(array_unique($convIds));
            if (!count($convIds)) {
                return $results;
            }

            $in = implode(',', array_fill(0, count($convIds), '?'));
            $sql = "SELECT conversation_id, value FROM conversation_custom_field WHERE custom_field_id = ? AND conversation_id IN ($in)";
            $rows = DB::select($sql, array_merge([$fieldId], $convIds));

            $map = [];
            foreach ($rows as $row) {
                $map[(int)$row->conversation_id] = (string)($row->value ?? '');
            }

            foreach ($results as &$r) {
                $id = (int)($r['id'] ?? 0);
                $raw = $id && array_key_exists($id, $map) ? $map[$id] : '';

                // Convert dropdown stored values (keys) into labels.
                // CustomFields module types:
                //  1 = Dropdown
                //  8 = Multiselect Dropdown
                if ($raw !== '' && $fieldMeta && !empty($fieldMeta['type']) && !empty($fieldMeta['options']) && is_array($fieldMeta['options'])) {
                    $type = (int)$fieldMeta['type'];
                    $options = $fieldMeta['options'];

                    if ($type === 1) {
                        $r['field_value'] = array_key_exists($raw, $options) ? (string)$options[$raw] : $raw;
                        continue;
                    }

                    if ($type === 8) {
                        $parts = array_filter(array_map('trim', explode(',', (string)$raw)), function ($v) {
                            return $v !== '';
                        });
                        $labels = [];
                        foreach ($parts as $p) {
                            $labels[] = array_key_exists($p, $options) ? (string)$options[$p] : $p;
                        }
                        $r['field_value'] = implode(', ', $labels);
                        continue;
                    }
                }

                $r['field_value'] = $raw;
            }
            unset($r);

            return $results;
        } catch (\Throwable $e) {
            // Never break the listing.
            return $results;
        }
    }

    /**
     * Hydrate result rows with values for multiple custom fields.
     *
     * @param array $cfFilters
     */
    protected function appendMultipleCustomFieldValues(array $results, array $cfFilters)
    {
        if (!count($results) || !count($cfFilters)) {
            return $results;
        }

        foreach ($results as $k => $row) {
            $results[$k]['cf_values'] = [];
        }

        foreach ($cfFilters as $filter) {
            $id = (int)$filter['id'];
            $meta = $filter['meta'] ?? null;
            $name = is_array($meta) ? (string)($meta['name'] ?? ('#'.$id)) : ('#'.$id);
            $results = $this->appendCustomFieldValues($results, $id, $meta);
            foreach ($results as $k => $row) {
                $val = (string)($row['field_value'] ?? '');
                $results[$k]['cf_values'][$id] = $val;
                if (!isset($results[$k]['_cf_parts'])) {
                    $results[$k]['_cf_parts'] = [];
                }
                if ($val !== '') {
                    $results[$k]['_cf_parts'][] = $name.': '.$val;
                }
            }
        }

        foreach ($results as $k => $row) {
            $parts = (array)($row['_cf_parts'] ?? []);
            $results[$k]['field_value'] = implode(' · ', $parts);
            unset($results[$k]['_cf_parts']);
        }

        return $results;
    }

    protected function appendStatusMeta(array $results)
    {
        foreach ($results as $key => $row) {
            $status = (int)($row['status'] ?? 0);
            $state = (int)($row['state'] ?? 0);
            $badge = $this->getConversationBadgeMeta($status, $state);

            $results[$key]['status_name'] = (string)($badge['name'] ?? '');
            $results[$key]['status_class'] = (string)($badge['class'] ?? 'default');
        }

        return $results;
    }

    protected function deletedStatusFilterValue()
    {
        return -10;
    }

    protected function deletedStateValue()
    {
        $deletedState = 3;
        try {
            if (defined(Conversation::class.'::STATE_DELETED')) {
                $deletedState = (int)constant(Conversation::class.'::STATE_DELETED');
            }
        } catch (\Throwable $e) {
            $deletedState = 3;
        }

        return $deletedState;
    }

    protected function getConversationBadgeMeta(int $status, int $state = 0)
    {
        if ($this->isDeletedConversationState($state)) {
            return [
                'name' => (string)__('Deleted'),
                'class' => 'danger',
            ];
        }

        $statusName = '';
        $statusClass = 'default';
        try {
            $statusName = (string)Conversation::statusCodeToName($status);
            if (isset(Conversation::$status_classes[$status])) {
                $statusClass = (string)Conversation::$status_classes[$status];
            }
        } catch (\Throwable $e) {
            $statusName = '';
            $statusClass = 'default';
        }

        return [
            'name' => $statusName,
            'class' => $statusClass,
        ];
    }

    protected function isDeletedConversationState(int $state)
    {
        return $state > 0 && $state === $this->deletedStateValue();
    }

    protected function buildConversationMetaItems(array $results)
    {
        if (!count($results)) {
            return [];
        }

        $mailboxNames = [];
        try {
            $mbIds = [];
            foreach ($results as $r) {
                $mid = (int)($r['mailbox_id'] ?? 0);
                if ($mid) {
                    $mbIds[$mid] = true;
                }
            }
            $mbIds = array_keys($mbIds);
            if (count($mbIds)) {
                $in = implode(',', array_fill(0, count($mbIds), '?'));
                $rows = DB::select("SELECT id, name FROM mailboxes WHERE id IN ($in)", $mbIds);
                foreach ($rows as $mb) {
                    $mailboxNames[(int)$mb->id] = (string)$mb->name;
                }
            }
        } catch (\Throwable $e) {
            $mailboxNames = [];
        }

        $items = [];
        foreach ($results as $r) {
            $id = (int)($r['id'] ?? 0);
            if (!$id) {
                continue;
            }

            $status = (int)($r['status'] ?? 0);
            $state = (int)($r['state'] ?? 0);
            $mailboxId = (int)($r['mailbox_id'] ?? 0);
            $updatedAt = (string)($r['updated_at'] ?? '');

            $updatedHuman = '';
            try {
                if ($updatedAt) {
                    $updatedHuman = Carbon::parse($updatedAt)->diffForHumans();
                }
            } catch (\Throwable $e) {
                $updatedHuman = '';
            }

            $badge = $this->getConversationBadgeMeta($status, $state);
            $statusName = (string)($badge['name'] ?? '');
            $statusClass = (string)($badge['class'] ?? 'default');

            $items[] = [
                'id' => $id,
                'subject' => (string)($r['subject'] ?? ''),
                'url' => route('conversations.view', ['id' => $id]),
                'mailbox_id' => $mailboxId,
                'mailbox_name' => (string)($mailboxNames[$mailboxId] ?? ''),
                'status' => $status,
                'state' => $state,
                'status_name' => $statusName,
                'status_class' => $statusClass,
                'updated_at' => $updatedAt,
                'updated_human' => $updatedHuman,
                'field_value' => (string)($r['field_value'] ?? ''),
            ];
        }

        return $items;
    }
}
