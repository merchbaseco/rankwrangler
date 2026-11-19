import sharp from 'sharp';

/** A contact sheet as an MCP image content block's payload. */
export interface ContactSheet {
    data: string;
    mimeType: 'image/jpeg';
}

/**
 * One JPEG grid of Product images in the given order, each cell badged with its 1-based index
 * (white digits on a dark badge, drawn as shapes so no font is needed). A missing image is an
 * empty grey cell. Cells shrink as the grid grows so the sheet stays near MAX_SHEET_WIDTH, and
 * the JPEG quality steps down until the sheet fits MAX_SHEET_BYTES. Null for no images.
 */
export const composeContactSheet = async (
    images: ReadonlyArray<Buffer | null>
): Promise<ContactSheet | null> => {
    if (images.length === 0) return null;
    const columns = Math.min(MAX_COLUMNS, Math.ceil(Math.sqrt(images.length)));
    const rows = Math.ceil(images.length / columns);
    const cell = Math.max(
        MIN_CELL,
        Math.min(MAX_CELL, Math.floor((MAX_SHEET_WIDTH - GAP) / columns - GAP))
    );
    const width = columns * (cell + GAP) + GAP;
    const height = rows * (cell + GAP) + GAP;
    const cells = await Promise.all(
        images.map(async (image, index) => ({
            left: GAP + (index % columns) * (cell + GAP),
            top: GAP + Math.floor(index / columns) * (cell + GAP),
            input: (image && (await fitImage(image, cell))) ?? (await emptyCell(cell)),
        }))
    );
    const canvas = sharp({
        create: { width, height, channels: 3, background: SHEET_BACKGROUND },
    }).composite([
        ...cells,
        { input: Buffer.from(badgesSvg(cells, width, height, cell)), left: 0, top: 0 },
    ]);
    const flattened = await canvas.png().toBuffer();
    for (const quality of JPEG_QUALITIES) {
        const jpeg = await sharp(flattened).jpeg({ quality, mozjpeg: true }).toBuffer();
        if (jpeg.length <= MAX_SHEET_BYTES || quality === JPEG_QUALITIES.at(-1)) {
            return { data: jpeg.toString('base64'), mimeType: 'image/jpeg' };
        }
    }
    return null;
};

const MAX_COLUMNS = 10;
const MAX_SHEET_WIDTH = 1600;
const MIN_CELL = 120;
const MAX_CELL = 320;
const GAP = 6;
const MAX_SHEET_BYTES = 1_000_000;
const JPEG_QUALITIES = [82, 70, 55, 40] as const;
const SHEET_BACKGROUND = { r: 255, g: 255, b: 255 };
const EMPTY_CELL = { r: 200, g: 200, b: 200 };
const BADGE_COLOR = '#111111';

// A decoded image fitted inside the cell on white; null when it does not decode.
const fitImage = async (image: Buffer, cell: number) => {
    try {
        return await sharp(image)
            .resize(cell, cell, { fit: 'contain', background: SHEET_BACKGROUND })
            .flatten({ background: SHEET_BACKGROUND })
            .png()
            .toBuffer();
    } catch {
        return null;
    }
};

const emptyCell = (cell: number) =>
    sharp({ create: { width: cell, height: cell, channels: 3, background: EMPTY_CELL } })
        .png()
        .toBuffer();

const badgesSvg = (
    cells: ReadonlyArray<{ left: number; top: number }>,
    width: number,
    height: number,
    cell: number
) => {
    const scale = Math.max(1, Math.round(cell / 80));
    const badges = cells.map(({ left, top }, index) => {
        const digits = String(index + 1);
        const badgeWidth = (digits.length * (DIGIT_WIDTH + DIGIT_SPACING) + DIGIT_SPACING) * scale;
        const badgeHeight = (DIGIT_HEIGHT + 2 * DIGIT_SPACING) * scale;
        const glyphs = [...digits].map((digit, position) =>
            digitShapes(
                Number(digit),
                left + (DIGIT_SPACING + position * (DIGIT_WIDTH + DIGIT_SPACING)) * scale,
                top + DIGIT_SPACING * scale,
                scale
            )
        );
        return `<rect x="${left}" y="${top}" width="${badgeWidth}" height="${badgeHeight}" fill="${BADGE_COLOR}"/>${glyphs.join('')}`;
    });
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${badges.join('')}</svg>`;
};

const DIGIT_WIDTH = 8;
const DIGIT_HEIGHT = 14;
const DIGIT_SPACING = 3;
const STROKE = 2;

// Seven-segment glyphs: a top, b upper right, c lower right, d bottom, e lower left, f upper
// left, g middle.
const SEGMENTS = {
    a: [0, 0, DIGIT_WIDTH, STROKE],
    b: [DIGIT_WIDTH - STROKE, 0, STROKE, DIGIT_HEIGHT / 2 + STROKE / 2],
    c: [DIGIT_WIDTH - STROKE, DIGIT_HEIGHT / 2 - STROKE / 2, STROKE, DIGIT_HEIGHT / 2 + STROKE / 2],
    d: [0, DIGIT_HEIGHT - STROKE, DIGIT_WIDTH, STROKE],
    e: [0, DIGIT_HEIGHT / 2 - STROKE / 2, STROKE, DIGIT_HEIGHT / 2 + STROKE / 2],
    f: [0, 0, STROKE, DIGIT_HEIGHT / 2 + STROKE / 2],
    g: [0, DIGIT_HEIGHT / 2 - STROKE / 2, DIGIT_WIDTH, STROKE],
} as const;
const DIGIT_SEGMENTS = [
    'abcdef',
    'bc',
    'abged',
    'abgcd',
    'fgbc',
    'afgcd',
    'afgedc',
    'abc',
    'abcdefg',
    'abcdfg',
] as const;

const digitShapes = (digit: number, left: number, top: number, scale: number) =>
    [...(DIGIT_SEGMENTS[digit] ?? '')]
        .map(segment => {
            const [x, y, w, h] = SEGMENTS[segment as keyof typeof SEGMENTS];
            return `<rect x="${left + x * scale}" y="${top + y * scale}" width="${w * scale}" height="${h * scale}" fill="#ffffff"/>`;
        })
        .join('');
