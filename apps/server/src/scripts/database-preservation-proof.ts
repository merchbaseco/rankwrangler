import { readFile, writeFile } from 'node:fs/promises';
import postgres from 'postgres';
import { z } from 'zod';
import {
    createDatabaseConnectionOptions,
    databaseConfigurationSchema,
} from '../config/database-connection';
import {
    assertDatabasePreserved,
    captureDatabaseManifest,
    databaseManifestSchema,
} from './database-preservation';

const optionsSchema = z.discriminatedUnion('phase', [
    z.object({ phase: z.literal('capture'), manifest: z.string().min(1) }),
    z.object({ phase: z.literal('verify'), manifest: z.string().min(1) }),
]);

const main = async () => {
    const options = optionsSchema.parse(
        Object.fromEntries(
            process.argv.slice(2).map(argument => {
                const separator = argument.indexOf('=');
                if (!argument.startsWith('--') || separator < 0) {
                    throw new Error('Expected --phase=capture|verify --manifest=<path>.');
                }
                return [argument.slice(2, separator), argument.slice(separator + 1)];
            })
        )
    );
    const sql = postgres({
        ...createDatabaseConnectionOptions(
            databaseConfigurationSchema.parse(process.env),
            'direct'
        ),
        max: 1,
    });
    try {
        const manifest = await captureDatabaseManifest(sql);
        if (options.phase === 'capture') {
            await writeFile(options.manifest, `${JSON.stringify(manifest, null, 2)}\n`, {
                flag: 'wx',
                mode: 0o600,
            });
        } else {
            const before = databaseManifestSchema.parse(
                JSON.parse(await readFile(options.manifest, 'utf8'))
            );
            assertDatabasePreserved(before, manifest);
        }
        console.log(
            JSON.stringify({
                phase: options.phase,
                tables: manifest.tables.length,
                rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
                sequences: manifest.sequences.length,
                result: options.phase === 'verify' ? 'preserved' : 'captured',
            })
        );
    } finally {
        await sql.end();
    }
};

main().catch(error => {
    if (error instanceof z.ZodError) {
        console.error(
            'Invalid preservation manifest or database settings.',
            error.issues.map(issue => ({ code: issue.code, path: issue.path }))
        );
    } else {
        console.error(
            error instanceof Error ? error.message : 'Database preservation proof failed.'
        );
    }
    process.exitCode = 1;
});
