import { spawnSync } from "node:child_process";

type DeployRevision =
    | { ok: true; revision: string }
    | { ok: false; problem: string };

const commitShaPattern = /^[0-9a-f]{40}$/u;

export const requireDeployRevision = (): string => {
    const parsed = parseDeployRevision(
        gitOutput(["rev-parse", "--verify", "HEAD"]),
        gitOutput(["status", "--porcelain", "--untracked-files=no"])
    );
    if (!parsed.ok) {
        console.error(`${parsed.problem} Deploy not attempted.`);
        process.exit(1);
    }
    return parsed.revision;
};

export const requireBakedRevision = (
    composeArgs: readonly string[],
    revision: string,
    env: NodeJS.ProcessEnv
): void => {
    const found = spawnSync(
        "docker",
        [
            "compose",
            ...composeArgs,
            "run",
            "--rm",
            "--no-deps",
            "--entrypoint",
            "grep",
            "server",
            "-qF",
            revision,
            "dist/index.js",
        ],
        { env, stdio: "inherit" }
    );
    if (found.status !== 0) {
        console.error(
            `The built server image does not carry revision ${revision}; containers not replaced.`
        );
        process.exit(1);
    }
};

export const parseDeployRevision = (
    head: string | undefined,
    trackedChanges: string | undefined
): DeployRevision => {
    if (head === undefined) {
        return { ok: false, problem: "Could not read HEAD of the deploy checkout." };
    }
    const revision = head.trim();
    if (!commitShaPattern.test(revision)) {
        return {
            ok: false,
            problem: `HEAD is "${revision}", not a 40-character lowercase hex SHA.`,
        };
    }
    if (trackedChanges === undefined) {
        return { ok: false, problem: "Could not read git status of the deploy checkout." };
    }
    if (trackedChanges !== "") {
        return {
            ok: false,
            problem: "Tracked files differ from HEAD, so HEAD does not describe the image.",
        };
    }
    return { ok: true, revision };
};

const gitOutput = (args: readonly string[]): string | undefined => {
    const result = spawnSync("git", args, { encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : undefined;
};
