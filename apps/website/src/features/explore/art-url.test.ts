import { describe, expect, it } from 'bun:test';
import { artUrl } from './art-url';

describe('artUrl', () => {
    it('asks Amazon for the rendition size', () => {
        expect(artUrl('https://m.media-amazon.com/images/I/71D++1QDHlL.jpg', 'thumb')).toBe(
            'https://m.media-amazon.com/images/I/71D++1QDHlL._SL160_.jpg'
        );
        expect(artUrl('https://m.media-amazon.com/images/I/51nbrJq2f-L.png', 'large')).toBe(
            'https://m.media-amazon.com/images/I/51nbrJq2f-L._SL640_.png'
        );
    });

    it('replaces size modifiers already on the URL', () => {
        expect(
            artUrl('https://m.media-amazon.com/images/I/71QTdVB8miL._AC_SX679_.jpg', 'thumb')
        ).toBe('https://m.media-amazon.com/images/I/71QTdVB8miL._SL160_.jpg');
    });

    it('leaves other images alone', () => {
        const cutout = 'https://images.rankwrangler.merchbase.co/cutouts/abc.webp';
        expect(artUrl(cutout, 'thumb')).toBe(cutout);
        expect(artUrl('not a url', 'thumb')).toBe('not a url');
    });
});
