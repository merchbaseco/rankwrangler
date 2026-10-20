import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { decideDeploy, runSync } from './sync-production-checkout.mjs';

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('decideDeploy', () => {
    const shas = {
        liveSha: 'a'.repeat(40),
        targetSha: 'b'.repeat(40),
    };

    it('fast-forwards when the target is a descendant', () => {
        expect(decideDeploy({ relation: 'descendant', explicitRef: false, ...shas })).toEqual({
            decision: 'fast-forward',
            deployed: true,
            message: `Fast-forwarding production from ${shas.liveSha} to ${shas.targetSha}.`,
        });
    });

    it('skips an already-deployed commit unless the dispatch named a ref', () => {
        expect(
            decideDeploy({
                relation: 'same',
                explicitRef: false,
                liveSha: shas.liveSha,
                targetSha: shas.liveSha,
            }).decision,
        ).toBe('skip');
        expect(
            decideDeploy({
                relation: 'same',
                explicitRef: true,
                liveSha: shas.liveSha,
                targetSha: shas.liveSha,
            }).decision,
        ).toBe('redeploy');
    });

    it('skips an older commit unless the dispatch named a ref', () => {
        expect(decideDeploy({ relation: 'ancestor', explicitRef: false, ...shas }).decision).toBe(
            'skip',
        );
        expect(decideDeploy({ relation: 'ancestor', explicitRef: true, ...shas }).decision).toBe(
            'rollback',
        );
    });

    it('refuses a diverged checkout even when the dispatch named a ref', () => {
        expect(decideDeploy({ relation: 'diverged', explicitRef: true, ...shas })).toMatchObject({
            decision: 'fail',
            deployed: false,
        });
    });
});

describe('runSync', () => {
    it('fast-forwards a shallow clone to a descendant and leaves a dirty tree alone', () => {
        const { bare, first } = seedRemote();
        const checkout = cloneShallow(bare);
        const second = pushCommit(bare, 'two\n');

        writeFileSync(path.join(checkout, 'file'), 'dirty\n');
        expect(() =>
            runSync({ checkout, targetSha: second, explicitRef: false, fetchRemote: true }),
        ).toThrow('will not be wiped');
        expect(readFileSync(path.join(checkout, 'file'), 'utf8')).toBe('dirty\n');
        expect(head(checkout)).toBe(first);

        spawnSync('git', ['checkout', '--', 'file'], { cwd: checkout });
        const decision = runSync({
            checkout,
            targetSha: second,
            explicitRef: false,
            fetchRemote: true,
        });
        expect(decision.decision).toBe('fast-forward');
        expect(head(checkout)).toBe(second);
        expect(readFileSync(path.join(checkout, 'file'), 'utf8')).toBe('two\n');
    });

    it('skips an older commit and rolls back only for an explicit ref', () => {
        const { bare, first } = seedRemote();
        const second = pushCommit(bare, 'two\n');
        const checkout = cloneShallow(bare);

        const skipped = runSync({
            checkout,
            targetSha: first,
            explicitRef: false,
            fetchRemote: true,
        });
        expect(skipped).toMatchObject({ decision: 'skip', deployed: false });
        expect(head(checkout)).toBe(second);

        const rolled = runSync({
            checkout,
            targetSha: first,
            explicitRef: true,
            fetchRemote: true,
        });
        expect(rolled.decision).toBe('rollback');
        expect(head(checkout)).toBe(first);
        expect(readFileSync(path.join(checkout, 'file'), 'utf8')).toBe('one\n');
    });

    it('fails when production has diverged and does not move HEAD', () => {
        const { bare } = seedRemote();
        const checkout = cloneFull(bare);
        writeFileSync(path.join(checkout, 'file'), 'local\n');
        git(checkout, 'add', 'file');
        git(checkout, 'commit', '-m', 'local');
        const local = head(checkout);
        const second = pushCommit(bare, 'two\n');

        expect(() =>
            runSync({ checkout, targetSha: second, explicitRef: true, fetchRemote: true }),
        ).toThrow('will not be wiped');
        expect(head(checkout)).toBe(local);
        expect(readFileSync(path.join(checkout, 'file'), 'utf8')).toBe('local\n');
    });
});

const seedRemote = () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rw-sync-'));
    roots.push(root);
    const bare = path.join(root, 'origin.git');
    const seed = path.join(root, 'seed');
    git(root, 'init', '--bare', '-b', 'main', bare);
    git(root, 'init', '-b', 'main', seed);
    configure(seed);
    writeFileSync(path.join(seed, 'file'), 'one\n');
    git(seed, 'add', 'file');
    git(seed, 'commit', '-m', 'one');
    const first = head(seed);
    git(seed, 'remote', 'add', 'origin', bare);
    git(seed, 'push', '-u', 'origin', 'main');
    return { root, bare, seed, first };
};

const pushCommit = (bare: string, contents: string) => {
    const seed = path.join(path.dirname(bare), 'seed');
    writeFileSync(path.join(seed, 'file'), contents);
    git(seed, 'add', 'file');
    git(seed, 'commit', '-m', contents.trim());
    git(seed, 'push', 'origin', 'main');
    return head(seed);
};

const cloneShallow = (bare: string) => cloneAt(bare, ['--depth', '1']);

const cloneFull = (bare: string) => cloneAt(bare, []);

const cloneAt = (bare: string, args: string[]) => {
    const checkout = path.join(path.dirname(bare), 'checkout');
    git(path.dirname(bare), 'clone', ...args, `file://${bare}`, checkout);
    configure(checkout);
    return checkout;
};

const configure = (cwd: string) => {
    git(cwd, 'config', 'user.email', 'test@example.com');
    git(cwd, 'config', 'user.name', 'test');
    git(cwd, 'config', 'commit.gpgsign', 'false');
    git(cwd, 'config', 'tag.gpgsign', 'false');
};

const head = (cwd: string) => git(cwd, 'rev-parse', 'HEAD');

const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result.stdout.trim();
};
