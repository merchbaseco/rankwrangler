import { nonPodBrandOrIpTerms } from '@/services/spapi/ba-keyword-brand-or-ip-terms';

export const nonPodBrandOrIpPatterns = [
    new RegExp(`\\b(?:${nonPodBrandOrIpTerms.join('|')})\\b`, 'i'),
    /(?<!cross\s)\bstitch\b.*\b(?:gifts?|valentines?|shirt|hoodie|sweatshirt|phone\s+case)\b|\b(?:gifts?|valentines?|shirt|hoodie|sweatshirt|phone\s+case)\b.*(?<!cross\s)\bstitch\b/i,
    /\bscream\b.*\b(?:shirt|hoodie|sweatshirt|t[\s-]?shirt)\b|\b(?:shirt|hoodie|sweatshirt|t[\s-]?shirt)\b.*\bscream\b/i,
] as const;
