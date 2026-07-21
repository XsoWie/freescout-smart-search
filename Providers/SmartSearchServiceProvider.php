<?php

namespace Modules\SmartSearch\Providers;

use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

if (!defined('SMART_SEARCH_MODULE')) {
    define('SMART_SEARCH_MODULE', 'smartsearch');
}

class SmartSearchServiceProvider extends ServiceProvider
{
    public function register()
    {
        $this->mergeConfigFrom(__DIR__.'/../Config/config.php', 'smartsearch');
    }

    public function boot()
    {
        $this->loadViewsFrom(__DIR__.'/../Resources/views', 'smartsearch');
        // FreeScout convention: JSON files with English source keys (Resources/lang/de.json).
        $this->loadJsonTranslationsFrom(__DIR__.'/../Resources/lang');
        $this->loadMigrationsFrom(__DIR__.'/../Database/Migrations');
        $this->loadRoutesFrom(__DIR__.'/../Routes/web.php');

        $this->registerHooks();
    }

    protected function shouldInjectFrontendAssets()
    {
        try {
            if ($this->app->runningInConsole() || !Auth::check()) {
                return false;
            }

            $request = $this->app['request'];
            if (!$request || $request->ajax() || $request->isXmlHttpRequest()) {
                return false;
            }

            // Navbar/topbar behavior is intentionally available on every normal
            // authenticated page. The JavaScript decides whether to render it.
            return true;
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function registerHooks()
    {
        \Eventy::addFilter('stylesheets', function ($styles) {
            if ($this->shouldInjectFrontendAssets()) {
                $base = \Module::getPublicPath(SMART_SEARCH_MODULE).'/css/';
                // Order matters. Skip missing files — FreeScout Minify aborts the whole block on errors.
                foreach (['suggest.css', 'form.css', 'results.css', 'extras.css'] as $file) {
                    $path = $base.$file;
                    $full = public_path(ltrim($path, '/'));
                    if (is_file($full) && !in_array($path, $styles, true)) {
                        $styles[] = $path;
                    }
                }
            }

            return $styles;
        });

        \Eventy::addFilter('javascripts', function ($javascripts) {
            if ($this->shouldInjectFrontendAssets()) {
                $base = \Module::getPublicPath(SMART_SEARCH_MODULE).'/js/';
                // Order: shared core → form page (tiles/advanced/cf/state/presets) → topbar suggest → bulk actions.
                foreach (['core.js', 'form-tiles.js', 'form-advanced.js', 'form-cf-values.js', 'form-cf.js', 'form-state.js', 'form-presets.js', 'form.js', 'suggest-history.js', 'suggest.js', 'bulk.js'] as $file) {
                    $path = $base.$file;
                    $full = public_path(ltrim($path, '/'));
                    if (is_file($full) && !in_array($path, $javascripts, true)) {
                        $javascripts[] = $path;
                    }
                }
            }

            return $javascripts;
        });

        \Eventy::addAction('layout.body_bottom', function () {
            if ($this->shouldInjectFrontendAssets()) {
                echo \View::make('smartsearch::partials.config')->render();
            }
        }, 5);

        // JS strings for Lang.get('messages.…') — rebuilt with freescout:clear-cache / freescout:build.
        \Eventy::addAction('js.lang.messages', function () {
            ?>
                "ss_choose_field": "<?php echo __j('Choose field…'); ?>",
                "ss_choose_values": "<?php echo __j('Choose values…'); ?>",
                "ss_any_value": "<?php echo __j('Any value'); ?>",
                "ss_any": "<?php echo __j('Any'); ?>",
                "ss_reset": "<?php echo __j('Reset'); ?>",
                "ss_reset_filters": "<?php echo __j('Reset filters'); ?>",
                "ss_restore_defaults": "<?php echo __j('Restore defaults'); ?>",
                "ss_defaults": "<?php echo __j('Defaults'); ?>",
                "ss_filter_prefix": "<?php echo __j('Active filters:'); ?>",
                "ss_mailbox": "<?php echo __j('Mailbox'); ?>",
                "ss_assignee": "<?php echo __j('Assignee'); ?>",
                "ss_folder": "<?php echo __j('Folder'); ?>",
                "ss_tags": "<?php echo __j('Tags'); ?>",
                "ss_last_reply": "<?php echo __j('Last reply'); ?>",
                "ss_attachments": "<?php echo __j('Attachments'); ?>",
                "ss_save": "<?php echo __j('Save'); ?>",
                "ss_load": "<?php echo __j('Load'); ?>",
                "ss_delete": "<?php echo __j('Delete'); ?>",
                "ss_delete_preset_confirm": "<?php echo __j('Delete this saved filter?'); ?>",
                "ss_apply": "<?php echo __j('Apply'); ?>",
                "ss_name_required": "<?php echo __j('Please enter a name.'); ?>",
                "ss_preset_saved": "<?php echo __j('Filters saved.'); ?>",
                "ss_preset_empty": "<?php echo __j('No saved filters yet.'); ?>",
                "ss_loading_fields": "<?php echo __j('Loading fields…'); ?>",
                "ss_loading_recent": "<?php echo __j('Loading…'); ?>",
                "ss_field_values_hint": "<?php echo __j('Select one or more values (OR).'); ?>",
                "ss_field_values_text_placeholder": "<?php echo __j('Value1, Value2…'); ?>",
                "ss_any_status": "<?php echo __j('Any status'); ?>",
                "ss_any_assignee": "<?php echo __j('Any assignee'); ?>",
                "ss_show_more": "<?php echo __j('Show more options'); ?>",
                "ss_hide_more": "<?php echo __j('Hide more options'); ?>",
                "ss_operator": "<?php echo __j('Operator'); ?>",
                "ss_empty_not_set": "<?php echo __j('Empty / not set'); ?>",
                "ss_value_placeholder": "<?php echo __j('Value'); ?>",
                "ss_from": "<?php echo __j('From'); ?>",
                "ss_to": "<?php echo __j('To'); ?>",
                "ss_op_is": "<?php echo __j('is'); ?>",
                "ss_op_contains": "<?php echo __j('contains'); ?>",
                "ss_op_equals": "<?php echo __j('equals'); ?>",
                "ss_op_gt": "<?php echo __j('greater than'); ?>",
                "ss_op_lt": "<?php echo __j('less than'); ?>",
                "ss_op_between": "<?php echo __j('between'); ?>",
                "ss_op_on": "<?php echo __j('on'); ?>",
                "ss_op_before": "<?php echo __j('before'); ?>",
                "ss_op_after": "<?php echo __j('after'); ?>",
                "ss_op_contains_any": "<?php echo __j('contains any'); ?>",
                "ss_subject": "<?php echo __j('Subject'); ?>",
                "ss_messages": "<?php echo __j('Messages'); ?>",
                "ss_notes": "<?php echo __j('Notes'); ?>",
                "ss_last_updated": "<?php echo __j('Last updated'); ?>",
                "ss_created_date": "<?php echo __j('Created date'); ?>",
                "ss_date_preset_today": "<?php echo __j('Today'); ?>",
                "ss_date_preset_yesterday": "<?php echo __j('Yesterday'); ?>",
                "ss_date_preset_last_7_days": "<?php echo __j('Last 7 days'); ?>",
                "ss_date_preset_last_30_days": "<?php echo __j('Last 30 days'); ?>",
                "ss_date_preset_this_month": "<?php echo __j('This month'); ?>",
                "ss_date_preset_last_month": "<?php echo __j('Last month'); ?>",
                "ss_inline_placeholder": "<?php echo __j('Search…'); ?>",
                "ss_focus_search": "<?php echo __j('Focus search'); ?>",
                "ss_open_smart_search": "<?php echo __j('Open Smart Search'); ?>",
                "ss_search": "<?php echo __j('Search'); ?>",
                "ss_suggestions": "<?php echo __j('Suggestions'); ?>",
                "ss_search_smart_for": "<?php echo __j('Smart Search for “:q”'); ?>",
                "ss_enter": "<?php echo __j('Enter'); ?>",
                "ss_recent_searches": "<?php echo __j('Recent searches'); ?>",
            <?php
        });
    }
}
