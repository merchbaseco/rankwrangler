import {
    colorSignals,
    genderSignals,
    genericApparelSignals,
} from '@/services/spapi/ba-keyword-signals';

const SHORT_GENERIC_APPAREL_PATTERN =
    /^(?:mens?|women'?s?|girls?|boys?)?\s*(?:t[\s-]?shirts?|shirts?|hoodies?|sweatshirts?|tank[\s-]?tops?|tees?|crewnecks?|pullovers?|long[\s-]?sleeves?|apparel)(?:\s*(?:for\s+(?:mens?|women'?s?|girls?|boys?)|mens?|women'?s?|girls?|boys?))?$/i;

export const isShortGenericApparelTerm = (normalizedSearchTerm: string) => {
    if (normalizedSearchTerm.split(' ').length > 4) {
        return false;
    }

    return SHORT_GENERIC_APPAREL_PATTERN.test(normalizedSearchTerm);
};

export const isColorGenderGenericApparelTerm = (normalizedSearchTerm: string) => {
    if (normalizedSearchTerm.split(' ').length > 5) {
        return false;
    }

    const hasGenericApparel = genericApparelSignals.some((signal) =>
        signal.pattern.test(normalizedSearchTerm)
    );
    if (!hasGenericApparel) {
        return false;
    }

    const hasColor = colorSignals.some((signal) => signal.pattern.test(normalizedSearchTerm));
    const hasGender = genderSignals.some((signal) => signal.pattern.test(normalizedSearchTerm));

    return hasColor && hasGender;
};
