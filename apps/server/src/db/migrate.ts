import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { env } from '@/config/env.js';

const CENTRAL_AUTH_CUTOVER_MIGRATION = '0028_groovy_black_tom';
const MIGRATION_TAG_PATTERN = /^\d{4}_[a-z0-9_]+$/;

export type DatabaseMigrationTarget = 'latest' | 'pre-cutover';

interface MigrationJournalEntry {
    readonly breakpoints: boolean;
    readonly idx: number;
    readonly tag: string;
    readonly version: string;
    readonly when: number;
}

interface MigrationJournal {
    readonly dialect: string;
    readonly entries: MigrationJournalEntry[];
    readonly version: string;
}

export const runMigrations = async (
    migrationsFolder = process.env.MIGRATIONS_FOLDER ?? './drizzle',
    target: DatabaseMigrationTarget = env.DATABASE_MIGRATION_TARGET
) => {
    console.log(`[Migration] Starting database migrations (target: ${target})...`);

    try {
        const selection = createMigrationSelection(migrationsFolder, target);
        try {
            const migrationClient = createMigrationClient();

            try {
                await migrate(drizzle(migrationClient), {
                    migrationsFolder: selection.folder,
                    migrationsTable: '__drizzle_migrations',
                });
            } finally {
                await migrationClient.end();
            }

            console.log(
                `[Migration] Applied target ${target} (${selection.selectedCount}/${selection.totalCount} migrations)`
            );
        } finally {
            selection.cleanup();
        }
    } catch (error) {
        console.error('[Migration] Migration failed:', error);
        throw error;
    }
};

export const verifyMigrationTarget = async (
    migrationsFolder = process.env.MIGRATIONS_FOLDER ?? './drizzle',
    target: DatabaseMigrationTarget = env.DATABASE_MIGRATION_TARGET
) => {
    const entries = selectMigrationEntries(readMigrationJournal(migrationsFolder).entries, target);
    const expected = entries.at(-1);
    if (!expected) {
        throw new Error(`Migration target ${target} does not contain any migrations.`);
    }

    const migrationClient = createMigrationClient();
    try {
        const rows = await migrationClient<{ createdAt: string }[]>`
            select created_at::text as "createdAt"
            from drizzle.__drizzle_migrations
            order by created_at desc
            limit 1
        `;
        const actual = Number(rows[0]?.createdAt);
        if (!Number.isSafeInteger(actual) || actual < expected.when) {
            throw new Error(
                `Database migration target ${target} is not applied through ${expected.tag}.`
            );
        }
        console.log(`[Migration] Verified target ${target} through ${expected.tag}`);
    } finally {
        await migrationClient.end();
    }
};

export const selectMigrationEntries = (
    entries: readonly MigrationJournalEntry[],
    target: DatabaseMigrationTarget
): MigrationJournalEntry[] => {
    const cutoverIndex = entries.findIndex(entry => entry.tag === CENTRAL_AUTH_CUTOVER_MIGRATION);
    if (cutoverIndex === -1) {
        throw new Error(`Missing guarded migration ${CENTRAL_AUTH_CUTOVER_MIGRATION}.`);
    }
    return target === 'latest' ? [...entries] : entries.slice(0, cutoverIndex);
};

export const resolveMigrationTargetForCommand = (
    args: readonly string[],
    configuredTarget: DatabaseMigrationTarget
): DatabaseMigrationTarget =>
    args.includes('--bootstrap-access-projection') ? 'pre-cutover' : configuredTarget;

const createMigrationSelection = (migrationsFolder: string, target: DatabaseMigrationTarget) => {
    const journal = readMigrationJournal(migrationsFolder);
    const entries = selectMigrationEntries(journal.entries, target);
    if (target === 'latest') {
        return {
            cleanup: () => undefined,
            folder: migrationsFolder,
            selectedCount: entries.length,
            totalCount: journal.entries.length,
        };
    }

    const folder = mkdtempSync(join(tmpdir(), 'rankwrangler-migrations-'));
    mkdirSync(join(folder, 'meta'));
    writeFileSync(
        join(folder, 'meta', '_journal.json'),
        `${JSON.stringify({ ...journal, entries }, null, 2)}\n`
    );
    for (const entry of entries) {
        cpSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
    }

    return {
        cleanup: () => rmSync(folder, { force: true, recursive: true }),
        folder,
        selectedCount: entries.length,
        totalCount: journal.entries.length,
    };
};

const readMigrationJournal = (migrationsFolder: string): MigrationJournal => {
    const value: unknown = JSON.parse(
        readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8')
    );
    if (!isMigrationJournal(value)) {
        throw new Error('Invalid Drizzle migration journal.');
    }
    return value;
};

const createMigrationClient = () =>
    postgres({
        host: env.DATABASE_HOST || 'postgres',
        port: env.DATABASE_PORT || 5432,
        database: env.DATABASE_NAME || 'rankwrangler',
        username: env.DATABASE_USER || 'rankwrangler',
        password: env.DATABASE_PASSWORD || 'SecurePass123',
        max: 1,
        onnotice: process.env.NODE_ENV === 'development' ? console.log : undefined,
    });

const isMigrationJournal = (value: unknown): value is MigrationJournal =>
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof value.version === 'string' &&
    'dialect' in value &&
    typeof value.dialect === 'string' &&
    'entries' in value &&
    Array.isArray(value.entries) &&
    value.entries.every(
        entry =>
            typeof entry === 'object' &&
            entry !== null &&
            'idx' in entry &&
            typeof entry.idx === 'number' &&
            'version' in entry &&
            typeof entry.version === 'string' &&
            'when' in entry &&
            typeof entry.when === 'number' &&
            'tag' in entry &&
            typeof entry.tag === 'string' &&
            MIGRATION_TAG_PATTERN.test(entry.tag) &&
            'breakpoints' in entry &&
            typeof entry.breakpoints === 'boolean'
    );
