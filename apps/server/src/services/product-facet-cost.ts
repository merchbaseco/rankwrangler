export const estimateProductFacetClassificationCost = ({
    cachedInputTokens,
    inputTokens,
    outputTokens,
}: {
    cachedInputTokens: number;
    inputTokens: number;
    outputTokens: number;
}) => {
    const inputRatePerMillion = 0.1;
    const outputRatePerMillion = 0.4;
    const cachedInputRatePerMillion = inputRatePerMillion * 0.1;
    const billableInputTokens = Math.max(inputTokens - cachedInputTokens, 0);

    const inputCost = (billableInputTokens * inputRatePerMillion) / 1_000_000;
    const cachedInputCost =
        (cachedInputTokens * cachedInputRatePerMillion) / 1_000_000;
    const outputCost = (outputTokens * outputRatePerMillion) / 1_000_000;

    return inputCost + cachedInputCost + outputCost;
};
