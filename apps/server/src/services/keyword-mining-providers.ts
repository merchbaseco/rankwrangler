import {
    buildKeywordJudgmentRequest,
    buildProductRelevanceRequest,
    parseKeywordJudgments,
} from './keyword-judgment-contract';
import { z } from 'zod';
import { env } from '@/config/env';
import {
    reserveKeywordMiningCall,
    deferKeywordMiningProvider,
    KeywordMiningDeferred,
    recordKeywordMiningTokens,
} from '@/db/keyword-mining-capacity';
import { captureProviderAttempt } from './providers/provider-telemetry';

export const keywordMiningConfigured = () =>
    Boolean(
        env.RANKWRANGLER_ADS_CLIENT_ID &&
            env.RANKWRANGLER_ADS_CLIENT_SECRET &&
            env.RANKWRANGLER_ADS_REFRESH_TOKEN &&
            env.RANKWRANGLER_TYPESAFE_API_KEY
    );
let session: { token: string; expiresAt: number; profileId: number } | null = null;
const recommendationsSchema = z.object({
    keywordTargetList: z.array(z.object({ keyword: z.string().min(1).max(200) })).max(200),
});
const jevUsageSchema = z.object({ usage: z.object({ input_tokens: z.number().nonnegative() }) });
const profileSchema = z.array(
    z.object({
        profileId: z.number(),
        countryCode: z.string(),
        accountInfo: z.object({ type: z.string() }),
    })
);

export const fetchAsinKeywordRecommendations = async (asin: string) => {
    await reserveKeywordMiningCall('ads');
    const auth = await getAdsSession();
    const media = 'application/vnd.spkeywordsrecommendation.v5+json';
    const response = await captureProviderAttempt(
        { provider: 'amazonAds', operation: 'ads.keyword.recommendations' },
        () =>
            fetch('https://advertising-api.amazon.com/sp/targets/keywords/recommendations', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${auth.token}`,
                    'Amazon-Advertising-API-ClientId': env.RANKWRANGLER_ADS_CLIENT_ID!,
                    'Amazon-Advertising-API-Scope': String(auth.profileId),
                    'Content-Type': media,
                    Accept: media,
                },
                body: JSON.stringify({
                    recommendationType: 'KEYWORDS_FOR_ASINS',
                    asins: [asin],
                    bidsEnabled: false,
                    maxRecommendations: 100,
                    sortDimension: 'CLICKS',
                    locale: 'en_US',
                    targets: [],
                }),
                signal: AbortSignal.timeout(30_000),
            })
    );
    await checkResponse(response, 'ads');
    return recommendationsSchema
        .parse(await response.json())
        .keywordTargetList.map(row => row.keyword);
};

export const judgeMinedKeywords = (candidates: readonly Candidate[]) =>
    askJev('typesafe.keyword.judge', candidates, buildKeywordJudgmentRequest(candidates));

export const judgeProductRelevance = (productTitle: string, candidates: readonly Candidate[]) =>
    askJev(
        'typesafe.keyword.relevance',
        candidates,
        buildProductRelevanceRequest(productTitle, candidates)
    );

type Candidate = { id: string; term: string };
const askJev = async (
    operation: 'typesafe.keyword.judge' | 'typesafe.keyword.relevance',
    candidates: readonly Candidate[], request: unknown) => {
    if (!candidates.length) return [];
    await reserveKeywordMiningCall('jev');
    const response = await captureProviderAttempt({ provider: 'typesafe', operation }, () =>
        fetch('https://api.typesafe.ai/v1/systemone', {
            method: 'POST',
            headers: {
                authorization: `Bearer ${env.RANKWRANGLER_TYPESAFE_API_KEY}`,
                'content-type': 'application/json',
            },
            body: JSON.stringify(request),
            signal: AbortSignal.timeout(45_000),
        })
    );
    await checkResponse(response, 'jev');
    const payload: unknown = await response.json();
    const tokens = jevUsageSchema.safeParse(payload).data?.usage.input_tokens;
    if (tokens) await recordKeywordMiningTokens('jev', tokens);
    return parseKeywordJudgments(candidates, payload);
};

const getAdsSession = async () => {
    if (session && session.expiresAt > Date.now()) return session;
    if (!keywordMiningConfigured())
        throw new Error('Keyword mining credentials are not configured');
    const response = await captureProviderAttempt(
        { provider: 'amazonAds', operation: 'ads.lwa.token' },
        () =>
            fetch('https://api.amazon.com/auth/o2/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    grant_type: 'refresh_token',
                    client_id: env.RANKWRANGLER_ADS_CLIENT_ID!,
                    client_secret: env.RANKWRANGLER_ADS_CLIENT_SECRET!,
                    refresh_token: env.RANKWRANGLER_ADS_REFRESH_TOKEN!,
                }),
                signal: AbortSignal.timeout(15_000),
            })
    );
    await checkResponse(response, 'ads');
    const token = z
        .object({ access_token: z.string(), expires_in: z.number().positive() })
        .parse(await response.json());
    const profiles = await captureProviderAttempt(
        { provider: 'amazonAds', operation: 'ads.profiles' },
        () =>
            fetch('https://advertising-api.amazon.com/v2/profiles', {
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    'Amazon-Advertising-API-ClientId': env.RANKWRANGLER_ADS_CLIENT_ID!,
                },
                signal: AbortSignal.timeout(15_000),
            })
    );
    await checkResponse(profiles, 'ads');
    const us = profileSchema
        .parse(await profiles.json())
        .filter(profile => profile.countryCode === 'US');
    const profile = us.find(profile => profile.accountInfo.type === 'vendor') ?? us[0];
    if (!profile) throw new Error('Amazon Ads has no authorized US profile');
    session = {
        token: token.access_token,
        profileId: profile.profileId,
        expiresAt: Date.now() + Math.max(0, token.expires_in - 60) * 1000,
    };
    return session;
};

const checkResponse = async (response: Response, provider: 'ads' | 'jev') => {
    if (response.status === 429 || response.status >= 500) {
        const raw = response.headers.get('retry-after');
        const seconds = Number(raw);
        const wait =
            raw && !Number.isFinite(seconds)
                ? Date.parse(raw) - Date.now()
                : (seconds || 60) * 1000;
        const retryAt = new Date(
            Date.now() + Math.max(60_000, Number.isFinite(wait) ? wait : 60_000)
        );
        await deferKeywordMiningProvider(provider, retryAt);
        throw new KeywordMiningDeferred(retryAt);
    }
    if (response.status === 401 || response.status === 403) {
        if (provider === 'ads') session = null;
        await deferKeywordMiningProvider(provider, new Date(Date.now() + 3_600_000));
    }
    if (!response.ok) throw new Error(`Keyword ${provider} request failed (${response.status})`);
};
