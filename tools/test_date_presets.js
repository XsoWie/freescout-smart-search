/* Mirror of form-advanced resolveDatePreset – run: node tools/test_date_presets.js */
'use strict';

function pad2(n) {
  return (n < 10 ? '0' : '') + n;
}

function formatYmd(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function resolveDatePreset(preset, now) {
  preset = String(preset || '').toLowerCase().replace(/^\s+|\s+$/g, '');
  now = now || new Date();
  var today = startOfDay(now);
  var from;
  var to;
  if (preset === 'today') {
    from = today;
    to = today;
  } else if (preset === 'yesterday') {
    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    to = from;
  } else if (preset === 'last_7_days') {
    to = today;
    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  } else if (preset === 'last_30_days') {
    to = today;
    from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  } else if (preset === 'this_month') {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
    to = today;
  } else if (preset === 'last_month') {
    from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    to = new Date(today.getFullYear(), today.getMonth(), 0);
  } else {
    return { from: '', to: '' };
  }
  return { from: formatYmd(from), to: formatYmd(to) };
}

var failed = 0;
var passed = 0;

function assertEq(label, expected, actual) {
  var exp = JSON.stringify(expected);
  var act = JSON.stringify(actual);
  if (exp === act) {
    passed++;
    console.log('OK  ' + label);
    return;
  }
  failed++;
  console.log('FAIL ' + label);
  console.log('  expected: ' + exp);
  console.log('  actual:   ' + act);
}

var now = new Date(2026, 6, 20, 15, 30, 0); // local July 20

assertEq('empty', { from: '', to: '' }, resolveDatePreset('', now));
assertEq('today', { from: '2026-07-20', to: '2026-07-20' }, resolveDatePreset('today', now));
assertEq('yesterday', { from: '2026-07-19', to: '2026-07-19' }, resolveDatePreset('yesterday', now));
assertEq('last_7_days', { from: '2026-07-14', to: '2026-07-20' }, resolveDatePreset('last_7_days', now));
assertEq('last_30_days', { from: '2026-06-21', to: '2026-07-20' }, resolveDatePreset('last_30_days', now));
assertEq('this_month', { from: '2026-07-01', to: '2026-07-20' }, resolveDatePreset('this_month', now));
assertEq('last_month', { from: '2026-06-01', to: '2026-06-30' }, resolveDatePreset('last_month', now));

var mar31 = new Date(2026, 2, 31, 10, 0, 0);
assertEq('last_month from Mar 31', { from: '2026-02-01', to: '2026-02-28' }, resolveDatePreset('last_month', mar31));

var jan1 = new Date(2026, 0, 1, 8, 0, 0);
assertEq('last_month from Jan 1', { from: '2025-12-01', to: '2025-12-31' }, resolveDatePreset('last_month', jan1));
assertEq('this_month from Jan 1', { from: '2026-01-01', to: '2026-01-01' }, resolveDatePreset('this_month', jan1));

console.log('\nPassed: ' + passed + '  Failed: ' + failed);
process.exit(failed ? 1 : 0);
