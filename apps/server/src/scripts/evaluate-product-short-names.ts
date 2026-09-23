import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { observeProductDesign } from '@/services/product-design-observation';
import { buildShortNameCandidates } from '@/services/product-short-name-candidates';
import { chooseProductShortName } from '@/services/product-short-name';
import type { captureProviderAttempt } from '@/services/providers/provider-telemetry';

const examples = z
    .array(
        z.object({
            asin: z.string(),
            title: z.string(),
            thumbnailUrl: z.url(),
            expected: z.string(),
        })
    )
    .parse(
        JSON.parse(
            await readFile(
                new URL('../../test/fixtures/product-short-name-examples.json', import.meta.url),
                'utf8'
            )
        )
    );

const captureWithoutTelemetry: typeof captureProviderAttempt = async (_descriptor, run) =>
    await run();

let matched = 0;
for (const example of examples) {
    try {
        const observation = await observeProductDesign(
            example.thumbnailUrl,
            fetch,
            captureWithoutTelemetry
        );
        const actual = observation
            ? await chooseProductShortName({
                  title: example.title,
                  observation,
                  candidates: buildShortNameCandidates(example.title),
                  capture: captureWithoutTelemetry,
              })
            : null;
        const match = actual === example.expected;
        if (match) matched++;
        console.log(JSON.stringify({ asin: example.asin, expected: example.expected, actual, match }));
    } catch (error) {
        console.log(
            JSON.stringify({
                asin: example.asin,
                expected: example.expected,
                error: error instanceof Error ? error.message : String(error),
            })
        );
    }
}

console.log(`${matched}/${examples.length} short names matched`);
if (matched !== examples.length) process.exitCode = 1;
