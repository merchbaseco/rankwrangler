import { describe, expect, it } from 'bun:test';
import {
    extractKeywordPrefix,
    merchProductTermKind,
    prefixContains,
    prefixTrialTerms,
} from './keyword-prefix';

describe('keyword prefix', () => {
    it.each([
        ['teacher shirts for women', 'teacher'],
        ['funny pickleball dad shirt', 'pickleball dad'],
        ['mele kalikimaka sweatshirt', 'mele kalikimaka'],
        ['christmas mugs', 'christmas'],
        ['shirt', null],
        ['hat trick hockey shirt', 'hat trick hockey'],
        ['teacher blanket', 'teacher'],
        ['iphone 16 case', 'iphone 16'],
        ['pen pal shirt', 'pen pal'],
        ['pen pal', 'pen pal'],
        ['cat in the hat shirt', 'cat in the hat'],
        ['Funny  Nurse T-Shirt!', 'nurse'],
        ['mama tshirts', 'mama'],
        ['graphic tees for men', null],
        ['vintage retro shirt', 'vintage retro'],
        ['dog mom long sleeve shirt', 'dog mom'],
        ['fishing 1/4 zip pullover', 'fishing'],
        ['fishing 1/4 zip', 'fishing'],
        ['teacher tote bag', 'teacher'],
        ['nurse coffee mug gift', 'nurse'],
        ['hockey water bottle', 'hockey'],
        ['cat mom popsockets', 'cat mom'],
        ['cat mom pop socket', 'cat mom'],
        ['gamer mouse pad', 'gamer'],
        ['christmas throw pillow covers', 'christmas'],
        ['dodgers baseball cap', 'dodgers'],
        ['baseball shirt', 'baseball'],
        ['hoodies and sweatshirts', null],
        ["mom's birthday shirt", "mom's birthday"],
        ['’90s kid shirt', '90s'],
        ['halloween', 'halloween'],
        ['a shirt for kids', null],
        ['x shirt', null],
        ['   ', null],
    ])('extracts the prefix of %p', (term: string, prefix: string | null) => {
        expect(extractKeywordPrefix(term)).toBe(prefix);
    });

    it.each([
        ['teacher shirts for women', 'apparel'],
        ['shirt', 'apparel'],
        ['trucker hat', 'headwear'],
        ['christmas tote bag', 'bag'],
        ['iphone 16 case', 'phoneAccessory'],
        ['teacher blanket', 'home'],
        ['christmas mugs', 'drinkware'],
        ['nurse journal', 'stationery'],
        ['hat trick hockey', null],
        ['diamond tester', null],
        ['glp1', null],
        ['umbrella', null],
        ['storage bin', null],
        ['shirts for teachers', null],
    ])('judges whether %p names a Merch product', (term: string, kind: string | null) => {
        expect(merchProductTermKind(term)).toBe(kind as never);
    });

    it('matches prefixes on whole words', () => {
        expect(prefixContains('teacher', 'teacher')).toBe(true);
        expect(prefixContains('funny teacher life', 'teacher')).toBe(true);
        expect(prefixContains('teachers', 'teacher')).toBe(false);
        expect(prefixContains('preschool teacher', 'school teacher')).toBe(false);
    });

    it('keeps prefix autocomplete suggestions that name a product and keep the prefix', () => {
        expect(
            prefixTrialTerms('teacher', [
                'teacher shirts',
                'teacher gifts',
                'teacher appreciation tumbler',
                'teachers lounge sign',
                'teacher bags for women',
                'preacher shirt',
                'teacher',
            ])
        ).toEqual(['teacher shirts', 'teacher appreciation tumbler', 'teacher bags for women']);
    });
});
