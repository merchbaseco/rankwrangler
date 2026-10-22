import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export const captureRowFingerprint = async (batches: AsyncIterable<readonly { row: string }[]>) => {
    const directory = await mkdtemp(join(tmpdir(), 'rankwrangler-fingerprints-'));
    const sorter = spawn('sort', ['-S', '64M', '-T', directory], {
        env: { PATH: process.env.PATH, LC_ALL: 'C' },
        stdio: 'pipe',
    });
    const closed = new Promise<{ code: number | null; error?: Error }>(resolve => {
        sorter.once('error', error => resolve({ code: null, error }));
        sorter.once('close', code => resolve({ code }));
    });
    const hash = createHash('sha256');
    let rows = 0;
    let outputBytes = 0;
    let outputError: Error | undefined;
    sorter.stdout.on('data', (chunk: Buffer) => {
        hash.update(chunk);
        outputBytes += chunk.length;
    });
    sorter.stdout.on('error', error => {
        outputError = error;
        sorter.kill('SIGTERM');
    });
    sorter.stderr.resume();
    const encodedRows = async function* () {
        for await (const batch of batches) {
            rows += batch.length;
            if (batch.length) yield `${batch.map(value => value.row).join('\n')}\n`;
        }
    };
    try {
        await once(sorter, 'spawn');
        await pipeline(Readable.from(encodedRows()), sorter.stdin);
        const result = await closed;
        if (outputError || result.error || result.code !== 0 || outputBytes !== rows * 65) {
            throw new Error('Fingerprint sort failed. Check system sort and local scratch space.');
        }
        return { rows, sha256: hash.digest('hex') };
    } finally {
        if (sorter.exitCode === null && sorter.signalCode === null) sorter.kill('SIGTERM');
        await closed;
        const cleanup = spawnSync('trash', [directory], { stdio: 'ignore' });
        if (cleanup.error || cleanup.status !== 0) {
            throw new Error(`Cannot clean fingerprint scratch directory: ${directory}`);
        }
    }
};
