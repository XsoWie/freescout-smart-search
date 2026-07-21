<?php
/**
 * Standalone tests for relative date preset resolution (no Composer deps).
 * Mirrors ParsesBasicFilters::resolveDatePreset using DateTimeImmutable.
 * Run: php tools/test_date_presets.php
 */

final class DatePresetResolver
{
    public static function keys()
    {
        return [
            'today',
            'yesterday',
            'last_7_days',
            'last_30_days',
            'this_month',
            'last_month',
        ];
    }

    /**
     * @param DateTimeImmutable $now
     * @return array{0:string,1:string}
     */
    public static function resolve($preset, DateTimeImmutable $now)
    {
        $preset = strtolower(trim((string)$preset));
        if ($preset === '' || !in_array($preset, self::keys(), true)) {
            return ['', ''];
        }

        $today = $now->setTime(0, 0, 0);

        switch ($preset) {
            case 'today':
                $from = $today;
                $to = $today;
                break;
            case 'yesterday':
                $from = $today->modify('-1 day');
                $to = $from;
                break;
            case 'last_7_days':
                $to = $today;
                $from = $today->modify('-6 days');
                break;
            case 'last_30_days':
                $to = $today;
                $from = $today->modify('-29 days');
                break;
            case 'this_month':
                $from = $today->modify('first day of this month');
                $to = $today;
                break;
            case 'last_month':
                $from = $today->modify('first day of this month')->modify('-1 month');
                $to = $from->modify('last day of this month');
                break;
            default:
                return ['', ''];
        }

        return [$from->format('Y-m-d'), $to->format('Y-m-d')];
    }
}

$failed = 0;
$passed = 0;

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

$now = new DateTimeImmutable('2026-07-20 15:30:00');

assertEq('empty', ['', ''], DatePresetResolver::resolve('', $now));
assertEq('unknown', ['', ''], DatePresetResolver::resolve('nope', $now));
assertEq('today', ['2026-07-20', '2026-07-20'], DatePresetResolver::resolve('today', $now));
assertEq('yesterday', ['2026-07-19', '2026-07-19'], DatePresetResolver::resolve('yesterday', $now));
assertEq('last_7_days', ['2026-07-14', '2026-07-20'], DatePresetResolver::resolve('last_7_days', $now));
assertEq('last_30_days', ['2026-06-21', '2026-07-20'], DatePresetResolver::resolve('last_30_days', $now));
assertEq('this_month', ['2026-07-01', '2026-07-20'], DatePresetResolver::resolve('this_month', $now));
assertEq('last_month', ['2026-06-01', '2026-06-30'], DatePresetResolver::resolve('last_month', $now));

$now2 = new DateTimeImmutable('2026-03-31 10:00:00');
assertEq('last_month from Mar 31', ['2026-02-01', '2026-02-28'], DatePresetResolver::resolve('last_month', $now2));

$now3 = new DateTimeImmutable('2026-01-01 08:00:00');
assertEq('last_month from Jan 1', ['2025-12-01', '2025-12-31'], DatePresetResolver::resolve('last_month', $now3));
assertEq('this_month from Jan 1', ['2026-01-01', '2026-01-01'], DatePresetResolver::resolve('this_month', $now3));

list($f7, $t7) = DatePresetResolver::resolve('last_7_days', $now);
$days7 = (int)$f7 === 0 ? -1 : (new DateTimeImmutable($f7))->diff(new DateTimeImmutable($t7))->days + 1;
assertEq('last_7_days span', 7, $days7);
list($f30, $t30) = DatePresetResolver::resolve('last_30_days', $now);
$days30 = (new DateTimeImmutable($f30))->diff(new DateTimeImmutable($t30))->days + 1;
assertEq('last_30_days span', 30, $days30);

echo "\nPassed: $passed  Failed: $failed\n";
exit($failed ? 1 : 0);
