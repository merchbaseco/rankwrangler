import { describe, expect, it } from 'bun:test';
import { parseDeployRevision } from '../../../scripts/deploy-revision';

const SHA = '3f9c0a8e5b1d4c7f9a2e6b8d0c1f3a5e7b9d2c4f';

const CASES = [
    {
        name: 'refuses an unreadable HEAD',
        head: undefined,
        trackedChanges: '',
        expected: { ok: false, problem: 'Could not read HEAD of the deploy checkout.' },
    },
    {
        name: 'refuses an uppercase SHA',
        head: '3F9C0A8E5B1D4C7F9A2E6B8D0C1F3A5E7B9D2C4F',
        trackedChanges: '',
        expected: {
            ok: false,
            problem:
                'HEAD is "3F9C0A8E5B1D4C7F9A2E6B8D0C1F3A5E7B9D2C4F", ' +
                'not a 40-character lowercase hex SHA.',
        },
    },
    {
        name: 'refuses a 39-character SHA',
        head: '3f9c0a8e5b1d4c7f9a2e6b8d0c1f3a5e7b9d2c4',
        trackedChanges: '',
        expected: {
            ok: false,
            problem:
                'HEAD is "3f9c0a8e5b1d4c7f9a2e6b8d0c1f3a5e7b9d2c4", ' +
                'not a 40-character lowercase hex SHA.',
        },
    },
    {
        name: 'refuses the dev placeholder',
        head: 'dev',
        trackedChanges: '',
        expected: { ok: false, problem: 'HEAD is "dev", not a 40-character lowercase hex SHA.' },
    },
    {
        name: 'refuses an unreadable git status',
        head: SHA,
        trackedChanges: undefined,
        expected: { ok: false, problem: 'Could not read git status of the deploy checkout.' },
    },
    {
        name: 'refuses tracked changes',
        head: SHA,
        trackedChanges: ' M apps/server/src/index.ts\n',
        expected: {
            ok: false,
            problem: 'Tracked files differ from HEAD, so HEAD does not describe the image.',
        },
    },
    {
        name: 'accepts a clean lowercase SHA',
        head: SHA,
        trackedChanges: '',
        expected: { ok: true, revision: SHA },
    },
    {
        name: 'accepts a raw rev-parse line as the same SHA',
        head: `${SHA}\n`,
        trackedChanges: '',
        expected: { ok: true, revision: SHA },
    },
];

describe('parseDeployRevision', () => {
    for (const { name, head, trackedChanges, expected } of CASES) {
        it(name, () => {
            expect(parseDeployRevision(head, trackedChanges)).toEqual(expected);
        });
    }
});
