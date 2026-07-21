<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use App\Conversation;
use App\Mailbox;
use App\Thread;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

trait HandlesBulkActions
{
    public function bulk(Request $request)
    {
        try {
            $user = Auth::user();
            if (!$user) {
                return redirect()->route('smartsearch.search');
            }

            $data = $request->only([
                'bulk_action',
                'bulk_assignee_id',
                'bulk_status',
                'bulk_note',
                'conversation_ids',
            ]);

            $ids = $this->normalizeBulkConversationIds($data['conversation_ids'] ?? []);
            if (!count($ids)) {
                \Session::flash('flash_error_floating', __('Select at least one conversation.'));
                return redirect()->back();
            }

            $action = trim((string)($data['bulk_action'] ?? ''));
            if (!in_array($action, ['assign', 'status', 'note'], true)) {
                \Session::flash('flash_error_floating', __('Choose a bulk action.'));
                return redirect()->back();
            }

            $allowedMailboxIds = $user->mailboxesIdsCanView();
            if (!count($allowedMailboxIds)) {
                \Session::flash('flash_error_floating', __('Not enough permissions'));
                return redirect()->back();
            }

            if (!$this->validateBulkActionPayload($action, $data, $allowedMailboxIds)) {
                return redirect()->back();
            }

            $conversations = Conversation::with('mailbox')
                ->whereIn('id', $ids)
                ->whereIn('mailbox_id', $allowedMailboxIds)
                ->get();

            $updated = 0;
            $skipped = max(0, count($ids) - count($conversations));
            $mailboxIdsToRefresh = [];

            foreach ($conversations as $conversation) {
                try {
                    if (!$this->canBulkTouchConversation($conversation, $user)) {
                        ++$skipped;
                        continue;
                    }

                    if ($this->isDeletedConversationState((int)($conversation->state ?? 0))) {
                        ++$skipped;
                        continue;
                    }

                    $changed = false;
                    if ($action === 'assign') {
                        $changed = $this->applyBulkAssignment($conversation, $user, (int)($data['bulk_assignee_id'] ?? 0));
                    } elseif ($action === 'status') {
                        $changed = $this->applyBulkStatus($conversation, $user, (int)($data['bulk_status'] ?? 0));
                    } elseif ($action === 'note') {
                        $changed = $this->applyBulkNote($conversation, $user, (string)($data['bulk_note'] ?? ''), $request);
                    }

                    if ($changed) {
                        ++$updated;
                        $mailboxIdsToRefresh[(int)$conversation->mailbox_id] = (int)$conversation->mailbox_id;
                    } else {
                        ++$skipped;
                    }
                } catch (\Throwable $e) {
                    ++$skipped;
                    try {
                        \Helper::logException($e);
                    } catch (\Throwable $ignored) {}
                }
            }

            $this->refreshMailboxCounters(array_values($mailboxIdsToRefresh));

            if ($updated > 0) {
                \Session::flash('flash_success_floating', __('Bulk action completed: :updated updated, :skipped skipped.', [
                    'updated' => $updated,
                    'skipped' => $skipped,
                ]));
            } else {
                \Session::flash('flash_error_floating', __('No conversations were updated.'));
            }
        } catch (\Throwable $e) {
            try {
                \Helper::logException($e);
            } catch (\Throwable $ignored) {}
            \Session::flash('flash_error_floating', __('Bulk action failed.'));
        }

        return redirect()->back();
    }

    protected function normalizeBulkConversationIds($raw)
    {
        $ids = [];
        if (!is_array($raw)) {
            $raw = preg_split('/[^0-9]+/', (string)$raw);
        }

        foreach ((array)$raw as $value) {
            $id = (int)$value;
            if ($id > 0) {
                $ids[$id] = $id;
            }
        }

        $ids = array_values($ids);
        $limit = (int)config('smartsearch.bulk_max_selected', 200);
        $limit = max(1, min(500, $limit));
        if (count($ids) > $limit) {
            $ids = array_slice($ids, 0, $limit);
        }

        return $ids;
    }

    protected function validateBulkActionPayload(string $action, array $data, array $allowedMailboxIds)
    {
        if ($action === 'assign') {
            $assigneeId = (int)($data['bulk_assignee_id'] ?? 0);
            if ($assigneeId === 0) {
                \Session::flash('flash_error_floating', __('Choose an assignee.'));
                return false;
            }

            $assignableIds = [-1 => -1];
            foreach ($this->loadAssignableUsers($allowedMailboxIds, 0) as $row) {
                $assignableIds[(int)$row['id']] = (int)$row['id'];
            }

            if (!isset($assignableIds[$assigneeId])) {
                \Session::flash('flash_error_floating', __('Choose an assignee.'));
                return false;
            }
        } elseif ($action === 'status') {
            $status = (int)($data['bulk_status'] ?? 0);
            if (!array_key_exists($status, $this->writableStatusOptions())) {
                \Session::flash('flash_error_floating', __('Choose a status.'));
                return false;
            }
        } elseif ($action === 'note') {
            $noteText = trim((string)($data['bulk_note'] ?? ''));
            if ($noteText === '' || trim(strip_tags($noteText)) === '') {
                \Session::flash('flash_error_floating', __('Enter an internal note.'));
                return false;
            }

            $maxLength = (int)config('smartsearch.bulk_note_max_length', 50000);
            $maxLength = max(100, min(100000, $maxLength));
            if (mb_strlen($noteText) > $maxLength) {
                \Session::flash('flash_error_floating', __('The internal note must not exceed :max characters.', [
                    'max' => $maxLength,
                ]));
                return false;
            }
        }

        return true;
    }

    protected function canBulkTouchConversation($conversation, $user)
    {
        if (!$conversation || !$user) {
            return false;
        }

        try {
            if (!$user->can('update', $conversation)) {
                return false;
            }
        } catch (\Throwable $e) {
            return false;
        }

        return true;
    }

    protected function applyBulkAssignment($conversation, $user, int $newUserId)
    {
        if ($newUserId === 0) {
            return false;
        }

        if ($newUserId !== -1 && !$this->isUserAssignableToMailbox($conversation->mailbox, $newUserId)) {
            return false;
        }

        $currentUserId = (int)($conversation->user_id ?? 0);
        if ($newUserId === -1) {
            if ($currentUserId <= 0) {
                return false;
            }
        } elseif ($currentUserId === $newUserId) {
            return false;
        }

        $conversation->changeUser($newUserId, $user);
        return true;
    }

    protected function isUserAssignableToMailbox($mailbox, int $userId)
    {
        if (!$mailbox || $userId <= 0) {
            return false;
        }

        try {
            // Prefer the same extension surface used by FreeScout's assignee UI.
            // Teams and other assignment modules can extend this collection.
            if (method_exists($mailbox, 'usersAssignable')) {
                foreach ($mailbox->usersAssignable(true) as $assignableUser) {
                    if ((int)($assignableUser->id ?? 0) === $userId) {
                        return true;
                    }
                }
                return false;
            }

            if (method_exists($mailbox, 'userHasAccess')) {
                return (bool)$mailbox->userHasAccess($userId);
            }

            if (method_exists($mailbox, 'userIdsHavingAccess')) {
                $ids = array_map('intval', (array)$mailbox->userIdsHavingAccess());
                return in_array($userId, $ids, true);
            }
        } catch (\Throwable $e) {
            return false;
        }

        return false;
    }

    protected function applyBulkStatus($conversation, $user, int $newStatus)
    {
        if (!array_key_exists($newStatus, $this->writableStatusOptions())) {
            return false;
        }

        if ((int)($conversation->status ?? 0) === $newStatus) {
            return false;
        }

        $conversation->changeStatus($newStatus, $user);
        return true;
    }

    protected function applyBulkNote($conversation, $user, string $noteText, Request $request)
    {
        $noteText = trim($noteText);
        if ($noteText === '' || trim(strip_tags($noteText)) === '') {
            return false;
        }

        $body = e(str_replace(["\r\n", "\r"], "\n", $noteText));
        $body = nl2br($body);

        $thread = new Thread();
        $thread->conversation_id = $conversation->id;
        $thread->user_id = $user->id;
        $thread->type = Thread::TYPE_NOTE;
        $thread->status = $conversation->status;
        $thread->state = Thread::STATE_PUBLISHED;
        $thread->source_via = Thread::PERSON_USER;
        $thread->source_type = Thread::SOURCE_TYPE_WEB;
        $thread->customer_id = $conversation->customer_id;
        $thread->created_by_user_id = $user->id;
        $thread->body = $body;

        $hookRequest = clone $request;
        $hookRequest->merge([
            'body' => $body,
            'is_note' => 1,
            'conversation_id' => (int)$conversation->id,
        ]);

        \Eventy::action('thread.before_save_from_request', $thread, $hookRequest);
        $thread->save();

        if (class_exists('App\\Events\\UserAddedNote')) {
            event(new \App\Events\UserAddedNote($conversation, $thread));
        }
        \Eventy::action('conversation.note_added', $conversation, $thread);

        return true;
    }

    protected function refreshMailboxCounters(array $mailboxIds)
    {
        $mailboxIds = array_values(array_unique(array_filter(array_map('intval', $mailboxIds))));
        if (!count($mailboxIds)) {
            return;
        }

        try {
            $mailboxes = Mailbox::whereIn('id', $mailboxIds)->get();
            foreach ($mailboxes as $mailbox) {
                try {
                    if (method_exists($mailbox, 'updateFoldersCounters')) {
                        $mailbox->updateFoldersCounters();
                    }
                } catch (\Throwable $e) {
                    try {
                        \Helper::logException($e);
                    } catch (\Throwable $ignored) {}
                }
            }
        } catch (\Throwable $e) {
            try {
                \Helper::logException($e);
            } catch (\Throwable $ignored) {}
        }
    }
}
