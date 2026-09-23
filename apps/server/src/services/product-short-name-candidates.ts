const TITLE_WORD_RE = /[\p{L}\p{N}][\p{L}\p{N}'’&+-]*/gu;
const MAX_CANDIDATES = 120;

export const buildShortNameCandidates = (title: string): string[] => {
    const words = [...title.matchAll(TITLE_WORD_RE)].map(match => ({
        start: match.index,
        end: match.index + match[0].length,
    }));
    if (words.length === 0) {
        return [];
    }

    const prefixes = Array.from({ length: Math.min(5, words.length) }, (_, index) =>
        title.slice(words[0].start, words[index].end)
    );
    const candidates = new Set(prefixes);
    for (let length = 2; length <= Math.min(6, words.length); length++) {
        for (let start = 0; start <= words.length - length; start++) {
            candidates.add(title.slice(words[start].start, words[start + length - 1].end));
        }
    }

    const all = [...candidates].filter(candidate => candidate !== 'NONE');
    if (all.length <= MAX_CANDIDATES) {
        return all;
    }

    const selected = new Set(prefixes.filter(candidate => candidate !== 'NONE'));
    const slots = MAX_CANDIDATES - selected.size;
    for (let index = 0; index < slots; index++) {
        selected.add(all[Math.floor((index * (all.length - 1)) / Math.max(1, slots - 1))]);
    }
    return [...selected];
};
