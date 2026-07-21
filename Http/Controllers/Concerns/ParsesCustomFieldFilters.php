<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use Illuminate\Http\Request;

trait ParsesCustomFieldFilters
{
    /**
     * Parse custom field value filter from request.
     * Accepts field_values[] array or legacy field_value string.
     *
     * @return array
     */
    /**
     * Parse one or more custom-field filters.
     * New: cf_filters[i][id] + cf_filters[i][values][] + cf_filters[i][op]
     * Legacy: field_id + field_values[]
     *
     * @param array $fieldsById id => field meta
     * @return array<int, array{id:int,values:array,op:string,meta:?array}>
     */
    protected function parseCfFilters(Request $request, array $fieldsById, bool $cfOk)
    {
        if (!$cfOk) {
            return [];
        }

        $out = [];
        $rawRows = $request->input('cf_filters', null);
        if (is_array($rawRows)) {
            foreach ($rawRows as $row) {
                if (!is_array($row)) {
                    continue;
                }
                $id = (int)($row['id'] ?? 0);
                if ($id <= 0 || !isset($fieldsById[$id])) {
                    continue;
                }
                $meta = $fieldsById[$id];
                $type = (int)($meta['type'] ?? 0);
                $filterOp = $this->normalizeCfFilterOp($type, (string)($row['op'] ?? ''));

                $values = $row['values'] ?? [];
                if (!is_array($values)) {
                    $values = ($values === null || $values === '') ? [] : [$values];
                }

                // Legacy checkbox "__empty__" without op=empty → treat as empty op.
                foreach ($values as $rawVal) {
                    if ((string)$rawVal === '__empty__') {
                        $filterOp = 'empty';
                        break;
                    }
                }

                $norm = [];
                if ($filterOp === 'empty') {
                    $norm = [];
                } elseif ($filterOp === 'between') {
                    // values[0]=from, values[1]=to — do not split commas.
                    foreach ($values as $value) {
                        $value = trim((string)$value);
                        if ($value === '' || $value === '__empty__') {
                            continue;
                        }
                        $norm[] = $value;
                        if (count($norm) >= 2) {
                            break;
                        }
                    }
                } elseif (in_array($filterOp, ['contains_any', 'contains'], true) && in_array($type, [7, 2, 3], true)) {
                    // Tags / text: comma-separated → OR values.
                    foreach ($values as $value) {
                        $value = trim((string)$value);
                        if ($value === '' || $value === '__empty__') {
                            continue;
                        }
                        if (strpos($value, ',') !== false) {
                            foreach (preg_split('/\s*,\s*/', $value) ?: [] as $part) {
                                $part = trim((string)$part);
                                if ($part !== '') {
                                    $norm[$part] = $part;
                                }
                            }
                            continue;
                        }
                        $norm[$value] = $value;
                    }
                    $norm = array_values($norm);
                } else {
                    // Exact / single-value ops: keep each submitted value as-is (no comma split).
                    foreach ($values as $value) {
                        $value = trim((string)$value);
                        if ($value === '' || $value === '__empty__') {
                            continue;
                        }
                        $norm[$value] = $value;
                    }
                    $norm = array_values($norm);
                }

                $out[$id] = [
                    'id' => $id,
                    'values' => is_array($norm) ? array_values($norm) : [],
                    'op' => $filterOp,
                    'meta' => $meta,
                ];
            }
        }

        // Legacy single field_id
        if (!count($out)) {
            $fieldId = (int)$request->get('field_id', 0);
            if ($fieldId > 0 && isset($fieldsById[$fieldId])) {
                $meta = $fieldsById[$fieldId];
                $type = (int)($meta['type'] ?? 0);
                $values = $this->parseFieldValues($request);
                $filterOp = $this->normalizeCfFilterOp($type, (string)$request->get('field_op', ''));
                if (in_array('__empty__', $values, true)) {
                    $filterOp = 'empty';
                    $values = [];
                }
                $out[$fieldId] = [
                    'id' => $fieldId,
                    'values' => $values,
                    'op' => $filterOp,
                    'meta' => $meta,
                ];
            }
        }

        return array_values($out);
    }

    /**
     * Default filter operator per CustomFields type.
     */
    protected function defaultCfFilterOp(int $type): string
    {
        switch ($type) {
            case 1:
                return 'is';
            case 3:
                return 'contains';
            case 4:
                return 'equals';
            case 5:
                return 'on';
            case 7:
            case 8:
                return 'contains_any';
            case 2:
            default:
                return 'contains';
        }
    }

    /**
     * Normalize / whitelist cf filter op for a field type. Missing op → type default.
     */
    protected function normalizeCfFilterOp(int $type, string $op): string
    {
        $op = strtolower(trim($op));
        $allowed = [
            1 => ['is', 'empty'],
            2 => ['is', 'contains', 'empty'],
            3 => ['contains', 'empty'],
            4 => ['equals', 'gt', 'lt', 'between', 'empty'],
            5 => ['on', 'before', 'after', 'between', 'empty'],
            7 => ['contains_any', 'empty'],
            8 => ['contains_any', 'empty'],
        ];
        $list = $allowed[$type] ?? ['contains', 'empty'];
        if ($op === '' || !in_array($op, $list, true)) {
            return $this->defaultCfFilterOp($type);
        }

        return $op;
    }

    /**
     * True when field has selectable dropdown/multiselect options (not autosuggest-only).
     */
    protected function cfHasRealOptions($selectedField): bool
    {
        if (!is_array($selectedField)) {
            return false;
        }
        $type = (int)($selectedField['type'] ?? 0);
        if (!in_array($type, [1, 8], true)) {
            return false;
        }
        $options = $selectedField['options'] ?? null;
        if (!is_array($options) || !count($options)) {
            return false;
        }
        $keys = array_keys($options);
        if (count($keys) === 1 && (string)$keys[0] === 'autosuggest') {
            return false;
        }

        return true;
    }

    protected function parseFieldValues(Request $request)
    {
        $raw = $request->input('field_values', null);
        if ($raw === null) {
            $text = trim((string)$request->input('field_values_text', ''));
            if ($text !== '') {
                $raw = preg_split('/\s*,\s*/', $text) ?: [];
            } else {
                $legacy = $request->input('field_value', null);
                if ($legacy === null || $legacy === '') {
                    return [];
                }
                $legacy = trim((string)$legacy);
                if ($legacy === '') {
                    return [];
                }
                if (strpos($legacy, ',') !== false) {
                    $raw = preg_split('/\s*,\s*/', $legacy);
                } else {
                    $raw = [$legacy];
                }
            }
        }
        if (!is_array($raw)) {
            $raw = [$raw];
        }

        $out = [];
        foreach ($raw as $value) {
            $value = (string)$value;
            if ($value === '__empty__') {
                $out['__empty__'] = '__empty__';
                continue;
            }
            $value = trim($value);
            if ($value === '') {
                $out['__empty__'] = '__empty__';
                continue;
            }
            $out[$value] = $value;
        }

        return array_values($out);
    }
}
