<?php

namespace Modules\SmartSearch\Http\Controllers\Concerns;

use Illuminate\Support\Facades\DB;

trait BuildsCustomFieldFilterSql
{
    /**
     * SQL expression to cast CF text value as number (driver-aware).
     */
    protected function cfNumericValueExpr(string $column = 'ccf.value'): string
    {
        $driver = null;
        try {
            $driver = DB::connection()->getDriverName();
        } catch (\Throwable $e) {
            $driver = null;
        }
        if ($driver === 'pgsql') {
            return "CAST(NULLIF(TRIM($column), '') AS NUMERIC)";
        }
        if ($driver === 'sqlite') {
            return "CAST(NULLIF(TRIM($column), '') AS REAL)";
        }

        return "CAST($column AS DECIMAL(20,6))";
    }

    /**
     * SQL expression for date compare as YYYY-MM-DD (driver-aware).
     */
    protected function cfDateValueExpr(string $column = 'ccf.value'): string
    {
        $driver = null;
        try {
            $driver = DB::connection()->getDriverName();
        } catch (\Throwable $e) {
            $driver = null;
        }
        if ($driver === 'pgsql') {
            return "SUBSTRING(TRIM($column) FROM 1 FOR 10)";
        }
        if ($driver === 'sqlite') {
            return "SUBSTR(TRIM($column), 1, 10)";
        }

        return "LEFT(TRIM($column), 10)";
    }

    /**
     * Match a token inside a comma-separated CF value (type 7/8).
     * MySQL: FIND_IN_SET; otherwise LIKE / equality fallback.
     *
     * @return array{sql:string,bindings:array}
     */
    protected function cfCsvContainsSql(string $column, string $token)
    {
        $driver = null;
        try {
            $driver = DB::connection()->getDriverName();
        } catch (\Throwable $e) {
            $driver = null;
        }
        if ($driver === 'pgsql' || $driver === 'sqlite') {
            return [
                'sql' => "($column = ? OR $column LIKE ? OR $column LIKE ? OR $column LIKE ?)",
                'bindings' => [$token, $token.',%', '%,'.$token.',%', '%,'.$token],
            ];
        }

        return [
            'sql' => 'FIND_IN_SET(?, '.$column.')',
            'bindings' => [$token],
        ];
    }

    /**
     * AND together several custom-field filters.
     *
     * @param array $cfFilters
     * @param string $likeOp LIKE/ILIKE for query fallback
     * @return array{sql:string,bindings:array}
     */
    protected function buildMultiCustomFieldFiltersSql(array $cfFilters, string $q, string $likeOp)
    {
        $sql = '';
        $bindings = [];
        $n = count($cfFilters);
        foreach ($cfFilters as $filter) {
            $useQ = ($n === 1) ? $q : '';
            $part = $this->buildCustomFieldValueFilterSql(
                (int)$filter['id'],
                (array)($filter['values'] ?? []),
                $useQ,
                $likeOp,
                $filter['meta'] ?? null,
                (string)($filter['op'] ?? '')
            );
            $sql .= (string)($part['sql'] ?? '');
            $bindings = array_merge($bindings, (array)($part['bindings'] ?? []));
        }

        return ['sql' => $sql, 'bindings' => $bindings];
    }

    /**
     * Build SQL for custom-field value filtering when a field_id is selected.
     * $likeOp = LIKE/ILIKE (query fallback); $filterOp = cf_filters[i][op].
     *
     * @param int $fieldId
     * @param array $fieldValues
     * @param string $q
     * @param string $likeOp
     * @param array|null $selectedField
     * @param string $filterOp
     * @return array
     */
    protected function buildCustomFieldValueFilterSql(int $fieldId, array $fieldValues, string $q, string $likeOp, $selectedField = null, string $filterOp = '')
    {
        if ($fieldId <= 0) {
            return ['sql' => '', 'bindings' => []];
        }

        if ($likeOp !== 'ILIKE' && $likeOp !== 'LIKE') {
            $likeOp = 'LIKE';
        }

        $fieldType = is_array($selectedField) ? (int)($selectedField['type'] ?? 0) : 0;
        $filterOp = $this->normalizeCfFilterOp($fieldType, $filterOp);
        $hasRealOptions = $this->cfHasRealOptions($selectedField);

        // op=empty → empty / not set (ignore values).
        if ($filterOp === 'empty') {
            return [
                'sql' => " AND (\n"
                    ."                    NOT EXISTS (\n"
                    ."                        SELECT 1 FROM conversation_custom_field ccf_e\n"
                    ."                        WHERE ccf_e.conversation_id = c.id\n"
                    ."                          AND ccf_e.custom_field_id = ?\n"
                    ."                          AND COALESCE(ccf_e.value, '') <> ''\n"
                    ."                    )\n"
                    ."                )",
                'bindings' => [$fieldId],
            ];
        }

        $includeEmpty = false;
        $values = [];
        foreach ($fieldValues as $value) {
            $value = (string)$value;
            if ($value === '__empty__' || trim($value) === '') {
                $includeEmpty = true;
                continue;
            }
            $values[] = $value;
        }

        if (!count($values) && !$includeEmpty) {
            if ($q !== '') {
                return [
                    'sql' => " AND EXISTS (\n"
                        ."                    SELECT 1 FROM conversation_custom_field ccf\n"
                        ."                    WHERE ccf.conversation_id = c.id\n"
                        ."                      AND ccf.custom_field_id = ?\n"
                        ."                      AND ccf.value $likeOp ?\n"
                        ."                )",
                    'bindings' => [$fieldId, '%'.$q.'%'],
                ];
            }

            return [
                'sql' => " AND EXISTS (\n"
                    ."                    SELECT 1 FROM conversation_custom_field ccf\n"
                    ."                    WHERE ccf.conversation_id = c.id\n"
                    ."                      AND ccf.custom_field_id = ?\n"
                    ."                )",
                'bindings' => [$fieldId],
            ];
        }

        $parts = [];
        $bindings = [];

        if (count($values)) {
            $valueSql = $this->buildCfOpValueMatchSql($fieldId, $fieldType, $filterOp, $values, $likeOp, $hasRealOptions);
            if (($valueSql['sql'] ?? '') !== '') {
                $parts[] = $valueSql['sql'];
                $bindings = array_merge($bindings, (array)($valueSql['bindings'] ?? []));
            }
        }

        if ($includeEmpty) {
            $parts[] = "(\n"
                ."                    NOT EXISTS (\n"
                ."                        SELECT 1 FROM conversation_custom_field ccf_e\n"
                ."                        WHERE ccf_e.conversation_id = c.id\n"
                ."                          AND ccf_e.custom_field_id = ?\n"
                ."                          AND COALESCE(ccf_e.value, '') <> ''\n"
                ."                    )\n"
                ."                )";
            $bindings[] = $fieldId;
        }

        if (!count($parts)) {
            return ['sql' => '', 'bindings' => []];
        }

        return [
            'sql' => ' AND ('.implode("\n                OR ", $parts).')',
            'bindings' => $bindings,
        ];
    }

    /**
     * Build EXISTS match for CF values honoring filter op + field type.
     *
     * @param array $values
     * @return array{sql:string,bindings:array}
     */
    protected function buildCfOpValueMatchSql(int $fieldId, int $fieldType, string $filterOp, array $values, string $likeOp, bool $hasRealOptions)
    {
        $existsOpen = "EXISTS (\n"
            ."                    SELECT 1 FROM conversation_custom_field ccf\n"
            ."                    WHERE ccf.conversation_id = c.id\n"
            ."                      AND ccf.custom_field_id = ?\n"
            ."                      AND ";
        $existsClose = "\n                )";

        // Number ops
        if ($fieldType === 4) {
            $numExpr = $this->cfNumericValueExpr('ccf.value');
            if ($filterOp === 'between') {
                $from = $values[0] ?? null;
                $to = $values[1] ?? null;
                if ($from === null || $to === null || $from === '' || $to === '') {
                    return ['sql' => '', 'bindings' => []];
                }
                return [
                    'sql' => $existsOpen."($numExpr >= ? AND $numExpr <= ?)".$existsClose,
                    'bindings' => [$fieldId, $from, $to],
                ];
            }
            $v = $values[0] ?? '';
            if ($v === '') {
                return ['sql' => '', 'bindings' => []];
            }
            if ($filterOp === 'gt') {
                return [
                    'sql' => $existsOpen."$numExpr > ?".$existsClose,
                    'bindings' => [$fieldId, $v],
                ];
            }
            if ($filterOp === 'lt') {
                return [
                    'sql' => $existsOpen."$numExpr < ?".$existsClose,
                    'bindings' => [$fieldId, $v],
                ];
            }
            // equals (default)
            return [
                'sql' => $existsOpen."$numExpr = ?".$existsClose,
                'bindings' => [$fieldId, $v],
            ];
        }

        // Date ops (compare as YYYY-MM-DD strings)
        if ($fieldType === 5) {
            $dateExpr = $this->cfDateValueExpr('ccf.value');
            if ($filterOp === 'between') {
                $from = $values[0] ?? null;
                $to = $values[1] ?? null;
                if ($from === null || $to === null || $from === '' || $to === '') {
                    return ['sql' => '', 'bindings' => []];
                }
                return [
                    'sql' => $existsOpen."($dateExpr >= ? AND $dateExpr <= ?)".$existsClose,
                    'bindings' => [$fieldId, $from, $to],
                ];
            }
            $v = $values[0] ?? '';
            if ($v === '') {
                return ['sql' => '', 'bindings' => []];
            }
            if ($filterOp === 'before') {
                return [
                    'sql' => $existsOpen."$dateExpr < ?".$existsClose,
                    'bindings' => [$fieldId, $v],
                ];
            }
            if ($filterOp === 'after') {
                return [
                    'sql' => $existsOpen."$dateExpr > ?".$existsClose,
                    'bindings' => [$fieldId, $v],
                ];
            }
            // on (default)
            return [
                'sql' => $existsOpen."$dateExpr = ?".$existsClose,
                'bindings' => [$fieldId, $v],
            ];
        }

        // Dropdown (type 1): is = multi-value OR on option keys
        if ($fieldType === 1 && ($filterOp === 'is' || $hasRealOptions)) {
            $in = implode(',', array_fill(0, count($values), '?'));
            return [
                'sql' => $existsOpen."ccf.value IN ($in)".$existsClose,
                'bindings' => array_merge([$fieldId], $values),
            ];
        }

        // Multiselect (type 8): contains_any on stored LABELS via FIND_IN_SET
        if ($fieldType === 8 || ($filterOp === 'contains_any' && $hasRealOptions && $fieldType !== 7)) {
            $orParts = [];
            $bindings = [$fieldId];
            foreach ($values as $token) {
                $csv = $this->cfCsvContainsSql('ccf.value', (string)$token);
                $orParts[] = $csv['sql'];
                $bindings = array_merge($bindings, $csv['bindings']);
            }
            return [
                'sql' => $existsOpen.'('.implode(' OR ', $orParts).')'.$existsClose,
                'bindings' => $bindings,
            ];
        }

        // Tags (type 7): contains_any — CSV membership OR
        if ($fieldType === 7 || $filterOp === 'contains_any') {
            $orParts = [];
            $bindings = [$fieldId];
            foreach ($values as $token) {
                $csv = $this->cfCsvContainsSql('ccf.value', (string)$token);
                $orParts[] = $csv['sql'];
                $bindings = array_merge($bindings, $csv['bindings']);
            }
            return [
                'sql' => $existsOpen.'('.implode(' OR ', $orParts).')'.$existsClose,
                'bindings' => $bindings,
            ];
        }

        // Text: is = exact equality
        if ($filterOp === 'is' || $filterOp === 'equals') {
            $eqParts = [];
            foreach ($values as $value) {
                $eqParts[] = 'ccf.value = ?';
            }
            return [
                'sql' => $existsOpen.'('.implode(' OR ', $eqParts).')'.$existsClose,
                'bindings' => array_merge([$fieldId], $values),
            ];
        }

        // Text: contains (default) — LIKE %v%
        $likeParts = [];
        $bindings = [$fieldId];
        foreach ($values as $value) {
            $likeParts[] = "ccf.value $likeOp ?";
            $bindings[] = '%'.$value.'%';
        }
        return [
            'sql' => $existsOpen.'('.implode(' OR ', $likeParts).')'.$existsClose,
            'bindings' => $bindings,
        ];
    }
}
