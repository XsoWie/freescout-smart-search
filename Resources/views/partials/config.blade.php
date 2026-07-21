{{--
  Tiny, CSP-safe config node.
  JS reads these to stay subdirectory-safe and to pick up module config defaults.
--}}
@php
    $ssDefaultStatuses = (array)config('smartsearch.default_statuses', [1, 2]);
    $ssDefaultStatuses = array_values(array_map('intval', $ssDefaultStatuses));
    $ssDefaultMailboxId = (int)config('smartsearch.default_mailbox_id', 0);
    $ssStatusLabels = [];
    try {
        if (class_exists(\App\Conversation::class) && property_exists(\App\Conversation::class, 'statuses') && is_array(\App\Conversation::$statuses)) {
            foreach (\App\Conversation::$statuses as $code => $name) {
                $code = (int)$code;
                if ($code <= 0) {
                    continue;
                }
                try {
                    $label = (string)\App\Conversation::statusCodeToName($code);
                } catch (\Throwable $e) {
                    $label = (string)$name;
                }
                if ($label !== '') {
                    $ssStatusLabels[(string)$code] = $label;
                }
            }
        }
    } catch (\Throwable $e) {
        $ssStatusLabels = [];
    }
    $ssStatusLabels['-10'] = (string)__('Deleted');
    $ssMailboxLabels = [];
    try {
        $ssUser = \Auth::user();
        if ($ssUser && method_exists($ssUser, 'mailboxesCanView')) {
            foreach ($ssUser->mailboxesCanView(true) as $ssMb) {
                $ssMailboxLabels[(string)$ssMb->id] = (string)$ssMb->name;
            }
        }
    } catch (\Throwable $e) {
        $ssMailboxLabels = [];
    }
@endphp
<span
    id="smartsearch-config"
    data-search-url="{{ route('smartsearch.search') }}"
    data-suggest-url="{{ route('smartsearch.suggest') }}"
    data-fields-url="{{ route('smartsearch.fields') }}"
    data-recent-meta-url="{{ route('smartsearch.recent_meta') }}"
    data-presets-url="{{ route('smartsearch.presets.index') }}"
    data-default-statuses="{{ e(json_encode($ssDefaultStatuses)) }}"
    data-default-mailbox-id="{{ $ssDefaultMailboxId }}"
    data-status-labels="{{ e(json_encode($ssStatusLabels, JSON_UNESCAPED_UNICODE)) }}"
    data-mailbox-labels="{{ e(json_encode($ssMailboxLabels, JSON_UNESCAPED_UNICODE)) }}"
    data-i18n-reset-filters="{{ __('Reset filters') }}"
    data-i18n-restore-defaults="{{ __('Restore defaults') }}"
    data-i18n-defaults="{{ __('Defaults') }}"
    data-i18n-filter-prefix="{{ __('Active filters:') }}"
    data-i18n-save="{{ __('Save') }}"
    data-i18n-load="{{ __('Load') }}"
    data-i18n-delete="{{ __('Delete') }}"
    data-i18n-delete-preset-confirm="{{ __('Delete this saved filter?') }}"
    data-i18n-name-required="{{ __('Please enter a name.') }}"
    data-i18n-preset-saved="{{ __('Filters saved.') }}"
    data-i18n-preset-empty="{{ __('No saved filters yet.') }}"
    data-i18n-apply="{{ __('Apply') }}"
    data-i18n-choose-field="{{ __('Choose field…') }}"
    data-i18n-choose-values="{{ __('Choose values…') }}"
    data-i18n-any-value="{{ __('Any value') }}"
    data-i18n-any="{{ __('Any') }}"
    data-i18n-reset="{{ __('Reset') }}"
    data-i18n-loading-fields="{{ __('Loading fields…') }}"
    data-i18n-loading-recent="{{ __('Loading…') }}"
    data-i18n-field-values-hint="{{ __('Select one or more values (OR).') }}"
    data-i18n-field-values-text-placeholder="{{ __('Value1, Value2…') }}"
    data-i18n-any-status="{{ __('Any status') }}"
    data-i18n-any-assignee="{{ __('Any assignee') }}"
    data-i18n-show-more="{{ __('Show more options') }}"
    data-i18n-hide-more="{{ __('Hide more options') }}"
    data-i18n-operator="{{ __('Operator') }}"
    data-i18n-empty-not-set="{{ __('Empty / not set') }}"
    data-i18n-value-placeholder="{{ __('Value') }}"
    data-i18n-from="{{ __('From') }}"
    data-i18n-to="{{ __('To') }}"
    data-i18n-op-is="{{ __('is') }}"
    data-i18n-op-contains="{{ __('contains') }}"
    data-i18n-op-equals="{{ __('equals') }}"
    data-i18n-op-gt="{{ __('greater than') }}"
    data-i18n-op-lt="{{ __('less than') }}"
    data-i18n-op-between="{{ __('between') }}"
    data-i18n-op-on="{{ __('on') }}"
    data-i18n-op-before="{{ __('before') }}"
    data-i18n-op-after="{{ __('after') }}"
    data-i18n-op-contains-any="{{ __('contains any') }}"
    data-i18n-subject="{{ __('Subject') }}"
    data-i18n-messages="{{ __('Messages') }}"
    data-i18n-notes="{{ __('Notes') }}"
    data-i18n-last-updated="{{ __('Last updated') }}"
    data-i18n-created-date="{{ __('Created date') }}"
    data-i18n-mailbox="{{ __('Mailbox') }}"
    data-i18n-assignee="{{ __('Assignee') }}"
    data-i18n-folder="{{ __('Folder') }}"
    data-i18n-tags="{{ __('Tags') }}"
    data-i18n-last-reply="{{ __('Last reply') }}"
    data-i18n-attachments="{{ __('Attachments') }}"
    data-use-core="{{ config('smartsearch.use_core_search_icon') ? '1' : '0' }}"
    data-hide-core="{{ config('smartsearch.hide_core_search_icon') ? '1' : '0' }}"
    data-show-inline="{{ config('smartsearch.show_topbar') ? '1' : '0' }}"
    data-i18n-inline-placeholder="{{ __('Search…') }}"
    data-i18n-focus-search="{{ __('Focus search') }}"
    data-i18n-open-smart-search="{{ __('Open Smart Search') }}"
    data-i18n-search="{{ __('Search') }}"
    data-i18n-suggestions="{{ __('Suggestions') }}"
    data-i18n-search-smart-for="{{ __('Search Smart Search for “:q”') }}"
    data-i18n-enter="{{ __('Enter') }}"
    data-i18n-recent-searches="{{ __('Recent searches') }}"
    hidden
></span>
