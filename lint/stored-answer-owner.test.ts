import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    gritPath,
    renderStoredAnswerOwnerGrit,
    storedAnswerOwners,
} from './stored-answer-owners.mjs';

type Case = Readonly<{ name: string; file: string; source: string; expected: string | null }>;

const nonOwner = 'db/unrelated-module.ts';

const invalid = (name: string, source: string, expected: string, file = nonOwner): Case => ({
    name,
    file,
    source,
    expected,
});
const valid = (name: string, source: string, file = nonOwner): Case => ({
    name,
    file,
    source,
    expected: null,
});

const cases: readonly Case[] = [
    invalid(
        'Drizzle update on a guarded table',
        `import { discoveryTargets } from './discovery-target-schema';
        await db.update(discoveryTargets).set({ enabled: false });`,
        'discovery_targets feeds'
    ),
    invalid(
        'Drizzle insert through a transaction',
        'await tx.insert(keywordProducts).values(rows);',
        'keyword_products feeds'
    ),
    invalid(
        'Drizzle delete on any receiver',
        'await transaction.delete(productFacets).where(where);',
        'product_facets feeds'
    ),
    invalid(
        'a namespace member',
        'await db.delete(schema.productHistorySeries);',
        'product_history_series feeds'
    ),
    invalid(
        'raw SQL update in a tagged template',
        'await tx.execute(sql`update discovery_targets set enabled=false where id=${id}`);',
        'discovery_targets feeds'
    ),
    invalid(
        'multi-line raw SQL insert',
        `await tx.execute(sql\`
            INSERT INTO
                keyword_products (query_id, product_id)
            values (\${queryId}, \${productId})\`);`,
        'keyword_products feeds'
    ),
    invalid(
        'a CTE update of a quoted table',
        `await tx.execute(sql\`with data as (select 1)
            update "keyword_exploration_passes" p set claim_at=null from data\`);`,
        'keyword_exploration_passes feeds'
    ),
    invalid(
        'raw SQL delete in a sql.raw string',
        "const statement = sql.raw('delete from keyword_directory where true');",
        'keyword_directory feeds'
    ),
    invalid(
        'a Drizzle Product update of a guarded column',
        'await db.update(products).set({ isMerchListing: true }).where(where);',
        'products feeds'
    ),
    invalid(
        'a Drizzle Product update with a guarded column in one branch',
        'await db.update(products).set(ok ? { title } : { hasNiche: false });',
        'products feeds'
    ),
    invalid(
        'a Drizzle Product update whose columns cannot be read',
        'await db.update(products).set(patch).where(where);',
        'products feeds'
    ),
    invalid(
        'a Drizzle Product update that spreads',
        'await db.update(products).set({ ...patch, title });',
        'products feeds'
    ),
    invalid(
        'a Drizzle Product update with no set in the chain',
        'const query = db.update(products);',
        'products feeds'
    ),
    invalid(
        'a raw Product update of a guarded column',
        'await tx.execute(sql`update products set amazon_listing_status=${status}`);',
        'products feeds'
    ),
    invalid(
        'a Drizzle Product insert',
        'await db.insert(products).values(rows);',
        'products feeds'
    ),
    invalid(
        'a raw Product delete',
        'await tx.execute(sql`delete from products where id=${id}`);',
        'products feeds'
    ),
    valid(
        'an unrelated table',
        `await db.update(operations).set({ status: 'completed' });
        await db.execute(sql\`update operations set status='failed'\`);`
    ),
    valid(
        'reads of a guarded table',
        `await db.select().from(discoveryTargets).for('update');
        await db.execute(sql\`select 1 from discovery_targets for update of discovery_targets\`);`
    ),
    valid(
        'an upsert whose conflict clause updates',
        `await db.execute(sql\`insert into operations (id) values (1)
            on conflict (id) do update set id=excluded.id\`);`
    ),
    valid(
        'a Product update of columns no stored answer reads',
        `await db.update(products).set(ok ? { historyAdmissionState: 'admitted' } : { facetsState: 'error' });
        await db.update(products).set({ representativeAsin: sql\`coalesce(\${products.representativeAsin}, \${asin})\` });
        await tx.execute(sql\`update products set representative_asin=null where id=1\`);`
    ),
    valid(
        'a same-named local that is not the table',
        `const keywordProducts = new Map();
        keywordProducts.delete(key);`
    ),
    valid(
        'a commented-out statement',
        'await db.execute(sql`select 1 -- delete from keyword_directory\n`);'
    ),
    valid(
        'a test file',
        'await db.update(discoveryTargets).set({ enabled: false });',
        'db/unrelated-module.test.ts'
    ),
    ...storedAnswerOwners.flatMap(entry => {
        const source = `await tx.insert(${entry.binding}).values(rows);
        await tx.execute(sql\`delete from ${entry.table} where id=\${id}\`);`;
        return [
            invalid(`${entry.table} outside its owners`, source, entry.table),
            ...entry.owners.map(owner => valid(`${entry.table} in owner ${owner}`, source, owner)),
        ];
    }),
];

describe('stored-answer-owner', () => {
    let root = '';
    let diagnostics = new Map<string, string[]>();

    beforeAll(() => {
        root = mkdtempSync(join(tmpdir(), 'rankwrangler-lint-'));
        diagnostics = lint(root, cases);
    });

    afterAll(() => rmSync(root, { recursive: true, force: true }));

    it('is generated from the ownership map', () => {
        expect(readFileSync(gritPath, 'utf8')).toBe(renderStoredAnswerOwnerGrit());
    });

    for (const [index, testCase] of cases.entries()) {
        const kind = testCase.expected === null ? 'valid' : 'invalid';
        it(`${kind}: ${testCase.name}`, () => {
            const messages = diagnostics.get(caseFile(index, testCase)) ?? [];
            if (testCase.expected === null) {
                expect(messages).toEqual([]);
                return;
            }
            expect(messages.length).toBeGreaterThan(0);
            for (const message of messages) expect(message).toContain(testCase.expected);
        });
    }

    it('names the stored answer and the call to make', () => {
        for (const [index, testCase] of cases.entries()) {
            const entry = storedAnswerOwners.find(
                owner => testCase.name === `${owner.table} outside its owners`
            );
            if (!entry) continue;
            const [message] = diagnostics.get(caseFile(index, testCase)) ?? [];
            expect(message).toContain(entry.feeds);
            expect(message).toContain(entry.call);
        }
    });
});

// Writes each case under its own `<n>/apps/server/src/<file>` and lints them in one Biome run with
// the repo's configuration; returns the plugin messages by case file.
const lint = (root: string, all: readonly Case[]) => {
    for (const [index, testCase] of all.entries()) {
        const path = join(root, caseFile(index, testCase));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, testCase.source);
    }
    const result = spawnSync(
        biome,
        [
            'lint',
            `--config-path=${join(import.meta.dir)}`,
            '--reporter=github',
            '--max-diagnostics=none',
            '.',
        ],
        { cwd: root, encoding: 'utf8' }
    );
    const diagnostics = new Map<string, string[]>();
    for (const line of result.stdout.split('\n')) {
        const match = /^::error title=plugin,file=([^,]+),.*?::(.*)$/.exec(line);
        if (!match) continue;
        diagnostics.set(match[1], [...(diagnostics.get(match[1]) ?? []), match[2]]);
    }
    if (result.status !== 0 && diagnostics.size === 0)
        throw new Error(`biome lint failed without diagnostics:\n${result.stdout}${result.stderr}`);
    return diagnostics;
};

const caseFile = (index: number, testCase: Case) => `${index}/apps/server/src/${testCase.file}`;

const biome = join(import.meta.dir, '..', 'apps/server/node_modules/.bin/biome');
