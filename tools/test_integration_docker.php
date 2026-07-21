<?php
/**
 * Integration checks inside FreeScout container.
 * Run:
 *   docker exec freescout-local-app php /data/Modules/SmartSearch/tools/test_integration_docker.php
 */

$base = '/www/html';
require $base.'/vendor/autoload.php';
$app = require $base.'/bootstrap/app.php';
$kernel = $app->make(Illuminate\Contracts\Console\Kernel::class);
$kernel->bootstrap();

use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Modules\SmartSearch\Http\Controllers\SmartSearchController;

$failed = 0;
$passed = 0;

function assertTrue($label, $cond)
{
    global $failed, $passed;
    if ($cond) {
        $passed++;
        echo "OK  $label\n";
        return;
    }
    $failed++;
    echo "FAIL $label\n";
}

function assertEq($label, $expected, $actual)
{
    global $failed, $passed;
    if ($expected === $actual) {
        $passed++;
        echo "OK  $label\n";
        return;
    }
    $failed++;
    echo "FAIL $label\n";
    echo '  expected: '.var_export($expected, true)."\n";
    echo '  actual:   '.var_export($actual, true)."\n";
}

$ctrl = app(SmartSearchController::class);
$ref = new ReflectionClass($ctrl);

$resolve = $ref->getMethod('resolveDatePreset');
$resolve->setAccessible(true);
$parse = $ref->getMethod('parseAdvancedFilters');
$parse->setAccessible(true);
$build = $ref->getMethod('buildAdvancedFilterSql');
$build->setAccessible(true);
$active = $ref->getMethod('advancedFiltersActive');
$active->setAccessible(true);

$now = Carbon::create(2026, 7, 20, 15, 30, 0);

assertEq(
    'resolve today',
    ['2026-07-20', '2026-07-20'],
    $resolve->invoke($ctrl, 'today', $now)
);
assertEq(
    'resolve last_7_days',
    ['2026-07-14', '2026-07-20'],
    $resolve->invoke($ctrl, 'last_7_days', $now)
);
assertEq(
    'resolve last_month',
    ['2026-06-01', '2026-06-30'],
    $resolve->invoke($ctrl, 'last_month', $now)
);

$req = Request::create('/smart-search', 'GET', [
    'date_preset' => 'last_7_days',
    'date_field' => 'updated',
    'date_from' => '2000-01-01',
    'date_to' => '2000-01-02',
]);
$advanced = $parse->invoke($ctrl, $req, []);
$expected = $resolve->invoke($ctrl, 'last_7_days', Carbon::now());
assertEq('parse preset key', 'last_7_days', $advanced['date_preset']);
assertEq('parse preset from matches resolve', $expected[0], $advanced['date_from']);
assertEq('parse preset to matches resolve', $expected[1], $advanced['date_to']);
assertTrue('preset overrides absolute from', $advanced['date_from'] !== '2000-01-01');
assertTrue('advanced active with preset', $active->invoke($ctrl, $advanced));

$sql = $build->invoke($ctrl, $advanced);
assertTrue('sql has from bound', strpos($sql['sql'], '>= ?') !== false);
assertTrue('sql has to bound', strpos($sql['sql'], '<= ?') !== false);
assertEq('sql from binding', $expected[0].' 00:00:00', isset($sql['bindings'][0]) ? $sql['bindings'][0] : null);
assertEq('sql to binding', $expected[1].' 23:59:59', isset($sql['bindings'][1]) ? $sql['bindings'][1] : null);

$reqAbs = Request::create('/smart-search', 'GET', [
    'date_field' => 'created',
    'date_from' => '2026-01-01',
    'date_to' => '2026-01-31',
]);
$advAbs = $parse->invoke($ctrl, $reqAbs, []);
assertEq('absolute keeps empty preset', '', $advAbs['date_preset']);
assertEq('absolute from', '2026-01-01', $advAbs['date_from']);
$sqlAbs = $build->invoke($ctrl, $advAbs);
assertTrue('absolute uses created_at', strpos($sqlAbs['sql'], 'created_at') !== false);

assertTrue('db has conversations table', Schema::hasTable('conversations'));

$live = $resolve->invoke($ctrl, 'last_7_days', Carbon::now());
$todayRange = $resolve->invoke($ctrl, 'today', Carbon::now());
$countWindow = (int)DB::table('conversations')
    ->where('updated_at', '>=', $live[0].' 00:00:00')
    ->where('updated_at', '<=', $live[1].' 23:59:59')
    ->count();
$countToday = (int)DB::table('conversations')
    ->where('updated_at', '>=', $todayRange[0].' 00:00:00')
    ->where('updated_at', '<=', $todayRange[1].' 23:59:59')
    ->count();
echo "INFO last_7_days window {$live[0]}..{$live[1]} count = $countWindow\n";
echo "INFO today window {$todayRange[0]} count = $countToday\n";
assertTrue('last_7_days count >= today count', $countWindow >= $countToday);

$js = [
    'core.js', 'form-tiles.js', 'form-advanced.js', 'form-cf-values.js', 'form-cf.js',
    'form-state.js', 'form-presets.js', 'form.js', 'suggest-history.js', 'suggest.js', 'bulk.js',
];
foreach ($js as $file) {
    $path = '/data/Modules/SmartSearch/Public/js/'.$file;
    assertTrue("asset $file", is_file($path));
}

echo "\nPassed: $passed  Failed: $failed\n";
exit($failed ? 1 : 0);
