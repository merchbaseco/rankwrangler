import { readFileSync } from "node:fs";
import { join } from "node:path";

// Name-only contract check across the five places a RankWrangler variable
// appears: `.env.schema` (the contract), the typed server surface in
// `apps/server/src/config/env.ts`, the Compose delivery for the server
// container, the Compose build arguments for the website image, and the `ARG`
// declarations in `Dockerfile.caddy`.
//
// This exists because nothing else can prove those five agree. `varlock audit`
// only sees direct `process.env` reads, and Docker silently discards a build
// argument the Dockerfile never declares — which is exactly how
// VITE_CLERK_SYNC_HOST was passed but never applied. Nothing here resolves a
// value or contacts 1Password; it compares names and decorators only.

const repositoryRoot = process.cwd();
const schemaPath = join(repositoryRoot, ".env.schema");
const serverEnvPath = join(repositoryRoot, "apps/server/src/config/env.ts");
const composePath = join(repositoryRoot, "apps/server/compose.yml");
const caddyDockerfilePath = join(repositoryRoot, "apps/server/Dockerfile.caddy");

// Injected by varlock itself rather than delivered to any consumer.
const varlockBuiltins = new Set(["VARLOCK_ENV"]);

// The postgres image requires these literal names for first-boot
// initialisation. They are delivered by Compose but read by the database
// container, never by the server, so they are exempt from the reverse check.
const postgresImageNames = new Set([
    "POSTGRES_DB",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
]);

const itemPattern = /^([A-Z][A-Z0-9_]*)=/u;
const serverBlockPattern = /server:\s*\{([\s\S]*?)\n {4}\},/u;
const runtimeBlockPattern = /runtimeEnv:\s*\{([\s\S]*?)\n {4}\},/u;
const keyPattern = /^\s{8}([A-Z][A-Z0-9_]*):/gmu;
const argPattern = /^ARG\s+([A-Z][A-Z0-9_]*)/gmu;

interface SchemaItem {
    hasExplicitSensitivity: boolean;
    isInternal: boolean;
    isSensitive: boolean;
    name: string;
}

const readSchemaItems = (): SchemaItem[] => {
    const contents = readFileSync(schemaPath, "utf8");
    const dividerIndex = contents.indexOf("\n# ---");
    const body =
        dividerIndex === -1 ? contents : contents.slice(dividerIndex + 6);

    const items: SchemaItem[] = [];
    let decorators: string[] = [];

    for (const line of body.split("\n")) {
        if (line.startsWith("#")) {
            decorators.push(line);
            continue;
        }

        const match = itemPattern.exec(line);
        if (match) {
            const attached = decorators.join(" ");
            items.push({
                name: match[1],
                isInternal: attached.includes("@internal"),
                isSensitive: attached.includes("@sensitive"),
                hasExplicitSensitivity:
                    attached.includes("@sensitive") ||
                    attached.includes("@public"),
            });
        }

        // A blank line (or the item itself) breaks decorator association.
        decorators = [];
    }

    return items;
};

const readNamedBlock = (
    contents: string,
    pattern: RegExp,
    label: string
): string[] => {
    const block = pattern.exec(contents);
    if (!block) {
        console.error(`Could not find the \`${label}\` block in ${serverEnvPath}.`);
        process.exit(1);
    }

    return [...block[1].matchAll(keyPattern)].map((match) => match[1]);
};

// Line-based reader for the Compose blocks we care about. Compose is
// indentation-structured, so a block ends at the first line indented no deeper
// than its header. Every matching block is read, because `environment:`
// appears once per service.
const readComposeBlocks = (blockHeader: string, headerIndent: number) => {
    const lines = readFileSync(composePath, "utf8").split("\n");
    const names: string[] = [];
    let inside = false;

    for (const line of lines) {
        if (!inside) {
            if (
                line.trimEnd().endsWith(blockHeader) &&
                line.search(/\S/u) === headerIndent
            ) {
                inside = true;
            }
            continue;
        }

        if (line.trim() === "" || line.trimStart().startsWith("#")) {
            continue;
        }

        if (line.search(/\S/u) <= headerIndent) {
            // Block ended; keep scanning for the next one.
            inside = false;
            if (
                line.trimEnd().endsWith(blockHeader) &&
                line.search(/\S/u) === headerIndent
            ) {
                inside = true;
            }
            continue;
        }

        const match = /^\s*([A-Z][A-Z0-9_]*):/u.exec(line);
        if (match) {
            names.push(match[1]);
        }
    }

    return names;
};

const readCaddyArgs = (): string[] => {
    const contents = readFileSync(caddyDockerfilePath, "utf8");
    return [...contents.matchAll(argPattern)].map((match) => match[1]);
};

const sorted = (names: Iterable<string>) => [...names].sort();

const schemaItems = readSchemaItems();
const deliverableNames = new Set(
    schemaItems
        .filter((item) => !(item.isInternal || varlockBuiltins.has(item.name)))
        .map((item) => item.name)
);
const sensitiveNames = new Set(
    schemaItems.filter((item) => item.isSensitive).map((item) => item.name)
);

const serverEnvContents = readFileSync(serverEnvPath, "utf8");
const declaredNames = readNamedBlock(
    serverEnvContents,
    serverBlockPattern,
    "server"
);
const runtimeNames = readNamedBlock(
    serverEnvContents,
    runtimeBlockPattern,
    "runtimeEnv"
);

// `environment:` for the server service sits at 4 spaces; the caddy image's
// build `args:` sit at 6.
const composeServerEnvNames = new Set(readComposeBlocks("environment:", 4));
const composeBuildArgNames = new Set(readComposeBlocks("args:", 6));
const caddyArgNames = new Set(readCaddyArgs());

const issues: string[] = [];

// 1. Sensitivity must be stated, not inherited. The schema defaults to
//    sensitive, so an unmarked item is safe but ambiguous to readers.
for (const item of schemaItems) {
    if (!item.hasExplicitSensitivity) {
        issues.push(
            `${item.name} does not declare @sensitive or @public in .env.schema.`
        );
    }
}

// 2. A VITE_ value is inlined into a public browser bundle at build time.
//    Marking one sensitive means a secret is about to ship to every visitor.
for (const item of schemaItems) {
    if (item.name.startsWith("VITE_") && item.isSensitive) {
        issues.push(
            `${item.name} is @sensitive but VITE_ values are inlined into the public website bundle.`
        );
    }
}

// 3. The typed server surface must declare and wire the same names.
for (const name of sorted(declaredNames)) {
    if (!runtimeNames.includes(name)) {
        issues.push(
            `${name} is declared in the server schema but missing from runtimeEnv in apps/server/src/config/env.ts.`
        );
    }
}

for (const name of sorted(runtimeNames)) {
    if (!declaredNames.includes(name)) {
        issues.push(
            `${name} appears in runtimeEnv but is not declared in the server schema in apps/server/src/config/env.ts.`
        );
    }
}

// 4. Everything the server reads must be a deliverable schema item, and must
//    actually be delivered to the container.
for (const name of sorted(new Set(declaredNames))) {
    if (!deliverableNames.has(name)) {
        issues.push(
            `${name} is read by the server but is not a deliverable .env.schema item.`
        );
    }

    if (!composeServerEnvNames.has(name)) {
        issues.push(
            `${name} is read by the server but is not delivered in the compose \`environment:\` block.`
        );
    }
}

// 5. Compose must not deliver names the server does not read.
for (const name of sorted(composeServerEnvNames)) {
    if (postgresImageNames.has(name)) {
        continue;
    }

    if (!declaredNames.includes(name)) {
        issues.push(
            `${name} is delivered by compose but is not read by the server in apps/server/src/config/env.ts.`
        );
    }
}

// 6. Website build arguments must be declared on both sides. Docker silently
//    drops a build argument the Dockerfile never declares.
for (const name of sorted(composeBuildArgNames)) {
    if (!caddyArgNames.has(name)) {
        issues.push(
            `${name} is passed as a compose build argument but is not declared as an ARG in apps/server/Dockerfile.caddy (Docker would silently discard it).`
        );
    }

    if (!deliverableNames.has(name)) {
        issues.push(
            `${name} is passed as a compose build argument but is not a deliverable .env.schema item.`
        );
    }
}

for (const name of sorted(caddyArgNames)) {
    if (!composeBuildArgNames.has(name)) {
        issues.push(
            `${name} is declared as an ARG in apps/server/Dockerfile.caddy but is never passed by compose.`
        );
    }
}

if (issues.length > 0) {
    console.error("Environment contract is out of sync:");
    for (const issue of issues) {
        console.error(`- ${issue}`);
    }
    process.exit(1);
}

console.log(
    `Environment contract is in sync (${deliverableNames.size} deliverable schema variables, ${declaredNames.length} read by the server, ${caddyArgNames.size} website build arguments).`
);
