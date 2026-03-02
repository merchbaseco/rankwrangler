export const extractTopClickedCategorySlot = (normalizedKey: string) => {
    if (normalizedKey.includes('product')) {
        return null;
    }

    const match = normalizedKey.match(/^topclickedcategor(?:y|ies)(\d+)$/);
    if (!match) {
        return null;
    }

    const parsedSlot = Number(match[1]);
    return Number.isFinite(parsedSlot) && parsedSlot > 0 ? parsedSlot : null;
};
