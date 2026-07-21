@php
    $selectedStatuses = array_map('intval', (array)($statuses ?? []));
    $cfFilters = (array)($cfFilters ?? []);
    if (!count($cfFilters) && !empty($fieldId)) {
        $cfFilters = [[
            'id' => (int)$fieldId,
            'values' => (array)($fieldValues ?? []),
            'meta' => $selectedField ?? null,
        ]];
    }
    $advanced = (array)($advanced ?? []);
    $searchInNow = (array)($advanced['search_in'] ?? ['subject', 'messages', 'notes']);
    sort($searchInNow);
    $advancedActive = (($advanced['date_preset'] ?? '') !== '')
        || (($advanced['date_from'] ?? '') !== '')
        || (($advanced['date_to'] ?? '') !== '')
        || !empty($advanced['tag_ids'])
        || (($advanced['customer_q'] ?? '') !== '')
        || (($advanced['has_attachments'] ?? '') !== '')
        || (($advanced['waiting_reply'] ?? '') !== '')
        || ($searchInNow !== ['messages', 'notes', 'subject']);
    $selectedAssignees = array_values(array_map('intval', (array)($assigneeIds ?? [])));
    // Legacy single assignee_id from older views/presets.
    if (!count($selectedAssignees) && isset($assigneeId) && (int)$assigneeId !== 0) {
        $selectedAssignees = [(int)$assigneeId];
    }
    // Assignee is a primary tile; only folder + advanced expand "more options".
    $moreOpen = ((int)($folderId ?? 0) !== 0) || $advancedActive;
    $currentSort = (string)($sort ?? 'updated_desc');
    if ($currentSort === '') {
        $currentSort = 'updated_desc';
    }
    $cfModuleOk = !empty($cfModuleOk);
@endphp

<div class="smartsearch-card">
    <form method="GET" action="{{ route('smartsearch.search') }}" class="smartsearch-form" id="smartsearch-form">
        <input type="hidden" name="ss" value="1">
        {{-- Sort comes from the results table headers, not a form tile. --}}
        <input type="hidden" name="sort" class="smartsearch-sort-input" value="{{ $currentSort }}">

        <div class="smartsearch-query-wrap">
            <div class="smartsearch-query-input-wrap">
                <input
                    id="smartsearch-q"
                    type="search"
                    class="form-control smartsearch-query-input"
                    name="q"
                    value="{{ $q }}"
                    placeholder="{{ __('Query') }}"
                    autocomplete="off"
                    autofocus
                >
                <button type="submit" class="btn btn-primary smartsearch-submit">{{ __('Search') }}</button>
            </div>
        </div>

        <div class="smartsearch-filter-grid" data-fields="{{ e(json_encode(array_values($fields ?? []))) }}">
            {{-- Mailbox --}}
            <div class="smartsearch-tile" data-tile="mailbox">
                <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                    <span class="smartsearch-tile-icon glyphicon glyphicon-envelope" aria-hidden="true"></span>
                    <span class="smartsearch-tile-body">
                        <span class="smartsearch-tile-label">{{ __('Mailbox') }}</span>
                        <span class="smartsearch-tile-value smartsearch-tile-mailbox-label">
                            @if ((int)$mailboxId)
                                @php $mbName = ''; foreach (($mailboxes ?? []) as $mb) { if ((int)$mb->id === (int)$mailboxId) { $mbName = $mb->name; break; } } @endphp
                                {{ $mbName !== '' ? $mbName : __('All accessible mailboxes') }}
                            @else
                                {{ __('All accessible mailboxes') }}
                            @endif
                        </span>
                    </span>
                    <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
                </button>
                <div class="smartsearch-tile-panel" hidden>
                    <div class="smartsearch-option-list" data-tile-field="mailbox_id">
                        <label class="radio">
                            <input type="radio" name="mailbox_id" value="0" @if(!(int)$mailboxId) checked @endif>
                            {{ __('All accessible mailboxes') }}
                        </label>
                        @foreach (($mailboxes ?? collect()) as $mb)
                            <label class="radio">
                                <input type="radio" name="mailbox_id" value="{{ $mb->id }}" @if((int)$mailboxId === (int)$mb->id) checked @endif>
                                {{ $mb->name }}
                            </label>
                        @endforeach
                    </div>
                </div>
            </div>

            {{-- Status (checkboxes) --}}
            <div class="smartsearch-tile" data-tile="status">
                <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                    <span class="smartsearch-tile-icon glyphicon glyphicon-record" aria-hidden="true"></span>
                    <span class="smartsearch-tile-body">
                        <span class="smartsearch-tile-label">{{ __('Status') }}</span>
                        <span class="smartsearch-tile-value smartsearch-status-pills">
                            @if (!count($selectedStatuses))
                                <span class="smartsearch-muted">{{ __('Any status') }}</span>
                            @else
                                @foreach ($selectedStatuses as $code)
                                    <span class="smartsearch-pill">{{ $statusOptions[$code] ?? $code }}</span>
                                @endforeach
                            @endif
                        </span>
                    </span>
                    <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
                </button>
                <div class="smartsearch-tile-panel" hidden>
                    <div class="smartsearch-check-list smartsearch-status-checks">
                        @foreach (($statusOptions ?? []) as $code => $label)
                            <label class="checkbox">
                                <input type="checkbox" name="status[]" value="{{ $code }}" @if(in_array((int)$code, $selectedStatuses, true)) checked @endif>
                                {{ $label }}
                            </label>
                        @endforeach
                    </div>
                    <p class="help-block">{{ __('Select one or more statuses (OR). Leave empty for any status.') }}</p>
                </div>
            </div>

            {{-- Assignee (multi-select OR) — primary filter --}}
            <div class="smartsearch-tile" data-tile="assignee">
                <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                    <span class="smartsearch-tile-icon glyphicon glyphicon-user" aria-hidden="true"></span>
                    <span class="smartsearch-tile-body">
                        <span class="smartsearch-tile-label">{{ __('Assignee') }}</span>
                        <span class="smartsearch-tile-value smartsearch-assignee-pills">
                            @if (!count($selectedAssignees))
                                <span class="smartsearch-muted">{{ __('Any assignee') }}</span>
                            @else
                                @foreach ($selectedAssignees as $aid)
                                    @if ((int)$aid === -1)
                                        <span class="smartsearch-pill">{{ __('Unassigned') }}</span>
                                    @else
                                        @php
                                            $an = '';
                                            foreach (($assignees ?? []) as $a) {
                                                if ((int)$a['id'] === (int)$aid) { $an = $a['name']; break; }
                                            }
                                        @endphp
                                        <span class="smartsearch-pill">{{ $an !== '' ? $an : ('#'.$aid) }}</span>
                                    @endif
                                @endforeach
                            @endif
                        </span>
                    </span>
                    <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
                </button>
                <div class="smartsearch-tile-panel" hidden>
                    <div class="smartsearch-check-list smartsearch-assignee-checks">
                        <label class="checkbox">
                            <input type="checkbox" name="assignee_id[]" value="-1" @if(in_array(-1, $selectedAssignees, true)) checked @endif>
                            {{ __('Unassigned') }}
                        </label>
                        @foreach (($assignees ?? []) as $assignee)
                            <label class="checkbox">
                                <input type="checkbox" name="assignee_id[]" value="{{ $assignee['id'] }}" @if(in_array((int)$assignee['id'], $selectedAssignees, true)) checked @endif>
                                {{ $assignee['name'] }}
                            </label>
                        @endforeach
                    </div>
                    <p class="help-block">{{ __('Select one or more assignees (OR). Leave empty for any assignee.') }}</p>
                </div>
            </div>

            @if ($cfModuleOk)
            {{-- Custom Fields: always visible primary filter --}}
            <div class="smartsearch-tile smartsearch-tile-cf" data-tile="fields">
                <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                    <span class="smartsearch-tile-icon glyphicon glyphicon-list-alt" aria-hidden="true"></span>
                    <span class="smartsearch-tile-body">
                        <span class="smartsearch-tile-label">{{ __('Custom Fields') }}</span>
                        <span class="smartsearch-tile-value smartsearch-cf-summary">
                            @if (!count($cfFilters))
                                <span class="smartsearch-muted">{{ __('Any') }}</span>
                            @else
                                @foreach ($cfFilters as $cf)
                                    @php
                                        $cfName = $cf['meta']['name'] ?? ('#'.$cf['id']);
                                        $cfType = (int)($cf['meta']['type'] ?? 0);
                                        $cfOp = (string)($cf['op'] ?? '');
                                        if ($cfOp === '') {
                                            $cfOpDefaults = [1=>'is',2=>'contains',3=>'contains',4=>'equals',5=>'on',7=>'contains_any',8=>'contains_any'];
                                            $cfOp = $cfOpDefaults[$cfType] ?? 'contains';
                                        }
                                        $cfOpBrief = [
                                            'is' => '=',
                                            'contains' => __('contains'),
                                            'equals' => '=',
                                            'gt' => '>',
                                            'lt' => '<',
                                            'between' => __('between'),
                                            'on' => '=',
                                            'before' => __('before'),
                                            'after' => __('after'),
                                            'contains_any' => __('contains any'),
                                            'empty' => __('Empty / not set'),
                                        ];
                                        $cfOpts = (!empty($cf['meta']['options']) && is_array($cf['meta']['options'])) ? $cf['meta']['options'] : [];
                                        $cfValLabels = [];
                                        foreach ((array)($cf['values'] ?? []) as $rawVal) {
                                            $rawVal = (string)$rawVal;
                                            if ($rawVal === '') {
                                                continue;
                                            }
                                            if ($rawVal === '__empty__') {
                                                $cfValLabels[] = __('Empty / not set');
                                                continue;
                                            }
                                            // Type 1: keys → labels; type 8 values are already labels.
                                            if ($cfType === 1 && isset($cfOpts[$rawVal])) {
                                                $cfValLabels[] = (string)$cfOpts[$rawVal];
                                                continue;
                                            }
                                            if ($cfType === 8) {
                                                $cfValLabels[] = $rawVal;
                                                continue;
                                            }
                                            foreach (preg_split('/\s*,\s*/', $rawVal) ?: [] as $part) {
                                                $part = trim((string)$part);
                                                if ($part !== '') {
                                                    $cfValLabels[] = $part;
                                                }
                                            }
                                        }
                                        $cfValLabels = array_values(array_unique($cfValLabels));
                                        $cfPill = $cfName;
                                        if ($cfOp === 'empty') {
                                            $cfPill .= ' '.$cfOpBrief['empty'];
                                        } elseif (count($cfValLabels)) {
                                            $opWord = $cfOpBrief[$cfOp] ?? $cfOp;
                                            if (in_array($cfOp, ['is', 'equals', 'on', 'gt', 'lt'], true)) {
                                                $cfPill .= ' '.$opWord.' '.implode(' | ', $cfValLabels);
                                            } elseif ($cfOp === 'between' && count($cfValLabels) >= 2) {
                                                $cfPill .= ' '.$opWord.' '.$cfValLabels[0].'–'.$cfValLabels[1];
                                            } else {
                                                $cfPill .= ' '.$opWord.' '.implode(' | ', $cfValLabels);
                                            }
                                        }
                                    @endphp
                                    <span class="smartsearch-pill">{{ $cfPill }}</span>
                                @endforeach
                            @endif
                        </span>
                    </span>
                    <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
                </button>
                <div class="smartsearch-tile-panel smartsearch-cf-panel" hidden>
                    <div class="smartsearch-cf-rows" data-empty-label="{{ __('Empty / not set') }}" data-any-value="{{ __('Any value') }}" data-choose-values="{{ __('Choose values…') }}" data-add-label="{{ __('Add field') }}" data-remove-label="{{ __('Remove field') }}" data-fields="{{ e(json_encode(array_values($fields ?? []))) }}">
                        @forelse ($cfFilters as $idx => $cf)
                            @include('smartsearch::partials.cf-filter-row', [
                                'index' => $idx,
                                'fields' => $fields ?? [],
                                'filter' => $cf,
                            ])
                        @empty
                            @include('smartsearch::partials.cf-filter-row', [
                                'index' => 0,
                                'fields' => $fields ?? [],
                                'filter' => ['id' => 0, 'values' => [], 'meta' => null],
                            ])
                        @endforelse
                    </div>
                    <button type="button" class="btn btn-link btn-sm smartsearch-cf-add">+ {{ __('Add field') }}</button>
                    <p class="help-block">{{ __('Multiple fields are combined with AND. Values within a field use OR.') }}</p>
                </div>
            </div>
            @endif
        </div>

        <div class="smartsearch-form-actions">
            <button type="button" class="btn btn-link btn-sm smartsearch-more-toggle" data-expanded="{{ $moreOpen ? '1' : '0' }}" aria-controls="smartsearch-more-wrap" aria-expanded="{{ $moreOpen ? 'true' : 'false' }}">
                <span class="smartsearch-more-toggle-label">{{ $moreOpen ? __('Hide more options') : __('Show more options') }}</span>
                <span class="smartsearch-more-toggle-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-form-actions-right">
                <div class="smartsearch-form-actions-btns">
                    <div class="smartsearch-preset-load-wrap" hidden>
                        <button type="button" class="btn btn-link btn-sm smartsearch-preset-load" title="{{ __('Load saved filters') }}" aria-expanded="false" aria-haspopup="listbox">
                            <span class="glyphicon glyphicon-folder-open" aria-hidden="true"></span>
                            {{ __('Load') }}
                            <span class="glyphicon glyphicon-chevron-down smartsearch-preset-load-caret" aria-hidden="true"></span>
                        </button>
                        <div class="smartsearch-preset-load-menu" hidden role="listbox" aria-label="{{ __('Load filters') }}">
                            <div class="smartsearch-preset-list"></div>
                        </div>
                    </div>
                    <div class="smartsearch-preset-save-wrap is-hidden">
                        <button type="button" class="btn btn-link btn-sm smartsearch-preset-save" title="{{ __('Save current filters') }}">
                            <span class="glyphicon glyphicon-save" aria-hidden="true"></span>
                            {{ __('Save') }}
                        </button>
                    </div>
                    <button type="button" class="btn btn-link btn-sm smartsearch-reset" title="{{ __('Restore defaults') }}">
                        <span class="glyphicon glyphicon-refresh" aria-hidden="true"></span>
                        {{ __('Defaults') }}
                    </button>
                </div>
                <div class="smartsearch-preset-save-panel" aria-hidden="true">
                    <div class="smartsearch-preset-save-panel-inner">
                        <div class="smartsearch-preset-save-dialog">
                            <input
                                id="smartsearch-preset-name"
                                type="text"
                                class="form-control input-sm smartsearch-preset-name"
                                maxlength="80"
                                placeholder="{{ __('e.g. Open urgent tickets') }}"
                                aria-label="{{ __('Name') }}"
                                autocomplete="off"
                            >
                            <button type="button" class="btn btn-primary btn-sm smartsearch-preset-save-confirm">{{ __('Save') }}</button>
                            <button type="button" class="btn btn-link btn-sm smartsearch-preset-save-cancel">{{ __('Cancel') }}</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="smartsearch-more-wrap @if(!$moreOpen) is-collapsed @endif" id="smartsearch-more-wrap" aria-hidden="{{ $moreOpen ? 'false' : 'true' }}">
            <div class="smartsearch-more-anim">
                <div class="smartsearch-filter-grid smartsearch-more-grid">
                    {{-- Folder --}}
                    <div class="smartsearch-tile" data-tile="folder">
                        <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                            <span class="smartsearch-tile-icon glyphicon glyphicon-folder-open" aria-hidden="true"></span>
                            <span class="smartsearch-tile-body">
                                <span class="smartsearch-tile-label">{{ __('Folder') }}</span>
                                <span class="smartsearch-tile-value smartsearch-tile-folder-label">
                                    @if ((int)($folderId ?? 0) && !empty($folders))
                                        @php $fn = ''; foreach ($folders as $f) { if ((int)$f['id'] === (int)$folderId) { $fn = $f['name']; break; } } @endphp
                                        {{ $fn !== '' ? $fn : __('Any folder') }}
                                    @else
                                        {{ __('Any folder') }}
                                    @endif
                                </span>
                            </span>
                            <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
                        </button>
                        <div class="smartsearch-tile-panel" hidden>
                            <div class="smartsearch-option-list" data-tile-field="folder_id">
                                <label class="radio">
                                    <input type="radio" name="folder_id" value="0" @if((int)($folderId ?? 0) === 0) checked @endif @if(empty($foldersOk)) disabled @endif>
                                    {{ __('Any folder') }}
                                </label>
                                @if (!empty($foldersOk) && !empty($folders) && is_array($folders))
                                    @foreach ($folders as $f)
                                        <label class="radio">
                                            <input type="radio" name="folder_id" value="{{ $f['id'] }}" @if((int)($folderId ?? 0) === (int)$f['id']) checked @endif>
                                            {{ $f['name'] }}
                                        </label>
                                    @endforeach
                                @endif
                            </div>
                        </div>
                    </div>

                    @include('smartsearch::partials.advanced-filters', [
                        'advanced' => $advanced,
                        'tags' => $tags ?? [],
                        'tagsOk' => $tagsOk ?? false,
                    ])
                </div>
            </div>
        </div>
    </form>
</div>
