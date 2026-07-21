@php
    $adv = (array)($advanced ?? []);
    $dateField = (string)($adv['date_field'] ?? 'updated');
    $dateFrom = (string)($adv['date_from'] ?? '');
    $dateTo = (string)($adv['date_to'] ?? '');
    $tagIds = array_map('intval', (array)($adv['tag_ids'] ?? []));
    $customerQ = (string)($adv['customer_q'] ?? '');
    $hasAttachments = $adv['has_attachments'] ?? '';
    $waitingReply = (string)($adv['waiting_reply'] ?? '');
    $searchIn = (array)($adv['search_in'] ?? []);
    if (!count($searchIn)) {
        $searchIn = ['subject', 'messages', 'notes'];
    }
    $tagsList = (array)($tags ?? []);
    $tagsOk = !empty($tagsOk);

    $dateSummary = '';
    if ($dateFrom !== '' || $dateTo !== '') {
        $basis = $dateField === 'created' ? __('Created date') : __('Last updated');
        $dateSummary = $basis.': '.($dateFrom !== '' ? $dateFrom : '…').' – '.($dateTo !== '' ? $dateTo : '…');
    } else {
        $dateSummary = $dateField === 'created' ? __('Created date') : __('Last updated');
    }

    $waitingLabel = __('Any');
    if ($waitingReply === 'customer') {
        $waitingLabel = __('Waiting for reply (last from customer)');
    } elseif ($waitingReply === 'user') {
        $waitingLabel = __('Last reply from agent');
    }

    $attachLabel = __('Any');
    if ((string)$hasAttachments === '1') {
        $attachLabel = __('With attachments only');
    } elseif ((string)$hasAttachments === '0') {
        $attachLabel = __('Without attachments');
    }

    $scopeLabels = [
        'subject' => __('Subject'),
        'messages' => __('Messages'),
        'notes' => __('Notes'),
    ];
@endphp

{{-- Date range --}}
        <div class="smartsearch-tile" data-tile="date">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-calendar" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Date range') }}</span>
                    <span class="smartsearch-tile-value smartsearch-tile-date-label">{{ $dateSummary }}</span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <div class="smartsearch-date-row">
                    <select class="form-control input-sm" name="date_field" title="{{ __('Date basis') }}">
                        <option value="updated" @if($dateField === 'updated') selected @endif>{{ __('Last updated') }}</option>
                        <option value="created" @if($dateField === 'created') selected @endif>{{ __('Created date') }}</option>
                    </select>
                    <input type="date" class="form-control input-sm" name="date_from" value="{{ $dateFrom }}" title="{{ __('From') }}">
                    <span class="smartsearch-date-sep">–</span>
                    <input type="date" class="form-control input-sm" name="date_to" value="{{ $dateTo }}" title="{{ __('To') }}">
                </div>
            </div>
        </div>

        {{-- Customer --}}
        <div class="smartsearch-tile" data-tile="customer">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-envelope" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Customer name or email') }}</span>
                    <span class="smartsearch-tile-value smartsearch-tile-customer-label">
                        @if ($customerQ !== '')
                            {{ $customerQ }}
                        @else
                            <span class="smartsearch-muted">{{ __('Any') }}</span>
                        @endif
                    </span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <input
                    type="search"
                    class="form-control input-sm"
                    name="customer_q"
                    value="{{ $customerQ }}"
                    placeholder="{{ __('Name or email…') }}"
                >
            </div>
        </div>

        {{-- Last reply --}}
        <div class="smartsearch-tile" data-tile="waiting">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-comment" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Last reply') }}</span>
                    <span class="smartsearch-tile-value smartsearch-tile-waiting-label">{{ $waitingLabel }}</span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <div class="smartsearch-option-list" data-tile-field="waiting_reply">
                    <label class="radio">
                        <input type="radio" name="waiting_reply" value="" @if($waitingReply === '' || $waitingReply === null) checked @endif>
                        {{ __('Any') }}
                    </label>
                    <label class="radio">
                        <input type="radio" name="waiting_reply" value="customer" @if($waitingReply === 'customer') checked @endif>
                        {{ __('Waiting for reply (last from customer)') }}
                    </label>
                    <label class="radio">
                        <input type="radio" name="waiting_reply" value="user" @if($waitingReply === 'user') checked @endif>
                        {{ __('Last reply from agent') }}
                    </label>
                </div>
            </div>
        </div>

        {{-- Attachments --}}
        <div class="smartsearch-tile" data-tile="attachments">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-paperclip" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Attachments') }}</span>
                    <span class="smartsearch-tile-value smartsearch-tile-attachments-label">{{ $attachLabel }}</span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <div class="smartsearch-option-list" data-tile-field="has_attachments">
                    <label class="radio">
                        <input type="radio" name="has_attachments" value="" @if($hasAttachments === '' || $hasAttachments === null) checked @endif>
                        {{ __('Any') }}
                    </label>
                    <label class="radio">
                        <input type="radio" name="has_attachments" value="1" @if((string)$hasAttachments === '1') checked @endif>
                        {{ __('With attachments only') }}
                    </label>
                    <label class="radio">
                        <input type="radio" name="has_attachments" value="0" @if((string)$hasAttachments === '0') checked @endif>
                        {{ __('Without attachments') }}
                    </label>
                </div>
            </div>
        </div>

        {{-- Search scope (like Status) --}}
        <div class="smartsearch-tile" data-tile="scope">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-search" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Search scope') }}</span>
                    <span class="smartsearch-tile-value smartsearch-scope-pills">
                        @php $scopeSelected = array_values(array_intersect(array_keys($scopeLabels), $searchIn)); @endphp
                        @if (!count($scopeSelected) || count($scopeSelected) === 3)
                            <span class="smartsearch-muted">{{ __('Subject') }}, {{ __('Messages') }}, {{ __('Notes') }}</span>
                        @else
                            @foreach ($scopeSelected as $scopeKey)
                                <span class="smartsearch-pill">{{ $scopeLabels[$scopeKey] }}</span>
                            @endforeach
                        @endif
                    </span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <div class="smartsearch-check-list smartsearch-scope-checks">
                    <label class="checkbox">
                        <input type="checkbox" name="search_in[]" value="subject" @if(in_array('subject', $searchIn, true)) checked @endif>
                        {{ __('Subject') }}
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" name="search_in[]" value="messages" @if(in_array('messages', $searchIn, true)) checked @endif>
                        {{ __('Messages') }}
                    </label>
                    <label class="checkbox">
                        <input type="checkbox" name="search_in[]" value="notes" @if(in_array('notes', $searchIn, true)) checked @endif>
                        {{ __('Notes') }}
                    </label>
                </div>
                <p class="help-block">{{ __('Limits the main query. All three selected = full search including customers and custom fields.') }}</p>
            </div>
        </div>

        @if ($tagsOk)
        {{-- Tags (like Status) --}}
        <div class="smartsearch-tile" data-tile="tags">
            <button type="button" class="smartsearch-tile-btn" aria-expanded="false">
                <span class="smartsearch-tile-icon glyphicon glyphicon-tags" aria-hidden="true"></span>
                <span class="smartsearch-tile-body">
                    <span class="smartsearch-tile-label">{{ __('Tags') }}</span>
                    <span class="smartsearch-tile-value smartsearch-tags-pills">
                        @if (!count($tagIds))
                            <span class="smartsearch-muted">{{ __('Any') }}</span>
                        @else
                            @foreach ($tagsList as $tag)
                                @if (in_array((int)$tag['id'], $tagIds, true))
                                    <span class="smartsearch-pill">{{ $tag['name'] }}</span>
                                @endif
                            @endforeach
                        @endif
                    </span>
                </span>
                <span class="smartsearch-tile-caret glyphicon glyphicon-chevron-down" aria-hidden="true"></span>
            </button>
            <div class="smartsearch-tile-panel" hidden>
                <div class="smartsearch-check-list smartsearch-tags-checks">
                    @forelse ($tagsList as $tag)
                        <label class="checkbox">
                            <input type="checkbox" name="tag_ids[]" value="{{ $tag['id'] }}" @if(in_array((int)$tag['id'], $tagIds, true)) checked @endif>
                            {{ $tag['name'] }}
                        </label>
                    @empty
                        <span class="text-muted">{{ __('No tags available.') }}</span>
                    @endforelse
                </div>
                <p class="help-block">{{ __('Multiple tags use OR (conversation has at least one).') }}</p>
            </div>
        </div>
        @endif
