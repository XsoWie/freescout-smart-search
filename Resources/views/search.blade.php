@extends('layouts.app')

@section('title', __('Search'))

@section('content')
<div class="container smartsearch-page">
    {{-- <h2 class="page-heading">{{ __('Search') }}</h2> --}}

    @if ($error)
        <div class="alert alert-danger">{{ $error }}</div>
    @endif

    <div class="panel panel-default smartsearch-panel">
        <div class="panel-body">
            @include('smartsearch::partials.search-form')
        </div>
    </div>

    <div class="smartsearch-results-section">
    @if ($q && mb_strlen($q) < (int)config('smartsearch.min_query_len', 2))
        <div class="alert alert-warning">{{ __('Query is too short.') }}</div>
    @endif

    @if (!$error && ($q || ($mode ?? '') === 'recent'))
        @if (!count($results))
            <div class="smartsearch-results-meta">
                @if (($mode ?? '') === 'recent')
                    <strong>{{ __('Recent conversations') }}</strong>
                    <span class="text-muted">&mdash; {{ __(':count total', ['count' => $total]) }}</span>
                @else
                    <strong>{{ $total }}</strong> {{ (int)$total === 1 ? __('search result') : __('search results') }}
                @endif
            </div>
            @if (($mode ?? '') !== 'recent' && mb_strlen($q) >= (int)config('smartsearch.min_query_len', 2))
                <div class="alert alert-info">{{ __('No matching conversations found.') }}</div>
            @endif
        @endif

        @if (count($results))
            @php
                $baseSort = request()->except('page');
                $sortVal = $sort ?? 'updated_desc';
                $nextSortId = ($sortVal === 'id_desc') ? 'id_asc' : 'id_desc';
                $nextSortUpdated = ($sortVal === 'updated_desc') ? 'updated_asc' : 'updated_desc';
                $idArrow = ($sortVal === 'id_desc') ? ' ↓' : (($sortVal === 'id_asc') ? ' ↑' : '');
                $updatedArrow = ($sortVal === 'updated_desc') ? ' ↓' : (($sortVal === 'updated_asc') ? ' ↑' : '');
                $bulkNoteMaxLength = max(100, min(100000, (int)config('smartsearch.bulk_note_max_length', 50000)));
            @endphp

            <form
                method="POST"
                action="{{ route('smartsearch.bulk') }}"
                id="smartsearch-bulk-form"
                class="smartsearch-bulk-form"
                data-count-template="{{ __(':count selected', ['count' => '__COUNT__']) }}"
                data-select-one-message="{{ __('Select at least one conversation.') }}"
                data-action-message="{{ __('Choose a bulk action.') }}"
                data-assignee-message="{{ __('Choose an assignee.') }}"
                data-status-message="{{ __('Choose a status.') }}"
                data-note-message="{{ __('Enter an internal note.') }}"
                data-processing-label="{{ __('Applying…') }}"
            >
                <input type="hidden" name="_token" value="{{ csrf_token() }}">

                <div class="smartsearch-results-bar">
                    <div class="smartsearch-results-meta">
                        @if (($mode ?? '') === 'recent')
                            <strong>{{ __('Recent conversations') }}</strong>
                            <span class="text-muted">{{ __(':count total', ['count' => $total]) }}</span>
                        @else
                            <strong>{{ $total }}</strong> {{ (int)$total === 1 ? __('search result') : __('search results') }}
                        @endif
                        <span class="text-muted">{{ __('(:count per page)', ['count' => (int)$perPage]) }}</span>
                    </div>

                    <div class="smartsearch-bulk-toolbar">
                        <label class="checkbox-inline smartsearch-bulk-select-visible">
                            <input
                                type="checkbox"
                                class="smartsearch-check-all"
                                aria-label="{{ __('Select visible conversations') }}"
                            >
                            {{ __('Select visible') }}
                        </label>

                        <select
                            class="form-control input-sm smartsearch-bulk-action"
                            name="bulk_action"
                            aria-label="{{ __('Bulk action') }}"
                        >
                            <option value="">{{ __('Choose action…') }}</option>
                            <option value="assign">{{ __('Assign selected') }}</option>
                            <option value="status">{{ __('Update status') }}</option>
                            <option value="note">{{ __('Add internal note') }}</option>
                        </select>

                        <select
                            class="form-control input-sm smartsearch-bulk-target smartsearch-bulk-target-assign"
                            name="bulk_assignee_id"
                            aria-label="{{ __('Assignee') }}"
                            disabled
                        >
                            <option value="0">{{ __('Choose assignee…') }}</option>
                            <option value="-1">{{ __('Unassigned') }}</option>
                            @foreach (($bulkAssignableUsers ?? []) as $bulkUser)
                                <option value="{{ $bulkUser['id'] }}">{{ $bulkUser['name'] }}</option>
                            @endforeach
                        </select>

                        <select
                            class="form-control input-sm smartsearch-bulk-target smartsearch-bulk-target-status"
                            name="bulk_status"
                            aria-label="{{ __('Status') }}"
                            disabled
                        >
                            <option value="0">{{ __('Choose status…') }}</option>
                            @foreach (($bulkStatusOptions ?? []) as $bulkStatusCode => $bulkStatusLabel)
                                <option value="{{ $bulkStatusCode }}">{{ $bulkStatusLabel }}</option>
                            @endforeach
                        </select>

                        <input
                            type="text"
                            class="form-control input-sm smartsearch-bulk-target smartsearch-bulk-target-note"
                            name="bulk_note"
                            value=""
                            maxlength="{{ $bulkNoteMaxLength }}"
                            placeholder="{{ __('Internal note for selected conversations…') }}"
                            aria-label="{{ __('Internal note') }}"
                            autocomplete="off"
                            disabled
                        >

                        <button type="submit" class="btn btn-primary btn-sm smartsearch-bulk-submit" disabled>
                            {{ __('Apply') }}
                        </button>
                        <span class="text-muted smartsearch-bulk-count" aria-live="polite">
                            {{ __(':count selected', ['count' => 0]) }}
                        </span>
                    </div>
                </div>

                <div class="smartsearch-results-panel">
                <div class="table-responsive smartsearch-results-wrap">
                    <table class="table table-striped table-hover smartsearch-results-table">
                        <thead>
                            <tr>
                                <th class="smartsearch-col-check" scope="col"></th>
                                <th class="smartsearch-col-conversation" scope="col">
                                    <a href="{{ route('smartsearch.search', array_merge($baseSort, ['sort' => $nextSortId])) }}">
                                        {{ __('Conversation') }}{{ $idArrow }}
                                    </a>
                                </th>
                                <th scope="col">{{ __('Subject') }}</th>
                                @foreach (($cfFilters ?? []) as $cfCol)
                                    @php
                                        $cfColId = (int)($cfCol['id'] ?? 0);
                                        $cfColName = $cfCol['meta']['name'] ?? ('#'.$cfColId);
                                        $cfSortAsc = 'cf_'.$cfColId.'_asc';
                                        $cfSortDesc = 'cf_'.$cfColId.'_desc';
                                        $cfNextSort = ($sortVal === $cfSortDesc) ? $cfSortAsc : $cfSortDesc;
                                        $cfArrow = ($sortVal === $cfSortDesc) ? ' ↓' : (($sortVal === $cfSortAsc) ? ' ↑' : '');
                                    @endphp
                                    <th class="smartsearch-col-field" scope="col">
                                        <a href="{{ route('smartsearch.search', array_merge($baseSort, ['sort' => $cfNextSort])) }}">
                                            {{ $cfColName }}{{ $cfArrow }}
                                        </a>
                                    </th>
                                @endforeach
                                <th class="smartsearch-col-status" scope="col">{{ __('Status') }}</th>
                                <th scope="col">
                                    <a href="{{ route('smartsearch.search', array_merge($baseSort, ['sort' => $nextSortUpdated])) }}">
                                        {{ __('Updated') }}{{ $updatedArrow }}
                                    </a>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            @php
                                $qTrim = trim((string)$q);
                                $qRegex = $qTrim ? '/(' . preg_quote($qTrim, '/') . ')/i' : null;
                            @endphp
                            @foreach ($results as $result)
                                @php
                                    $stateId = (int)($result['state'] ?? 0);
                                    $deletedState = defined('App\Conversation::STATE_DELETED')
                                        ? (int)constant('App\Conversation::STATE_DELETED')
                                        : 3;
                                    $isDeleted = ($stateId > 0 && $stateId === $deletedState);

                                    $subjectRaw = trim((string)($result['subject'] ?? ''));
                                    if ($subjectRaw === '') {
                                        $subjectRaw = __('(no subject)');
                                    }
                                    $subjectParts = [$subjectRaw];
                                    if ($qRegex && mb_strlen($qTrim) >= 2) {
                                        $subjectParts = preg_split(
                                            $qRegex,
                                            $subjectRaw,
                                            -1,
                                            PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY
                                        ) ?: [$subjectRaw];
                                    }

                                    $statusName = (string)($result['status_name'] ?? '');
                                    $statusClass = (string)($result['status_class'] ?? 'default');
                                @endphp
                                <tr>
                                    <td class="smartsearch-col-check">
                                        <input
                                            type="checkbox"
                                            class="smartsearch-row-check"
                                            name="conversation_ids[]"
                                            value="{{ $result['id'] }}"
                                            aria-label="{{ __('Select conversation #:id', ['id' => $result['id']]) }}"
                                            @if($isDeleted) disabled @endif
                                        >
                                    </td>
                                    <td class="smartsearch-col-conversation">
                                        <a href="{{ route('conversations.view', ['id' => $result['id']]) }}">#{{ $result['id'] }}</a>
                                    </td>
                                    <td>
                                        <a href="{{ route('conversations.view', ['id' => $result['id']]) }}">
                                            @foreach ($subjectParts as $subjectPart)
                                                @if ($qRegex && preg_match($qRegex, $subjectPart))
                                                    <span class="smartsearch-hl">{{ $subjectPart }}</span>
                                                @else
                                                    {{ $subjectPart }}
                                                @endif
                                            @endforeach
                                        </a>
                                    </td>
                                    @foreach (($cfFilters ?? []) as $cfCol)
                                        @php $cfColId = (int)($cfCol['id'] ?? 0); @endphp
                                        <td>{{ $result['cf_values'][$cfColId] ?? '' }}</td>
                                    @endforeach
                                    <td>
                                        @if ($statusName)
                                            <span class="label label-{{ $statusClass }}">{{ $statusName }}</span>
                                        @endif
                                    </td>
                                    <td>{{ \App\User::dateFormat($result['updated_at'], 'Y-m-d H:i') }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
                </div>

                @php
                    $perPageSafe = max(1, (int)$perPage);
                    $totalPages = (int)ceil(((int)$total) / $perPageSafe);
                    $currentPage = max(1, min((int)$page, max(1, $totalPages)));
                    $hasPrev = $currentPage > 1;
                    $hasNext = $currentPage < $totalPages;
                    $rangeFrom = $total > 0 ? (($currentPage - 1) * $perPageSafe) + 1 : 0;
                    $rangeTo = min($currentPage * $perPageSafe, (int)$total);
                    $base = request()->except('page');
                    // Compact page window: first, last, and neighbours around current.
                    $pageLinks = [];
                    if ($totalPages > 1) {
                        $window = [];
                        for ($p = 1; $p <= $totalPages; $p++) {
                            if ($p === 1 || $p === $totalPages || abs($p - $currentPage) <= 2) {
                                $window[] = $p;
                            }
                        }
                        $prev = 0;
                        foreach ($window as $p) {
                            if ($prev && $p > $prev + 1) {
                                $pageLinks[] = null; // ellipsis
                            }
                            $pageLinks[] = $p;
                            $prev = $p;
                        }
                    }
                @endphp
                @if ($totalPages > 1)
                    <nav class="smartsearch-pager" aria-label="{{ __('Search result pages') }}">
                        <div class="smartsearch-pager-meta text-muted">
                            {{ __('Showing :from–:to of :total', ['from' => $rangeFrom, 'to' => $rangeTo, 'total' => (int)$total]) }}
                            <span class="smartsearch-pager-sep">·</span>
                            {{ __('Page :page of :pages', ['page' => $currentPage, 'pages' => $totalPages]) }}
                        </div>
                        <div class="btn-group smartsearch-pagination" role="group">
                            @if ($hasPrev)
                                <a class="btn btn-default" href="{{ route('smartsearch.search', array_merge($base, ['page' => $currentPage - 1])) }}" rel="prev">&larr; {{ __('Prev') }}</a>
                            @else
                                <button type="button" class="btn btn-default" disabled>&larr; {{ __('Prev') }}</button>
                            @endif
                            @foreach ($pageLinks as $p)
                                @if ($p === null)
                                    <button type="button" class="btn btn-default" disabled>&hellip;</button>
                                @elseif ($p === $currentPage)
                                    <button type="button" class="btn btn-primary" disabled aria-current="page">{{ $p }}</button>
                                @else
                                    <a class="btn btn-default" href="{{ route('smartsearch.search', array_merge($base, ['page' => $p])) }}">{{ $p }}</a>
                                @endif
                            @endforeach
                            @if ($hasNext)
                                <a class="btn btn-default" href="{{ route('smartsearch.search', array_merge($base, ['page' => $currentPage + 1])) }}" rel="next">{{ __('Next') }} &rarr;</a>
                            @else
                                <button type="button" class="btn btn-default" disabled>{{ __('Next') }} &rarr;</button>
                            @endif
                        </div>
                    </nav>
                @endif
            </form>
        @endif
    @endif
    </div>
</div>
@endsection
