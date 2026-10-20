import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { publishedPackages } from './published-packages.mjs';

const semverPattern = /^\d+\.\d+\.\d+$/;

export const publishUnpublished = async ({
    checkout,
    headSha,
    packages = publishedPackages,
    readVersion = defaultReadVersion,
    npmHasVersion = defaultNpmHasVersion,
    prepare = defaultPrepare,
    publish = defaultPublish,
    remoteTag = defaultRemoteTag,
    createAndPushTag = defaultCreateAndPushTag,
    versionCommit = defaultVersionCommit,
}) => {
    const versions = new Map();
    for (const pkg of packages) {
        versions.set(pkg.name, await readVersion(checkout, pkg));
    }
    const unique = new Set(versions.values());
    if (unique.size !== 1) {
        throw new Error(
            `Published package versions must match. Found ${JSON.stringify([...versions])}.`,
        );
    }
    const version = [...unique][0];
    if (!semverPattern.test(version)) {
        throw new Error(`Invalid package version: ${version}`);
    }

    const pending = [];
    for (const pkg of packages) {
        if (!(await npmHasVersion(pkg.name, version))) {
            pending.push(pkg);
        }
    }

    if (pending.length > 0) {
        await prepare(checkout);
        for (const pkg of pending) {
            await publish(checkout, pkg);
        }
        for (const pkg of packages) {
            if (!(await npmHasVersion(pkg.name, version))) {
                throw new Error(`${pkg.name}@${version} is still missing on npm.`);
            }
        }
    }

    const tag = `v${version}`;
    const introduced = await versionCommit(checkout, packages[0], version);
    const commit = introduced ?? (pending.length > 0 ? headSha : null);
    const existing = await remoteTag(checkout, tag);
    let tagged = false;
    const shouldTag =
        existing === null && commit !== null && (pending.length > 0 || commit === headSha);
    if (shouldTag) {
        await createAndPushTag(checkout, tag, commit);
        tagged = true;
    } else if (existing && pending.length > 0 && commit && existing !== commit) {
        throw new Error(`${tag} points at ${existing}, not ${commit}.`);
    }

    return {
        version,
        published: pending.map(pkg => pkg.name),
        tagged,
        tag,
    };
};

const main = async () => {
    const checkout = process.env.PRODUCTION_CHECKOUT;
    const headSha = process.env.TARGET_SHA ?? '';
    if (!checkout) {
        throw new Error('PRODUCTION_CHECKOUT is required.');
    }
    const head = git(checkout, ['rev-parse', 'HEAD']).stdout;
    if (head !== headSha) {
        throw new Error(`Production HEAD ${head} is not the deployed SHA ${headSha}.`);
    }

    const result = await publishUnpublished({ checkout, headSha });
    if (result.published.length === 0) {
        console.log(`npm already has ${result.tag}.`);
    } else {
        console.log(`Published ${result.published.join(', ')}.`);
    }
    if (result.tagged) {
        console.log(`Pushed ${result.tag}.`);
    }
};

const defaultReadVersion = async (checkout, pkg) => {
    const file = path.join(checkout, pkg.directory, 'package.json');
    const json = JSON.parse(await readFile(file, 'utf8'));
    return json.version;
};

const defaultNpmHasVersion = async (name, version) => {
    const result = spawnSync('npm', ['view', `${name}@${version}`, 'version'], {
        encoding: 'utf8',
    });
    if (result.status === 0) {
        return result.stdout.trim() === version;
    }
    const detail = `${result.stderr ?? ''}\n${result.stdout ?? ''}`;
    if (detail.includes('E404')) {
        return false;
    }
    throw new Error(`npm view ${name}@${version} failed: ${detail}`);
};

const defaultPrepare = async checkout => {
    run(checkout, 'bun', ['run', 'release:check']);
    run(checkout, 'bun', ['run', 'cli:build']);
    run(checkout, 'bun', ['run', 'release:check-cli-pack']);
};

const defaultPublish = async (checkout, pkg) => {
    run(checkout, 'node', [
        'scripts/release/with-npm-token.mjs',
        'npm',
        'publish',
        '--access',
        'public',
        '--userconfig',
        path.join(checkout, '.npmrc'),
    ], path.join(checkout, pkg.directory));
};

export const readRemoteTag = (checkout, tag) => {
    const listed = spawnSync('git', ['ls-remote', 'origin', `refs/tags/${tag}`], {
        cwd: checkout,
        encoding: 'utf8',
    });
    if (listed.status !== 0) {
        throw new Error(`git ls-remote ${tag} failed: ${listed.stderr}`);
    }
    if (!listed.stdout.trim()) {
        return null;
    }
    git(checkout, ['fetch', 'origin', `+refs/tags/${tag}:refs/tags/${tag}`]);
    return git(checkout, ['rev-parse', `${tag}^{commit}`]).stdout;
};

const defaultRemoteTag = async (checkout, tag) => readRemoteTag(checkout, tag);

const defaultCreateAndPushTag = async (checkout, tag, commit) => {
    const token = process.env.GITHUB_TOKEN;
    const repository = process.env.GITHUB_REPOSITORY;
    if (!token || !repository) {
        throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required to push the release tag.');
    }
    const local = spawnSync('git', ['rev-parse', '--verify', '--quiet', `${tag}^{commit}`], {
        cwd: checkout,
        encoding: 'utf8',
    });
    if (local.status !== 0) {
        git(checkout, [
            '-c',
            'user.name=github-actions[bot]',
            '-c',
            'user.email=41898282+github-actions[bot]@users.noreply.github.com',
            '-c',
            'tag.gpgsign=false',
            'tag',
            '-a',
            tag,
            '-m',
            tag,
            commit,
        ]);
    } else if (local.stdout.trim() !== commit) {
        throw new Error(`${tag} already points at ${local.stdout.trim()}, not ${commit}.`);
    }
    git(checkout, [
        '-c',
        `http.extraheader=AUTHORIZATION: bearer ${token}`,
        'push',
        `https://github.com/${repository}.git`,
        `refs/tags/${tag}`,
    ]);
};

const defaultVersionCommit = async (checkout, pkg, version) => {
    const result = git(checkout, [
        'log',
        '-1',
        '--format=%H',
        '-S',
        `"version": "${version}"`,
        '--',
        `${pkg.directory}/package.json`,
    ]);
    return result.stdout || null;
};

const run = (cwd, command, args, workdir = cwd) => {
    const result = spawnSync(command, args, { cwd: workdir, encoding: 'utf8', stdio: 'inherit' });
    if (result.status !== 0) {
        throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? 1}).`);
    }
};

const git = (cwd, args) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
        const visible = args.map(arg =>
            arg.includes('AUTHORIZATION:') ? 'http.extraheader=AUTHORIZATION: bearer [redacted]' : arg,
        );
        throw new Error(`git ${visible.join(' ')} failed: ${result.stderr || result.stdout}`);
    }
    return { stdout: (result.stdout ?? '').trim() };
};

if (import.meta.main) {
    await main().catch(error => {
        console.error(error instanceof Error ? error.message : 'Publish failed.');
        process.exit(1);
    });
}
