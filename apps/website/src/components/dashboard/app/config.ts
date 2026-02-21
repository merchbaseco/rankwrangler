export type BsrRange = 'top1k' | 'top10k' | 'top100k' | '100k+';
export type LastUpdated = 'all' | '24h' | '7d' | '30d';

export const BSR_OPTIONS: Array<{ key: BsrRange; label: string }> = [
	{ key: 'top1k', label: 'Top 1K' },
	{ key: 'top10k', label: 'Top 10K' },
	{ key: 'top100k', label: 'Top 100K' },
	{ key: '100k+', label: '100K+' },
];

export const MARKETPLACES = [
	{ id: 'ATVPDKIKX0DER', label: 'US', flag: '🇺🇸' },
	{ id: 'A1F83G8C2ARO7P', label: 'UK', flag: '🇬🇧' },
	{ id: 'A1PA6795UKMFR9', label: 'DE', flag: '🇩🇪' },
	{ id: 'A13V1IB3VIYZZH', label: 'FR', flag: '🇫🇷' },
	{ id: 'A1VC38T7YXB528', label: 'JP', flag: '🇯🇵' },
] as const;

export const LAST_UPDATED_OPTIONS: Array<{ key: LastUpdated; label: string }> = [
	{ key: 'all', label: 'All time' },
	{ key: '24h', label: 'Last 24h' },
	{ key: '7d', label: 'Last 7 days' },
	{ key: '30d', label: 'Last 30 days' },
];

export const FACETS = [
	{ emoji: '🐶', label: 'Dogs' },
	{ emoji: '🐱', label: 'Cats' },
	{ emoji: '🎾', label: 'Tennis' },
	{ emoji: '🏈', label: 'Football' },
	{ emoji: '⚽', label: 'Soccer' },
	{ emoji: '🎣', label: 'Fishing' },
	{ emoji: '🏕️', label: 'Camping' },
	{ emoji: '☕', label: 'Coffee' },
	{ emoji: '📚', label: 'Books' },
	{ emoji: '🎸', label: 'Guitar' },
	{ emoji: '🧶', label: 'Knitting' },
	{ emoji: '🌱', label: 'Gardening' },
	{ emoji: '🐓', label: 'Farm Life' },
	{ emoji: '🚀', label: 'Space' },
	{ emoji: '💻', label: 'Coding' },
	{ emoji: '🎮', label: 'Gaming' },
	{ emoji: '🧩', label: 'Puzzles' },
	{ emoji: '🏃', label: 'Running' },
	{ emoji: '🚴', label: 'Cycling' },
	{ emoji: '🌊', label: 'Ocean' },
	{ emoji: '🏔️', label: 'Mountains' },
	{ emoji: '✈️', label: 'Travel' },
	{ emoji: '🍕', label: 'Pizza' },
	{ emoji: '🐉', label: 'Dragons' },
	{ emoji: '😎', label: 'Retro' },
];
