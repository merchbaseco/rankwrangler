/**
 * Small deterministic generator so a seed run is varied but reproducible: the
 * same seed string always produces the same catalog, the same rank curves, and
 * the same keyword drift, while a new seed produces a different plausible week.
 * Lehmer's multiplicative generator, because it needs no bitwise arithmetic and
 * every intermediate stays inside a double.
 */

const MODULUS = 2_147_483_647;
const MULTIPLIER = 48_271;
const HASH_MULTIPLIER = 31;

export interface SeededRandom {
    /** Uniform float in [min, max). */
    between(min: number, max: number): number;
    /** True with the given probability. */
    chance(probability: number): boolean;
    /** Uniform integer in [min, max]. */
    int(min: number, max: number): number;
    /** Uniform float in [0, 1). */
    next(): number;
    /** Uniform element of a non-empty list. */
    pick<T>(values: readonly T[]): T;
    /** Approximately normal deviate, mean 0 and standard deviation 1. */
    normal(): number;
    /** A copy of the list in a deterministic shuffled order. */
    shuffle<T>(values: readonly T[]): T[];
}

export const createSeededRandom = (seed: string): SeededRandom => {
    let state = hashSeed(seed);

    const next = () => {
        state = (state * MULTIPLIER) % MODULUS;
        return (state - 1) / (MODULUS - 1);
    };

    const between = (min: number, max: number) => min + next() * (max - min);
    const int = (min: number, max: number) => Math.floor(between(min, max + 1));

    const pick = <T>(values: readonly T[]): T => {
        const value = values[int(0, values.length - 1)];
        if (value === undefined) {
            throw new Error('Cannot pick from an empty list.');
        }
        return value;
    };

    // Irwin-Hall with n = 6, rescaled. Cheap, bounded, and smooth enough for
    // rank jitter and price wobble.
    const normal = () => {
        let sum = 0;
        for (let index = 0; index < 6; index += 1) {
            sum += next();
        }
        return (sum - 3) / Math.sqrt(0.5);
    };

    const shuffle = <T>(values: readonly T[]) => {
        const shuffled = [...values];
        for (let index = shuffled.length - 1; index > 0; index -= 1) {
            const swapIndex = int(0, index);
            const current = shuffled[index];
            const swap = shuffled[swapIndex];
            if (current !== undefined && swap !== undefined) {
                shuffled[index] = swap;
                shuffled[swapIndex] = current;
            }
        }
        return shuffled;
    };

    return {
        between,
        chance: (probability: number) => next() < probability,
        int,
        next,
        normal,
        pick,
        shuffle,
    };
};

/** Polynomial hash into the generator's non-zero state range. */
const hashSeed = (seed: string) => {
    let hash = 7;
    for (let index = 0; index < seed.length; index += 1) {
        hash = (hash * HASH_MULTIPLIER + seed.charCodeAt(index)) % MODULUS;
    }

    return hash === 0 ? 1 : hash;
};
