import type { PublicRouterInputs, PublicRouterOutputs, RankWranglerClient } from '../src/index';

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;
type ProductSearchInput = PublicRouterInputs['product']['search'];
type ProductGetInput = PublicRouterInputs['product']['get'];
type ProductGetManyInput = PublicRouterInputs['product']['getMany'];
type ProductFamilyInput = PublicRouterInputs['product']['family'];
type ProductHistoryInput = PublicRouterInputs['product']['history'];
type ProductOutput = PublicRouterOutputs['product']['get'];
type ProductGetManyOutput = PublicRouterOutputs['product']['getMany'];
type ProductFamilyOutput = PublicRouterOutputs['product']['family'];
type ProductHistoryOutput = PublicRouterOutputs['product']['history'];
type KeywordGetInput = PublicRouterInputs['keyword']['get'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type ProductSearchMutation = RankWranglerClient['product']['search'];
type ProductGetManyMutation = RankWranglerClient['product']['getMany'];

export type PublicNamespaceContract = Assert<
    Equal<keyof PublicRouterInputs, 'product' | 'keyword'>
>;
export type ProductProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['product'], 'get' | 'getMany' | 'search' | 'history' | 'family'>
>;
export type KeywordProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['keyword'], 'get' | 'search' | 'results'>
>;
export type ProductSearchOutputContract = Assert<
    Equal<Awaited<ReturnType<ProductSearchMutation['query']>>, ProductSearchOutput>
>;
export type ProductSearchOutputKeysContract = Assert<
    Equal<keyof ProductSearchOutput, 'items' | 'nextCursor' | 'coverage'>
>;
export type KeywordResultsOutputContract = Assert<
    Equal<keyof PublicRouterOutputs['keyword']['results'], 'keyword' | 'searchedAt' | 'results'>
>;
export type ProductGetInputContract = Assert<
    Equal<keyof ProductGetInput, 'marketplaceId' | 'asin' | 'include'>
>;
export type ProductGetManyInputContract = Assert<Equal<keyof ProductGetManyInput, 'products'>>;
export type ProductGetManyOutputContract = Assert<
    Equal<Awaited<ReturnType<ProductGetManyMutation['mutate']>>, ProductGetManyOutput>
>;
export type ProductGetManyOutputKeysContract = Assert<
    Equal<
        keyof ProductGetManyOutput[number],
        'marketplaceId' | 'asin' | 'title' | 'thumbnail' | 'amazonListingStatus'
    >
>;
export type ProductFamilyInputContract = Assert<
    Equal<keyof ProductFamilyInput, 'marketplaceId' | 'asins'>
>;
export type ProductFamilyOutputStatusContract = Assert<
    Equal<ProductFamilyOutput[number]['status'], 'known' | 'unknown'>
>;
type KnownFamily = Extract<ProductFamilyOutput[number], { status: 'known' }>;
type UnknownFamily = Extract<ProductFamilyOutput[number], { status: 'unknown' }>;
export type ProductFamilyKnownKeysContract = Assert<
    Equal<
        keyof KnownFamily,
        | 'status'
        | 'marketplaceId'
        | 'requestedAsin'
        | 'familyAsin'
        | 'variationsCheckedAt'
        | 'variants'
    >
>;
export type ProductFamilyUnknownKeysContract = Assert<
    Equal<keyof UnknownFamily, 'status' | 'marketplaceId' | 'requestedAsin'>
>;
export type ProductFamilyVariantKeysContract = Assert<
    Equal<keyof KnownFamily['variants'][number], 'asin' | 'attributes'>
>;
export type ProductFamilyAttributeKeysContract = Assert<
    Equal<keyof KnownFamily['variants'][number]['attributes'], 'size' | 'color' | 'fit' | 'style'>
>;
export type ProductOutputContract = Assert<
    Equal<
        keyof ProductOutput,
        'marketplaceId' | 'asin' | 'listing' | 'category' | 'salesRank' | 'price' | 'demand'
    >
>;
export type ProductHistoryInputContract = Assert<
    Equal<
        keyof ProductHistoryInput,
        'marketplaceId' | 'asin' | 'bucket' | 'days' | 'endAt' | 'limit' | 'metrics' | 'startAt'
    >
>;
export type ProductHistoryOutputContract = Assert<
    Equal<keyof ProductHistoryOutput, 'marketplaceId' | 'asin' | 'range' | 'series'>
>;
export type KeywordGetInputContract = Assert<
    Equal<
        keyof KeywordGetInput,
        'keyword'
    >
>;

export const productSearchInput: ProductSearchInput = {
    term: 'retro gardening shirt',
};
