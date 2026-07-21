<?php
/**
 * Compare Smart Search result counts for date presets vs raw SQL.
 * docker exec freescout-local-app php /data/Modules/SmartSearch/tools/test_search_counts.php
 */

$base = '/www/html';
require $base.'/vendor/autoload.php';
$app = require $base.'/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Modules\SmartSearch\Http\Controllers\SmartSearchController;

$failed = 0;
$passed = 0;

function assertEq($label, $expected, $actual)
{
    global $failed, $passed;
    if ($expected === $actual) {
        $passed++;
        echo "OK  $label ($actual)\n";
        return;
    }
    $failed++;
    echo "FAIL $label expected=$expected actual=$actual\n";
}

$user = User::where('role', User::ROLE_ADMIN)->orderBy('id')->first();
if (!$user) {
    $user = User::orderBy('id')->first();
}
if (!$user) {
    fwrite(STDERR, "No user found\n");
    exit(1);
}
Auth::login($user);
echo "INFO logged in as #{$user->id} {$user->email}\n";

$ctrl = app(SmartSearchController::class);
$ref = new ReflectionClass($ctrl);
$search = null;
foreach (['searchConversations', 'runSearch', 'performSearch'] as $name) {
    if ($ref->hasMethod($name)) {
        $search = $ref->getMethod($name);
        break;
    }
}

// Prefer invoking index with ss=1 and reading view data via a thin wrapper around private SQL builder.
$parse = $ref->getMethod('parseAdvancedFilters');
$parse->setAccessible(true);
$build = $ref->getMethod('buildAdvancedFilterSql');
$build->setAccessible(true);
$resolve = $ref->getMethod('resolveDatePreset');
$resolve->setAccessible(true);

$mailboxIds = DB::table('mailbox_user')->where('user_id', $user->id)->pluck('mailbox_id')->all();
if (!count($mailboxIds)) {
    $mailboxIds = DB::table('mailboxes')->pluck('id')->all();
}
$in = implode(',', array_map('intval', $mailboxIds));
echo 'INFO mailbox ids: '.$in."\n";

foreach (['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_month', 'last_month'] as $preset) {
    $req = Request::create('/smart-search', 'GET', [
        'ss' => '1',
        'date_preset' => $preset,
        'date_field' => 'updated',
        'status' => [],
    ]);
    $adv = $parse->invoke($ctrl, $req, []);
    $sqlPart = $build->invoke($ctrl, $adv);
    $range = $resolve->invoke($ctrl, $preset, Carbon::now());

    $raw = (int)DB::table('conversations as c')
        ->whereIn('c.mailbox_id', $mailboxIds)
        ->where('c.updated_at', '>=', $range[0].' 00:00:00')
        ->where('c.updated_at', '<=', $range[1].' 23:59:59')
        ->count();

    $viaSql = (int)DB::selectOne(
        "SELECT COUNT(*) AS cnt FROM conversations c WHERE c.mailbox_id IN ($in)".$sqlPart['sql'],
        $sqlPart['bindings']
    )->cnt;

    assertEq("preset $preset count sql vs raw", $raw, $viaSql);
    echo "INFO $preset {$range[0]}..{$range[1]} => $raw\n";
}

// created_at absolute range sanity
$req = Request::create('/smart-search', 'GET', [
    'date_field' => 'created',
    'date_from' => '2026-01-01',
    'date_to' => '2026-01-31',
]);
$adv = $parse->invoke($ctrl, $req, []);
$sqlPart = $build->invoke($ctrl, $adv);
$raw = (int)DB::table('conversations as c')
    ->whereIn('c.mailbox_id', $mailboxIds)
    ->where('c.created_at', '>=', '2026-01-01 00:00:00')
    ->where('c.created_at', '<=', '2026-01-31 23:59:59')
    ->count();
$viaSql = (int)DB::selectOne(
    "SELECT COUNT(*) AS cnt FROM conversations c WHERE c.mailbox_id IN ($in)".$sqlPart['sql'],
    $sqlPart['bindings']
)->cnt;
assertEq('created absolute Jan 2026', $raw, $viaSql);
echo "INFO created Jan 2026 => $raw\n";

echo "\nPassed: $passed  Failed: $failed\n";
exit($failed ? 1 : 0);
