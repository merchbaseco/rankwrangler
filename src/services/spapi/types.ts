/**
 * Catalog Items API v2022-04-01
 * Search for and retrieve item information from the Amazon catalog.
 */

export namespace CatalogItemsV20220401 {
    // ==========================================
    // Enums
    // ==========================================

    export enum IdentifiersType {
        ASIN = 'ASIN',
        EAN = 'EAN',
        GTIN = 'GTIN',
        ISBN = 'ISBN',
        JAN = 'JAN',
        MINSAN = 'MINSAN',
        SKU = 'SKU',
        UPC = 'UPC',
    }

    export enum IncludedData {
        ATTRIBUTES = 'attributes',
        CLASSIFICATIONS = 'classifications',
        DIMENSIONS = 'dimensions',
        IDENTIFIERS = 'identifiers',
        IMAGES = 'images',
        PRODUCT_TYPES = 'productTypes',
        RELATIONSHIPS = 'relationships',
        SALES_RANKS = 'salesRanks',
        SUMMARIES = 'summaries',
        VENDOR_DETAILS = 'vendorDetails',
    }

    export enum ItemClassification {
        BASE_PRODUCT = 'BASE_PRODUCT',
        OTHER = 'OTHER',
        PRODUCT_BUNDLE = 'PRODUCT_BUNDLE',
        VARIATION_PARENT = 'VARIATION_PARENT',
    }

    export enum Variant {
        MAIN = 'MAIN',
        PT01 = 'PT01',
        PT02 = 'PT02',
        PT03 = 'PT03',
        PT04 = 'PT04',
        PT05 = 'PT05',
        PT06 = 'PT06',
        PT07 = 'PT07',
        PT08 = 'PT08',
        SWCH = 'SWCH',
    }

    export enum RelationshipType {
        VARIATION = 'VARIATION',
        PACKAGE_HIERARCHY = 'PACKAGE_HIERARCHY',
    }

    export enum ReplenishmentCategory {
        ALLOCATED = 'ALLOCATED',
        BASIC_REPLENISHMENT = 'BASIC_REPLENISHMENT',
        IN_SEASON = 'IN_SEASON',
        LIMITED_REPLENISHMENT = 'LIMITED_REPLENISHMENT',
        MANUFACTURER_OUT_OF_STOCK = 'MANUFACTURER_OUT_OF_STOCK',
        NEW_PRODUCT = 'NEW_PRODUCT',
        NON_REPLENISHABLE = 'NON_REPLENISHABLE',
        NON_STOCKUPABLE = 'NON_STOCKUPABLE',
        OBSOLETE = 'OBSOLETE',
        PLANNED_REPLENISHMENT = 'PLANNED_REPLENISHMENT',
    }

    // ==========================================
    // Request Interfaces
    // ==========================================

    export interface SearchCatalogItemsQueryParams {
        /**
         * A comma-delimited list of product identifiers that you can use to search the Amazon catalog.
         * Note: You cannot include identifiers and keywords in the same request.
         * Max count: 20
         */
        identifiers?: string[];

        /**
         * The type of product identifiers that you can use to search the Amazon catalog.
         * Note: identifiersType is required when identifiers is in the request.
         */
        identifiersType?: IdentifiersType;

        /**
         * A comma-delimited list of Amazon marketplace identifiers.
         * Max count: 1
         */
        marketplaceIds: string[];

        /**
         * A comma-delimited list of datasets to include in the response.
         * Default: summaries
         */
        includedData?: IncludedData[];

        /**
         * The locale for which you want to retrieve localized summaries.
         * Defaults to the primary locale of the marketplace.
         */
        locale?: string;

        /**
         * A selling partner identifier, such as a seller account or vendor code.
         * Note: Required when identifiersType is SKU.
         */
        sellerId?: string;

        /**
         * A comma-delimited list of keywords that you can use to search the Amazon catalog.
         * Note: You cannot include keywords and identifiers in the same request.
         * Max count: 20
         */
        keywords?: string[];

        /**
         * A comma-delimited list of brand names that you can use to limit the search in queries based on keywords.
         * Note: Cannot be used with identifiers.
         */
        brandNames?: string[];

        /**
         * A comma-delimited list of classification identifiers that you can use to limit the search in queries based on keywords.
         * Note: Cannot be used with identifiers.
         */
        classificationIds?: string[];

        /**
         * The number of results to include on each page.
         * Default: 10
         * Maximum: 20
         */
        pageSize?: number;

        /**
         * A token that you can use to fetch a specific page when there are multiple pages of results.
         */
        pageToken?: string;

        /**
         * The language of the keywords that are included in queries based on keywords.
         * Defaults to the primary locale of the marketplace.
         * Note: Cannot be used with identifiers.
         */
        keywordsLocale?: string;
    }

    // ==========================================
    // Response Interfaces
    // ==========================================

    export interface ItemSearchResults {
        /**
         * For searches that are based on identifiers, numberOfResults is the total number of Amazon catalog items found.
         * For searches that are based on keywords, numberOfResults is the estimated total number of Amazon catalog items that are matched by the search query.
         */
        numberOfResults: number;

        /**
         * The nextToken and previousToken values that are required to retrieve paginated results.
         */
        pagination: Pagination;

        /**
         * Search refinements for searches that are based on keywords.
         */
        refinements: Refinements;

        /**
         * A list of items from the Amazon catalog.
         */
        items: Item[];
    }

    export interface Pagination {
        /** A token that you can use to retrieve the next page. */
        nextToken?: string;
        /** A token that you can use to retrieve the previous page. */
        previousToken?: string;
    }

    export interface Refinements {
        /** A list of brands you can use to refine your search. */
        brands: BrandRefinement[];
        /** A list of classifications you can use to refine your search. */
        classifications: ClassificationRefinement[];
    }

    export interface BrandRefinement {
        /** The estimated number of results that would be returned if you refine your search by the specified brandName. */
        numberOfResults: number;
        /** The brand name that you can use to refine your search. */
        brandName: string;
    }

    export interface ClassificationRefinement {
        /** The estimated number of results that would be returned if you refine your search by the specified classificationId. */
        numberOfResults: number;
        /** Display name for the classification. */
        displayName: string;
        /** The identifier of the classification that you can use to refine your search. */
        classificationId: string;
    }

    // ==========================================
    // Item Definition
    // ==========================================

    export interface Item {
        /** The unique identifier of an item in the Amazon catalog. */
        asin: string;

        /**
         * A JSON object containing structured item attribute data that is keyed by attribute name.
         * Catalog item attributes conform to the related Amazon product type definitions.
         */
        attributes?: Record<string, any>;

        /** An array of classifications (browse nodes) that is associated with the item in the Amazon catalog, grouped by marketplaceId. */
        classifications?: ItemBrowseClassificationsByMarketplace[];

        /** An array of dimensions that are associated with the item in the Amazon catalog, grouped by marketplaceId. */
        dimensions?: ItemDimensionsByMarketplace[];

        /** Identifiers associated with the item in the Amazon catalog, such as UPC and EAN identifiers. */
        identifiers?: ItemIdentifiersByMarketplace[];

        /** The images for an item in the Amazon catalog. */
        images?: ItemImagesByMarketplace[];

        /** Product types that are associated with the Amazon catalog item. */
        productTypes?: ItemProductTypeByMarketplace[];

        /** Relationships grouped by marketplaceId for an Amazon catalog item (for example, variations). */
        relationships?: ItemRelationshipsByMarketplace[];

        /** Sales ranks of an Amazon catalog item. */
        salesRanks?: ItemSalesRanksByMarketplace[];

        /** Summaries of Amazon catalog items. */
        summaries?: ItemSummaryByMarketplace[];

        /** The vendor details that are associated with an Amazon catalog item. Vendor details are only available to vendors. */
        vendorDetails?: ItemVendorDetailsByMarketplace[];
    }

    // ==========================================
    // Item Sub-Components
    // ==========================================

    // --- Classifications ---
    export interface ItemBrowseClassificationsByMarketplace {
        marketplaceId: string;
        classifications?: ItemBrowseClassification[];
    }

    export interface ItemBrowseClassification {
        displayName: string;
        classificationId: string;
        parent?: ItemBrowseClassification;
    }

    // --- Dimensions ---
    export interface ItemDimensionsByMarketplace {
        marketplaceId: string;
        item?: Dimensions;
        package?: Dimensions;
    }

    export interface Dimensions {
        height?: Dimension;
        length?: Dimension;
        weight?: Dimension;
        width?: Dimension;
    }

    export interface Dimension {
        unit?: string;
        value?: number;
    }

    // --- Identifiers ---
    export interface ItemIdentifiersByMarketplace {
        marketplaceId: string;
        identifiers: ItemIdentifier[];
    }

    export interface ItemIdentifier {
        identifierType: string;
        identifier: string;
    }

    // --- Images ---
    export interface ItemImagesByMarketplace {
        marketplaceId: string;
        images: ItemImage[];
    }

    export interface ItemImage {
        variant: Variant;
        link: string;
        height: number;
        width: number;
    }

    // --- Product Types ---
    export interface ItemProductTypeByMarketplace {
        marketplaceId?: string;
        productType?: string;
    }

    // --- Relationships ---
    export interface ItemRelationshipsByMarketplace {
        marketplaceId: string;
        relationships: ItemRelationship[];
    }

    export interface ItemRelationship {
        childAsins?: string[];
        parentAsins?: string[];
        variationTheme?: ItemVariationTheme;
        type: RelationshipType;
    }

    export interface ItemVariationTheme {
        attributes?: string[];
        theme?: string;
    }

    // --- Sales Ranks ---
    export interface ItemSalesRanksByMarketplace {
        marketplaceId: string;
        // Note: classificationRanks are not extracted/used - only displayGroupRanks are used
        displayGroupRanks?: ItemDisplayGroupSalesRank[];
    }

    // Note: ItemClassificationSalesRank interface removed - classification ranks are not used

    export interface ItemDisplayGroupSalesRank {
        websiteDisplayGroup: string;
        title: string;
        link?: string;
        rank: number;
    }

    // --- Summaries ---
    export interface ItemSummaryByMarketplace {
        marketplaceId: string;
        adultProduct?: boolean;
        autographed?: boolean;
        brand?: string;
        browseClassification?: ItemBrowseClassification;
        color?: string;
        contributors?: ItemContributor[];
        itemClassification?: ItemClassification;
        itemName?: string;
        manufacturer?: string;
        memorabilia?: boolean;
        modelNumber?: string;
        packageQuantity?: number;
        partNumber?: string;
        releaseDate?: string;
        size?: string;
        style?: string;
        tradeInEligible?: boolean;
        websiteDisplayGroup?: string;
        websiteDisplayGroupName?: string;
    }

    export interface ItemContributor {
        role: ItemContributorRole;
        value: string;
    }

    export interface ItemContributorRole {
        displayName?: string;
        value: string;
    }

    // --- Vendor Details ---
    export interface ItemVendorDetailsByMarketplace {
        marketplaceId: string;
        brandCode?: string;
        manufacturerCode?: string;
        manufacturerCodeParent?: string;
        productCategory?: ItemVendorDetailsCategory;
        productGroup?: string;
        productSubcategory?: ItemVendorDetailsCategory;
        replenishmentCategory?: ReplenishmentCategory;
    }

    export interface ItemVendorDetailsCategory {
        displayName?: string;
        value?: string;
    }

    // ==========================================
    // Error Structure
    // ==========================================

    export interface ErrorList {
        errors: Error[];
    }

    export interface Error {
        code: string;
        message: string;
        details?: string;
    }
}
