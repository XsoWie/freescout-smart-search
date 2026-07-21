<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Conversation;
use App\Folder;
use App\Mailbox;
use Illuminate\Support\Facades\DB;

trait LoadsMetadata
{
    /**
     * @return array<int, array{id:int,name:string}>
     */
    protected function loadTags()
    {
        if (!$this->tagsOk()) {
            return [];
        }
        try {
            $rows = DB::select('SELECT id, name FROM tags ORDER BY name ASC');
            $out = [];
            foreach ($rows as $row) {
                $out[] = [
                    'id' => (int)$row->id,
                    'name' => (string)$row->name,
                ];
            }
            return $out;
        } catch (\Throwable $e) {
            return [];
        }
    }

    protected function loadFolders(array $allowedMailboxIds, int $mailboxId = 0)
    {
        try {
            if (!count($allowedMailboxIds)) {
                return [];
            }

            $ids = $mailboxId ? [$mailboxId] : $allowedMailboxIds;
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if (!count($ids)) {
                return [];
            }

            $query = Folder::whereIn('mailbox_id', $ids)
                ->select(['id', 'mailbox_id', 'type', 'user_id']);

            // Personal folders are not represented by conversations.folder_id consistently.
            if (property_exists(Folder::class, 'personal_types') && is_array(Folder::$personal_types)) {
                $query->whereNotIn('type', Folder::$personal_types);
            }

            $folders = $query->get();
            $mailboxNames = [];
            if (!$mailboxId && count($ids) > 1) {
                foreach (Mailbox::whereIn('id', $ids)->get(['id', 'name']) as $mailbox) {
                    $mailboxNames[(int)$mailbox->id] = (string)$mailbox->name;
                }
            }

            $out = [];
            foreach ($folders as $folder) {
                try {
                    $name = method_exists($folder, 'getTypeName')
                        ? (string)$folder->getTypeName()
                        : (string)(Folder::$types[(int)$folder->type] ?? '');
                } catch (\Throwable $e) {
                    $name = (string)(Folder::$types[(int)$folder->type] ?? '');
                }
                if ($name === '') {
                    continue;
                }

                $folderMailboxId = (int)$folder->mailbox_id;
                $label = isset($mailboxNames[$folderMailboxId])
                    ? $mailboxNames[$folderMailboxId].' — '.$name
                    : $name;

                $out[] = [
                    'id' => (int)$folder->id,
                    'name' => $label,
                    'mailbox_id' => $folderMailboxId,
                ];
            }

            usort($out, function ($a, $b) {
                return strcasecmp((string)$a['name'], (string)$b['name']);
            });

            return $out;
        } catch (\Throwable $e) {
            try {
                \Helper::logException($e);
            } catch (\Throwable $ignored) {
                // no-op
            }
            return [];
        }
    }

    protected function statusOptions()
    {
        $out = [];
        try {
            if (property_exists(Conversation::class, 'statuses') && is_array(Conversation::$statuses)) {
                foreach (Conversation::$statuses as $code => $name) {
                    $code = (int)$code;
                    if ($code <= 0) {
                        continue;
                    }
                    $label = '';
                    try {
                        $label = (string)Conversation::statusCodeToName($code);
                    } catch (\Throwable $e) {
                        $label = (string)$name;
                    }
                    if ($label === '') {
                        $label = (string)$name;
                    }
                    $out[$code] = $label;
                }
            }
        } catch (\Throwable $e) {
            $out = [];
        }

        // Keep stable order in UI, then append Deleted because it is a conversation state, not a status.
        ksort($out);
        $out[$this->deletedStatusFilterValue()] = (string)__('Deleted');

        return $out;
    }

    protected function writableStatusOptions()
    {
        $out = [];
        try {
            if (property_exists(Conversation::class, 'statuses') && is_array(Conversation::$statuses)) {
                foreach (Conversation::$statuses as $code => $name) {
                    $code = (int)$code;
                    if ($code <= 0) {
                        continue;
                    }
                    try {
                        $label = (string)Conversation::statusCodeToName($code);
                    } catch (\Throwable $e) {
                        $label = (string)$name;
                    }
                    $out[$code] = $label !== '' ? $label : (string)$name;
                }
            }
        } catch (\Throwable $e) {
            $out = [];
        }

        ksort($out);
        return $out;
    }

    protected function loadAssignableUsers(array $allowedMailboxIds, int $mailboxId = 0)
    {
        try {
            $ids = $allowedMailboxIds;
            if ($mailboxId) {
                $ids = [$mailboxId];
            }
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if (!count($ids)) {
                return [];
            }

            $users = [];
            $mailboxes = Mailbox::whereIn('id', $ids)->get();
            foreach ($mailboxes as $mailbox) {
                try {
                    if (method_exists($mailbox, 'usersAssignable')) {
                        foreach ($mailbox->usersAssignable(true) as $mailboxUser) {
                            $uid = (int)($mailboxUser->id ?? 0);
                            if ($uid > 0) {
                                $users[$uid] = $mailboxUser;
                            }
                        }
                        continue;
                    }

                    if (method_exists($mailbox, 'usersHavingAccess')) {
                        foreach ($mailbox->usersHavingAccess() as $mailboxUser) {
                            $uid = (int)($mailboxUser->id ?? 0);
                            if ($uid > 0) {
                                $users[$uid] = $mailboxUser;
                            }
                        }
                        continue;
                    }

                    if (method_exists($mailbox, 'userIdsHavingAccess')) {
                        $userIds = $mailbox->userIdsHavingAccess();
                        if (is_array($userIds) && count($userIds)) {
                            $rows = DB::table('users')
                                ->select('id', 'first_name', 'last_name', 'email')
                                ->whereIn('id', $userIds)
                                ->get();
                            foreach ($rows as $row) {
                                $uid = (int)($row->id ?? 0);
                                if ($uid > 0) {
                                    $users[$uid] = $row;
                                }
                            }
                        }
                    }
                } catch (\Throwable $e) {
                    // Fall back to already assigned users below if needed.
                }
            }

            if (!count($users)) {
                foreach ($this->loadAssignees($allowedMailboxIds, $mailboxId, 0) as $assignee) {
                    $row = (object)[
                        'id' => (int)($assignee['id'] ?? 0),
                        'first_name' => (string)($assignee['name'] ?? ''),
                        'last_name' => '',
                        'email' => '',
                    ];
                    if ((int)$row->id > 0) {
                        $users[(int)$row->id] = $row;
                    }
                }
            }

            $out = [];
            foreach ($users as $row) {
                $out[] = [
                    'id' => (int)$row->id,
                    'name' => $this->formatAssigneeLabel($row),
                ];
            }

            usort($out, function ($a, $b) {
                return strcasecmp((string)($a['name'] ?? ''), (string)($b['name'] ?? ''));
            });

            return $out;
        } catch (\Throwable $e) {
            return $this->loadAssignees($allowedMailboxIds, $mailboxId, 0);
        }
    }

    protected function loadFields(array $allowedMailboxIds, int $mailboxId = 0)
    {
        try {
            $ids = $allowedMailboxIds;
            if ($mailboxId) {
                $ids = [$mailboxId];
            }
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if (!count($ids)) {
                return [];
            }

            // Prefer the official CustomFields module entity when available so we stay aligned
            // with the module's own mailbox-level field semantics.
            if (class_exists('Modules\CustomFields\Entities\CustomField')) {
                $out = [];
                foreach ($ids as $id) {
                    try {
                        $fields = \Modules\CustomFields\Entities\CustomField::getMailboxCustomFields($id);
                        foreach ($fields as $field) {
                            $options = [];
                            if (isset($field->options) && is_array($field->options)) {
                                $options = $field->options;
                            } elseif (isset($field->options) && $field->options !== null && $field->options !== '') {
                                $decoded = \Helper::jsonDecode((string)$field->options, true);
                                if (is_array($decoded)) {
                                    $options = $decoded;
                                }
                            }
                            $out[] = [
                                'id' => (int)$field->id,
                                'name' => (string)$field->name,
                                'mailbox_id' => (int)$field->mailbox_id,
                                'type' => (int)($field->type ?? 0),
                                'options' => $options,
                            ];
                        }
                    } catch (\Throwable $e) {
                        // ignore and fall back below if needed
                    }
                }
                if (count($out)) {
                    usort($out, function ($a, $b) {
                        return strcasecmp((string)$a['name'], (string)$b['name']);
                    });
                    return $out;
                }
            }

            $in = implode(',', array_fill(0, count($ids), '?'));
            $sql = "SELECT id, name, mailbox_id, type, options FROM custom_fields WHERE mailbox_id IN ($in) ORDER BY name";
            $rows = DB::select($sql, $ids);

            $out = [];
            foreach ($rows as $r) {
                $options = [];
                if (isset($r->options) && $r->options !== null && $r->options !== '') {
                    $decoded = \Helper::jsonDecode((string)$r->options, true);
                    if (is_array($decoded)) {
                        $options = $decoded;
                    }
                }
                $out[] = [
                    'id' => (int)$r->id,
                    'name' => (string)$r->name,
                    'mailbox_id' => (int)$r->mailbox_id,
                    'type' => (int)($r->type ?? 0),
                    'options' => $options,
                ];
            }
            return $out;
        } catch (\Throwable $e) {
            return [];
        }
    }

    /**
     * Best-effort single-field resolver for cases where the dropdown list does not include
     * the selected field (e.g. mailbox filter/permissions changed).
     */
    protected function loadFieldById(array $allowedMailboxIds, int $fieldId)
    {
        try {
            if (!$fieldId || !count($allowedMailboxIds)) {
                return null;
            }

            if (class_exists('Modules\CustomFields\Entities\CustomField')) {
                try {
                    $field = \Modules\CustomFields\Entities\CustomField::where('id', $fieldId)
                        ->whereIn('mailbox_id', $allowedMailboxIds)
                        ->first();
                    if ($field) {
                        $options = [];
                        if (isset($field->options) && is_array($field->options)) {
                            $options = $field->options;
                        } elseif (isset($field->options) && $field->options !== null && $field->options !== '') {
                            $decoded = \Helper::jsonDecode((string)$field->options, true);
                            if (is_array($decoded)) {
                                $options = $decoded;
                            }
                        }
                        return [
                            'id' => (int)$field->id,
                            'name' => (string)$field->name,
                            'mailbox_id' => (int)$field->mailbox_id,
                            'type' => (int)($field->type ?? 0),
                            'options' => $options,
                        ];
                    }
                } catch (\Throwable $e) {
                    // ignore and fall back
                }
            }

            $in = implode(',', array_fill(0, count($allowedMailboxIds), '?'));
            $sql = "SELECT id, name, mailbox_id, type, options FROM custom_fields WHERE id = ? AND mailbox_id IN ($in) LIMIT 1";
            $row = DB::selectOne($sql, array_merge([$fieldId], $allowedMailboxIds));
            if (!$row) {
                return null;
            }

            $options = [];
            if (isset($row->options) && $row->options !== null && $row->options !== '') {
                // Stored as JSON in the CustomFields module.
                $decoded = \Helper::jsonDecode((string)$row->options, true);
                if (is_array($decoded)) {
                    $options = $decoded;
                }
            }

            return [
                'id' => (int)$row->id,
                'name' => (string)$row->name,
                'mailbox_id' => (int)$row->mailbox_id,
                'type' => (int)($row->type ?? 0),
                'options' => $options,
            ];
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function loadAssignees(array $allowedMailboxIds, int $mailboxId = 0, int $assignedOnlyUserId = 0)
    {
        try {
            $ids = $allowedMailboxIds;
            if ($mailboxId) {
                $ids = [$mailboxId];
            }
            $ids = array_values(array_unique(array_map('intval', $ids)));
            if (!count($ids)) {
                return [];
            }

            $in = implode(',', array_fill(0, count($ids), '?'));
            $visibility = $this->buildAssignedVisibilitySql($assignedOnlyUserId, 'c');
            $bindings = array_merge($ids, (array)$visibility['bindings']);

            $rows = DB::select(
                "SELECT DISTINCT u.id, u.first_name, u.last_name, u.email\n".
                "FROM conversations c\n".
                "JOIN users u ON u.id = c.user_id\n".
                "WHERE c.mailbox_id IN ($in)\n".
                "  AND c.user_id IS NOT NULL\n".
                "  AND c.user_id > 0\n".
                (string)$visibility['sql']."\n".
                "ORDER BY u.first_name ASC, u.last_name ASC, u.email ASC",
                $bindings
            );

            $out = [];
            foreach ($rows as $row) {
                $out[] = [
                    'id' => (int)$row->id,
                    'name' => $this->formatAssigneeLabel($row),
                ];
            }

            if ($assignedOnlyUserId > 0 && !count($out)) {
                $userRow = DB::selectOne(
                    "SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1",
                    [$assignedOnlyUserId]
                );
                if ($userRow) {
                    $out[] = [
                        'id' => (int)$userRow->id,
                        'name' => $this->formatAssigneeLabel($userRow),
                    ];
                }
            }

            return $out;
        } catch (\Throwable $e) {
            return [];
        }
    }
}
