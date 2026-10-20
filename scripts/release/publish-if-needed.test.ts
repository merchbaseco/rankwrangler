import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'bun:test';
import { publishedPackages } from './published-packages.mjs';
import { publishUnpublished, readRemoteTag } from './publish-if-needed.mjs';

const headSha = 'a'.repeat(40);
const olderSha = 'b'.repeat(40);

describe('publishUnpublished', () => {
    it('publishes missing packages in order and tags the commit that introduced the version', async () => {
        const published: string[] = [];
        const tags: Array<{ tag: string; commit: string }> = [];
        const result = await publishUnpublished({
            checkout: '/repo',
            headSha,
            packages: publishedPackages,
            readVersion: async (_checkout, pkg) =>
                pkg.name === '@rankwrangler/cli' ? '0.9.0' : '0.9.0',
            npmHasVersion: async (name, version) => {
                expect(version).toBe('0.9.0');
                return published.includes(name);
            },
            prepare: async () => {},
            publish: async (_checkout, pkg) => {
                published.push(pkg.name);
            },
            remoteTag: async () => null,
            createAndPushTag: async (_checkout, tag, commit) => {
                tags.push({ tag, commit });
            },
            versionCommit: async () => olderSha,
        });

        expect(published).toEqual(['@rankwrangler/http-client', '@rankwrangler/cli']);
        expect(tags).toEqual([{ tag: 'v0.9.0', commit: olderSha }]);
        expect(result.published).toEqual(published);
        expect(result.tagged).toBe(true);
    });

    it('does nothing when npm and the tag already match the source version', async () => {
        let tagged = false;
        const result = await publishUnpublished({
            checkout: '/repo',
            headSha,
            readVersion: async () => '0.9.0',
            npmHasVersion: async () => true,
            prepare: async () => {
                throw new Error('prepare should not run');
            },
            publish: async () => {
                throw new Error('publish should not run');
            },
            remoteTag: async () => olderSha,
            createAndPushTag: async () => {
                tagged = true;
            },
            versionCommit: async () => olderSha,
        });

        expect(result.published).toEqual([]);
        expect(result.tagged).toBe(false);
        expect(tagged).toBe(false);
    });

    it('refuses to move an existing tag while publishing', async () => {
        const published = new Set<string>();
        await expect(
            publishUnpublished({
                checkout: '/repo',
                headSha,
                readVersion: async () => '0.9.0',
                npmHasVersion: async name => published.has(name),
                prepare: async () => {},
                publish: async (_checkout, pkg) => {
                    published.add(pkg.name);
                },
                remoteTag: async () => olderSha,
                createAndPushTag: async () => {
                    throw new Error('tag should not be pushed');
                },
                versionCommit: async () => headSha,
            }),
        ).rejects.toThrow(`v0.9.0 points at ${olderSha}, not ${headSha}.`);
    });
});

describe('readRemoteTag', () => {
    const roots: string[] = [];

    afterEach(() => {
        for (const root of roots.splice(0)) {
            rmSync(root, { recursive: true, force: true });
        }
    });

    it('returns the commit an annotated tag points at', () => {
        const root = mkdtempSync(path.join(tmpdir(), 'rw-tag-'));
        roots.push(root);
        const bare = path.join(root, 'origin.git');
        const checkout = path.join(root, 'checkout');
        git(root, 'init', '--bare', '-b', 'main', bare);
        git(root, 'clone', `file://${bare}`, checkout);
        git(checkout, 'config', 'user.email', 'test@example.com');
        git(checkout, 'config', 'user.name', 'test');
        git(checkout, 'config', 'commit.gpgsign', 'false');
        git(checkout, 'config', 'tag.gpgsign', 'false');
        writeFileSync(path.join(checkout, 'file'), 'one\n');
        git(checkout, 'add', 'file');
        git(checkout, 'commit', '-m', 'one');
        const commit = git(checkout, 'rev-parse', 'HEAD');
        git(checkout, 'tag', '-a', 'v0.1.0', '-m', 'v0.1.0');
        git(checkout, 'push', 'origin', 'main', 'v0.1.0');
        git(checkout, 'tag', '-d', 'v0.1.0');

        const tagObject = git(bare, 'rev-parse', 'v0.1.0');
        expect(tagObject).not.toBe(commit);
        expect(readRemoteTag(checkout, 'v0.1.0')).toBe(commit);
    });
});

const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
    }
    return result.stdout.trim();
};
