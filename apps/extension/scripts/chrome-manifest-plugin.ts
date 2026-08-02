import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import {
	createChromeManifest,
	resolveChromeAuthBuildConfig,
	type ChromeBuildEnvironment,
	type ChromeBuildTarget,
} from "./chrome-extension-config";

export const createChromeManifestPlugin = ({
	env,
	manifestPath,
	requireProduction,
	target,
}: {
	env: ChromeBuildEnvironment;
	manifestPath: string;
	requireProduction: boolean;
	target: ChromeBuildTarget;
}): Plugin => {
	const config = resolveChromeAuthBuildConfig({ env, requireProduction });

	return {
		name: "rankwrangler-chrome-manifest",
		generateBundle() {
			const sourceManifest = JSON.parse(
				readFileSync(manifestPath, "utf8")
			) as Record<string, unknown>;
			if (sourceManifest.key !== config.publicKey) {
				throw new Error(
					"The committed Chrome manifest key does not match the permanent extension identity."
				);
			}
			const manifest = createChromeManifest({
				config,
				manifest: sourceManifest,
				target,
			});

			this.emitFile({
				fileName: "manifest.json",
				source: `${JSON.stringify(manifest, null, 2)}\n`,
				type: "asset",
			});
		},
	};
};
