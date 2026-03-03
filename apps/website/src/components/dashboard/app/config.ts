export type LastUpdated = 'all' | '24h' | '7d' | '30d';

export const BSR_MIN = 1;
export const BSR_MAX = 2_000_000;
const LOG_MIN = Math.log(BSR_MIN);
const LOG_MAX = Math.log(BSR_MAX);

export const sliderToBsr = (position: number): number => {
	const bsr = Math.round(Math.exp(LOG_MIN + (position / 100) * (LOG_MAX - LOG_MIN)));
	return Math.max(BSR_MIN, Math.min(BSR_MAX, bsr));
};

export const bsrToSlider = (bsr: number): number => {
	const clamped = Math.max(BSR_MIN, Math.min(BSR_MAX, bsr));
	return ((Math.log(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100;
};

export const formatBsr = (bsr: number): string => {
	if (bsr >= 1_000_000) return `${(bsr / 1_000_000).toFixed(bsr % 1_000_000 === 0 ? 0 : 1)}M`;
	if (bsr >= 1_000) return `${(bsr / 1_000).toFixed(bsr % 1_000 === 0 ? 0 : 1)}K`;
	return String(bsr);
};

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

export const FACET_CATEGORY_META: Record<string, { emoji: string; label: string }> = {
	profession: { emoji: '💼', label: 'Profession' },
	hobby: { emoji: '🏕️', label: 'Hobby' },
	animal: { emoji: '🐾', label: 'Animal' },
	food: { emoji: '🍽️', label: 'Food' },
	cause: { emoji: '🎗️', label: 'Cause' },
	identity: { emoji: '🪪', label: 'Identity' },
	culture: { emoji: '🎭', label: 'Culture' },
	holiday: { emoji: '🎄', label: 'Holiday' },
	occasion: { emoji: '🎁', label: 'Occasion' },
	place: { emoji: '📍', label: 'Place' },
	'party-theme': { emoji: '🎉', label: 'Party Theme' },
};

export const formatFacetValueLabel = (value: string): string =>
	value
		.split('-')
		.filter(Boolean)
		.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
		.join(' ');
