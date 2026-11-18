import { writeFileSync } from 'node:fs';

/**
 * Who may write each input of a stored ("write owns it") answer: the source of
 * `stored-answer-owner.grit`, the Biome plugin `bun run lint` runs over `apps/server/src`. Paths are
 * relative to `apps/server/src`. Every owner module rewrites the answer in the same transaction as
 * its write; add a module here only when that is true, and prefer moving the write into an owner.
 * After editing, run `bun lint/stored-answer-owners.mjs` to regenerate the plugin (the rule's test
 * fails while the two differ).
 *
 * `columns` narrows a Drizzle `update` to the `set` keys that feed an answer, and a raw SQL
 * `update` to a `set` followed by one of the column names or an interpolation; inserts and deletes
 * of that table are always guarded. The dev seed (`dev-seed/write-plan.ts`) writes every table
 * through a runtime table map, which the rule cannot see, and syncs every target after.
 *
 * @type {readonly {
 *   table: string;
 *   binding: string;
 *   feeds: string;
 *   call: string;
 *   owners: readonly string[];
 *   columns?: Readonly<Record<string, string>>;
 * }[]}
 */
export const storedAnswerOwners = [
    {
        table: 'discovery_targets',
        binding: 'discoveryTargets',
        feeds: 'discovery_targets.scan_due_at/scan_depth/autocompleted and keyword_directory',
        call: 'syncKeywordTargets',
        owners: [
            'db/keyword-target-sync.ts',
            'db/discovery-candidates.ts',
            'db/discovery-work.ts',
            'db/discovery-checkpoint.ts',
            'db/refresh-keyword-standings.ts',
            'db/keyword-directory-notifications.ts',
        ],
    },
    {
        table: 'keyword_exploration_passes',
        binding: 'keywordExplorationPasses',
        feeds: 'discovery_targets.scan_due_at/scan_depth and keyword_directory',
        call: 'syncKeywordTargets',
        owners: ['db/discovery-work.ts', 'db/discovery-checkpoint.ts'],
    },
    {
        table: 'keyword_products',
        binding: 'keywordProducts',
        feeds: 'keyword_directory.product_count/merch_count',
        call: "syncKeywordTargets(tx, ids, 'all') or refreshKeywordQueryRows",
        owners: [
            'db/discovery-checkpoint.ts',
            'db/keyword-observation.ts',
            'db/keyword-directory-notifications.ts',
        ],
    },
    {
        table: 'keyword_autocomplete',
        binding: 'keywordAutocomplete',
        feeds: 'discovery_targets.autocompleted',
        call: 'refreshKeywordQueryRows',
        owners: ['db/keyword-autocomplete-work.ts'],
    },
    {
        table: 'keyword_directory',
        binding: 'keywordDirectory',
        feeds: 'the Keywords directory (it is the stored answer)',
        call: 'syncKeywordTargets',
        owners: ['db/keyword-target-sync.ts'],
    },
    {
        table: 'product_facets',
        binding: 'productFacets',
        feeds: 'products.has_niche',
        call: 'replaceProductFacetsByMarketplaceAsin',
        owners: ['services/product-facet-store.ts', 'db/product/merge-products.ts'],
    },
    {
        table: 'product_facet_values',
        binding: 'productFacetValues',
        feeds: 'products.has_niche (through product_facets)',
        call: 'replaceProductFacetsByMarketplaceAsin',
        owners: ['services/product-facet-store.ts'],
    },
    {
        table: 'product_history_series',
        binding: 'productHistorySeries',
        feeds: 'product_history_series.lowest_point',
        call: 'writeProductHistorySeries',
        owners: ['db/product/product-history-series.ts', 'db/product/merge-products.ts'],
    },
    {
        table: 'products',
        binding: 'products',
        feeds: 'keyword_directory.merch_count and shelf, and products.has_niche',
        call: 'refreshKeywordProductRows (replaceProductFacetsByMarketplaceAsin for has_niche)',
        columns: {
            isMerchListing: 'is_merch_listing',
            amazonListingStatus: 'amazon_listing_status',
            hasNiche: 'has_niche',
        },
        owners: [
            'db/product/upsert-product.ts',
            'db/product/persist-normalized-keepa-product.ts',
            'db/product/get-products.ts',
            'db/product/merge-products.ts',
            'services/product-facet-store.ts',
        ],
    },
];

export const gritPath = new URL('./stored-answer-owner.grit', import.meta.url);

/** The Biome GritQL plugin for `storedAnswerOwners`, as committed in `stored-answer-owner.grit`. */
export const renderStoredAnswerOwnerGrit = () =>
    [
        header,
        ...storedAnswerOwners.filter(entry => entry.columns).map(columnUpdate),
        'or {',
        storedAnswerOwners.map(entry => indent(clause(entry))).join(',\n\n'),
        '}',
        '',
    ].join('\n');

// Grit regexes match the whole node text and turn capture groups into variables, so every group
// is non-capturing. `\x22` is a double quote (Grit string escapes are unreliable). The leading
// `(?:[^\n-]|-[^\n-])*?` keeps the statement off a `--` comment line.
const header = String.raw`language js

// Generated from lint/stored-answer-owners.mjs by bun lint/stored-answer-owners.mjs; do not edit.
// A table that feeds a stored answer is written only from its owner modules, which rewrite the
// answer in the same transaction. Matches a Drizzle insert/update/delete on the table binding (or
// <namespace>.<binding>) and SQL text in a template literal or a raw/execute/unsafe string.

pattern drizzle_write($table) {
    or { ${'`$_.insert($table)`'}, ${'`$_.update($table)`'}, ${'`$_.delete($table)`'} }
}

pattern drizzle_insert_or_delete($table) {
    or { ${'`$_.insert($table)`'}, ${'`$_.delete($table)`'} }
}

pattern sql_text() {
    or {
        JsTemplateExpression(),
        JsStringLiteralExpression() as $text where {
            $text <: within or { ${'`$_.raw($text)`'}, ${'`$_.execute($text)`'}, ${'`$_.unsafe($text)`'} }
        }
    }
}
`;

const sqlStatement = (verbs, table) =>
    String.raw`(?is)(?:.*\n)?(?:[^\n-]|-[^\n-])*?\b(?:${verbs})\s+(?:only\s+)?(?:public\s*\.\s*)?\x22?${table}\b`;

// An update counts unless it is followed by a readable set (an object literal, or a conditional
// between two) that names none of the guarded columns and spreads nothing. Grit cannot take a regex
// as a pattern argument, so each table with columns gets its own pattern.
const columnUpdate = entry => String.raw`pattern column_update_${entry.table}($table) {
    ${'`$_.update($table)`'} as $update where {
        or {
            not $update <: within ${'`$update.set($_)`'},
            $update <: within ${'`$update.set($values)`'} where {
                $values <: or {
                    and { not JsObjectExpression(), not JsConditionalExpression() },
                    r"(?s).*(?:\.\.\.|\b(?:${Object.keys(entry.columns).join('|')})\b).*",
                    ${'`$_ ? $yes : $no`'} where {
                        or { $yes <: not JsObjectExpression(), $no <: not JsObjectExpression() }
                    }
                }
            }
        }
    }
}
`;

const clause = entry => {
    const owners = `.*/apps/server/src/(?:${entry.owners
        .map(owner => owner.replace(/\.ts$/, '').replaceAll('.', '\\.'))
        .join('|')})\\.ts`;
    const message = `${entry.table} feeds ${entry.feeds}. Write it from an owner module (${entry.owners.join(', ')}) or call ${entry.call} in the same transaction and add the module to lint/stored-answer-owners.mjs.`;
    if (/["\\]/.test(message)) throw new Error(`Grit messages cannot hold " or \\: ${message}`);
    const table = `or { \`${entry.binding}\`, \`$_.${entry.binding}\` }`;
    const columns = entry.columns;
    const drizzle = columns
        ? `or { drizzle_insert_or_delete(table=${table}), column_update_${entry.table}(table=${table}) }`
        : `drizzle_write(table=${table})`;
    const sql = columns
        ? [
              `r"${sqlStatement('insert\\s+into|delete\\s+from', entry.table)}.*"`,
              `r"${sqlStatement('update', entry.table)}[^;]*?\\bset\\b[^;]*(?:${Object.values(columns).join('|')}|\\$\\{).*"`,
          ]
        : [`r"${sqlStatement('insert\\s+into|update|delete\\s+from', entry.table)}.*"`];
    return `// ${entry.table}
or {
    ${drizzle},
    and { sql_text(), or { ${sql.join(', ')} } }
} as $write where {
    not $filename <: r"${owners}",
    register_diagnostic(span=$write, message="${message}", severity="error")
}`;
};

const indent = text =>
    text
        .split('\n')
        .map(line => (line ? `    ${line}` : line))
        .join('\n');

if (import.meta.main) writeFileSync(gritPath, renderStoredAnswerOwnerGrit());
