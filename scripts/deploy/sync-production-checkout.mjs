import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const shaPattern = /^[0-9a-f]{40}$/;

const moveCheckout = {
    'fast-forward': ['merge', '--ff-only'],
    rollback: ['reset', '--keep'],
};

export const decideDeploy = ({ relation, explicitRef, targetSha, liveSha }) => {
    switch (relation) {
        case 'descendant':
            return {
                decision: 'fast-forward',
                deployed: true,
                message: `Fast-forwarding production from ${liveSha} to ${targetSha}.`,
            };
        case 'same':
            if (explicitRef) {
                return {
                    decision: 'redeploy',
                    deployed: true,
                    message: `Redeploying ${targetSha}.`,
                };
            }
            return {
                decision: 'skip',
                deployed: false,
                message: `Skipping ${targetSha}. Production is already at that commit.`,
            };
        case 'ancestor':
            if (explicitRef) {
                return {
                    decision: 'rollback',
                    deployed: true,
                    message: `Rolling production back from ${liveSha} to ${targetSha}.`,
                };
            }
            return {
                decision: 'skip',
                deployed: false,
                message: `Skipping ${targetSha}. It is older than production ${liveSha}.`,
            };
        case 'diverged':
            return {
                decision: 'fail',
                deployed: false,
                message: `Refusing to deploy ${targetSha}. Production ${liveSha} has diverged and will not be wiped.`,
            };
        default: {
            const unknown = relation;
            throw new Error(`Unknown ancestry relation: ${String(unknown)}`);
        }
    }
};

export const classifyRelation = ({ liveSha, targetSha, isAncestor }) => {
    if (liveSha === targetSha) {
        return 'same';
    }
    if (isAncestor(liveSha, targetSha)) {
        return 'descendant';
    }
    if (isAncestor(targetSha, liveSha)) {
        return 'ancestor';
    }
    return 'diverged';
};

export const runSync = ({ checkout, targetSha, explicitRef, fetchRemote = true }) => {
    if (!shaPattern.test(targetSha)) {
        throw new Error(`Target must be a 40-character lowercase SHA. Received: ${targetSha}`);
    }

    if (fetchRemote) {
        const shallow = git(checkout, ['rev-parse', '--is-shallow-repository']).stdout;
        if (shallow === 'true') {
            git(checkout, ['fetch', '--unshallow', 'origin']);
        }
        git(checkout, ['fetch', 'origin', 'main']);
    }

    const onMain = git(
        checkout,
        ['merge-base', '--is-ancestor', targetSha, 'origin/main'],
        [0, 1],
    );
    if (onMain.status !== 0) {
        throw new Error(`${targetSha} is not on origin/main.`);
    }

    const liveSha = git(checkout, ['rev-parse', 'HEAD']).stdout;
    const relation = classifyRelation({
        liveSha,
        targetSha,
        isAncestor: (ancestor, descendant) =>
            git(checkout, ['merge-base', '--is-ancestor', ancestor, descendant], [0, 1])
                .status === 0,
    });
    const decision = decideDeploy({ relation, explicitRef, targetSha, liveSha });
    console.log(decision.message);

    if (decision.decision !== 'skip' && decision.decision !== 'fail') {
        const branch = git(checkout, ['symbolic-ref', '--quiet', 'HEAD'], [0, 1]);
        if (branch.status !== 0) {
            throw new Error('Production checkout is detached. Refusing to move it.');
        }
        const dirty = git(checkout, ['status', '--porcelain', '--untracked-files=no']).stdout;
        if (dirty) {
            throw new Error(
                `Production checkout has tracked changes and will not be wiped:\n${dirty}`,
            );
        }
        const move = moveCheckout[decision.decision];
        if (move) {
            git(checkout, [...move, targetSha]);
        } else if (decision.decision !== 'redeploy') {
            const unknown = decision.decision;
            throw new Error(`Unknown deploy decision: ${String(unknown)}`);
        }
        const head = git(checkout, ['rev-parse', 'HEAD']).stdout;
        if (head !== targetSha) {
            throw new Error(`Production HEAD ${head} is not the target ${targetSha}.`);
        }
    }

    if (decision.decision === 'fail') {
        const error = new Error(decision.message);
        error.decision = decision;
        throw error;
    }

    return decision;
};

const main = () => {
    const checkout = process.env.PRODUCTION_CHECKOUT ?? '';
    const targetSha = process.env.TARGET_SHA ?? '';
    const explicitRef = process.env.EXPLICIT_REF === 'true';

    try {
        if (!checkout) {
            throw new Error('PRODUCTION_CHECKOUT is required.');
        }
        const decision = runSync({ checkout, targetSha, explicitRef });
        writeOutput({
            decision: decision.decision,
            deployed: decision.deployed ? 'true' : 'false',
            sha: targetSha,
        });
    } catch (error) {
        const decision = error instanceof Error ? error.decision : undefined;
        writeOutput({
            decision: decision?.decision ?? 'fail',
            deployed: 'false',
            sha: targetSha,
        });
        console.error(error instanceof Error ? error.message : 'Sync failed.');
        process.exit(1);
    }
};

const git = (cwd, args, okStatuses = [0]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    const status = result.status ?? 1;
    if (!okStatuses.includes(status)) {
        throw new Error(
            `git ${args.join(' ')} failed (${status}): ${result.stderr || result.stdout}`,
        );
    }
    return { status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
};

const writeOutput = pairs => {
    const file = process.env.GITHUB_OUTPUT;
    if (!file) {
        return;
    }
    const lines = Object.entries(pairs).map(([key, value]) => `${key}=${value}`);
    appendFileSync(file, `${lines.join('\n')}\n`);
};

if (import.meta.main) {
    main();
}
