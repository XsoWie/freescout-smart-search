# Smart Search

Enhanced unified conversation search for FreeScout.

**Version:** 1.1.2  
**License:** AGPL-3.0  
**Repository:** [karrierekick-dev/freescout-smart-search](https://github.com/karrierekick-dev/freescout-smart-search)

## Attribution

This module is a further development of the wonderful
[Adam Smart Search UI](https://github.com/AdamCoffeeOverflow/freescout-Adam-Smart-SearchUI)
by [AdamCoffeeOverflow](https://github.com/AdamCoffeeOverflow).

Many thanks to Adam for the original module — this fork builds on that foundation
with additional filters, bulk actions, and UI refinements. License remains AGPL-3.0.

## Features

### Search

- Navbar search with suggestions and recent searches
- Subject, preview, message, reply, and internal-note search; with all search-in scopes selected also customer email, name, and phone
- Exact numeric resolution:
  - `#1234` prefers FreeScout's display conversation number
  - `1234` prefers the internal conversation ID
- Filters: mailbox, multi-status (OR) incl. Deleted, multi-assignee (OR) incl. Unassigned, folder, advanced filters under “more options”
- Sortable results (`#`, Created, Updated, custom-field columns)
- Advanced filters: date basis (Created or Updated), relative or custom date range (Today, Yesterday, Last 7/30 days, This/Last month), customer, attachments, search-in scopes, waiting for reply; tags when the Tags module is available
- Save / load / delete filter presets (per user)
- Defaults button (module config baselines); Quick Search filter summary when filters differ from defaults
- Localization: en, fr, de

### Custom Fields (optional module)

Shown only when the **Custom Fields** module is installed and active:

- Custom Fields tile
- Multiple field filters (AND); values within a field (OR)
- Operators by type:
  - Single line text: is / contains / empty
  - Multi line: contains / empty
  - Number: equals / greater than / less than / between / empty
  - Date: on / before / after / between / empty
  - Dropdown: is / empty
  - Tags: contains any / empty
  - Multiselect dropdown: contains any / empty
- Sortable custom-field columns in the result table
- Summary pills (field + operator + values)

### UI

- Tile filter UI (mailbox, status, assignee, custom fields; folder + advanced under “more options”)
- Radio/checkbox panels for filter choices
- “Show more options” for advanced filters
- Floating filter panels
- Status / custom-field pills on tiles
- Navbar search with suggestions (desktop and mobile)
- Dark theme support

### Bulk actions

Select visible Smart Search results and:

- Assign or unassign conversations
- Update conversation status
- Add the same internal note to selected conversations

POST + CSRF; per-conversation policy checks; skips deleted/inaccessible items; configurable selection limit.

## Compatibility

- FreeScout 1.8.211 or newer recommended
- PHP 7.1+ syntax
- Laravel 5.5-compatible
- Bootstrap 3 + jQuery frontend
- MySQL, PostgreSQL, and SQLite-aware search queries
- Custom Fields module is optional

No FreeScout core files are modified.

## Installation

You may [install this module like any other FreeScout module](https://github.com/freescout-helpdesk/freescout/wiki/FreeScout-Modules#2-installing-official-modules).

1. Copy the `SmartSearch` folder into your FreeScout `Modules/` directory (from a release ZIP or this repository).
2. If you previously used `AdamSmartSearchUI`, deactivate/remove that module first.
3. Activate **Smart Search** under **Manage → Modules**.

## Configuration

Edit `Config/config.php` before deployment when needed:

- `show_topbar`
- `use_core_search_icon`
- `hide_core_search_icon`
- `min_query_len`
- `per_page`
- `search_thread_body`
- `default_statuses`
- `default_mailbox_id`
- `bulk_max_selected`
- `bulk_note_max_length`
- `schema_cache_minutes`

## Updates

FreeScout can update this module via the Modules page (`latestVersionUrl` / `latestVersionZipUrl` in `module.json`).

## Security

See [SECURITY.md](SECURITY.md) for reporting instructions and implementation safeguards.
