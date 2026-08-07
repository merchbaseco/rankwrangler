import type { PublicRouterInputs, PublicRouterOutputs, RankWranglerClient } from '../src/index';

type Equal<Left, Right> =
    (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
        ? true
        : false;
type Assert<Condition extends true> = Condition;
type ProductSearchInput = PublicRouterInputs['product']['search'];
type ProductSearchOutput = PublicRouterOutputs['product']['search'];
type ProductSearchMutation = RankWranglerClient['product']['search'];

export type PublicNamespaceContract = Assert<
    Equal<keyof PublicRouterInputs, 'product' | 'keyword'>
>;
export type ProductProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['product'], 'get' | 'search' | 'history'>
>;
export type KeywordProcedureContract = Assert<
    Equal<keyof PublicRouterInputs['keyword'], 'get' | 'search' | 'history'>
>;
export type ProductSearchOutputContract = Assert<
    Equal<Awaited<ReturnType<ProductSearchMutation['mutate']>>, ProductSearchOutput>
>;

export const productSearchInput: ProductSearchInput = {
    term: 'retro gardening shirt',
    refresh: true,
};
