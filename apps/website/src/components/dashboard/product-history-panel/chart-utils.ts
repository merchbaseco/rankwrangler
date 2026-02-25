export const formatValue = (metric: string, value: number) => {
    if (isPriceMetric(metric)) {
        return `$${(value / 100).toFixed(2)}`;
    }

    return `#${value.toLocaleString()}`;
};

export const formatAxisValue = (metric: string, value: number) => {
    if (isPriceMetric(metric)) {
        const dollars = value / 100;
        return dollars >= 1000 ? `$${(dollars / 1000).toFixed(1)}k` : `$${dollars.toFixed(0)}`;
    }

    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`;
    }
    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(0)}k`;
    }

    return String(value);
};

const isPriceMetric = (metric: string) =>
    metric === 'priceAmazon' || metric === 'priceNew' || metric === 'priceNewFba';
