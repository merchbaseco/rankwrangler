export const verifiedOfficialBrands = [
    {
        displayBrand: 'Disney',
        evidenceUrl:
            'https://disneyparksblog.com/products/shop-for-last-minute-disney-holiday-gifts-with-amazon-merch-on-demand/',
    },
    { displayBrand: 'Marvel', evidenceUrl: 'https://www.amazon.com/dp/B08QYHKDXH' },
    { displayBrand: 'STAR WARS', evidenceUrl: 'https://www.starwars.com/news/revenge-of-the-6th' },
    { displayBrand: 'DC Comics', evidenceUrl: 'https://www.amazon.com/dp/B08JXJ68Y7' },
].map(brand => ({ ...brand, marketplaceId: 'ATVPDKIKX0DER', verifiedAt: '2026-10-25T00:00:00Z' }));
