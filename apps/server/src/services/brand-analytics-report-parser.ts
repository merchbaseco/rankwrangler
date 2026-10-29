// A weekly Brand Analytics search terms document is one JSON object whose
// `dataByDepartmentAndSearchTerm` array holds millions of rows (about 8.8M for the US). Parsing it
// whole exhausts a 2 GB heap, so this scans the text stream and hands each row object of that
// top-level array to `onRow` as soon as it closes. Only the row being read is buffered.
export const readBrandAnalyticsRows = async (
    chunks: AsyncIterable<Uint8Array | string>,
    onRow: (row: Record<string, unknown>) => void
) => {
    const decoder = new TextDecoder();
    const scanner = createScanner(onRow);
    for await (const chunk of chunks)
        scanner.scan(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true }));
    scanner.scan(decoder.decode());
    return scanner.finish();
};

const createScanner = (onRow: (row: Record<string, unknown>) => void) => {
    // Open containers from the document root: `{` objects and `[` arrays. A row is an object
    // directly inside an array that is itself directly inside the root object.
    const stack: string[] = [];
    let buffer = '';
    let rowStart = -1;
    let inString = false;
    let escaped = false;
    let rows = 0;
    const scan = (text: string) => {
        const offset = buffer.length;
        buffer += text;
        for (let index = offset; index < buffer.length; index += 1) {
            const character = buffer[index];
            if (inString) {
                if (escaped) escaped = false;
                else if (character === '\\') escaped = true;
                else if (character === '"') inString = false;
                continue;
            }
            if (character === '"') inString = true;
            else if (character === '{' || character === '[') {
                if (character === '{' && isRowParent(stack)) rowStart = index;
                stack.push(character);
            } else if (character === '}' || character === ']') {
                stack.pop();
                if (character === '}' && rowStart >= 0 && isRowParent(stack)) {
                    onRow(JSON.parse(buffer.slice(rowStart, index + 1)));
                    rows += 1;
                    rowStart = -1;
                }
            }
        }
        // Keep only an unfinished row; everything before it has been handled.
        if (rowStart >= 0) {
            buffer = buffer.slice(rowStart);
            rowStart = 0;
        } else buffer = '';
    };
    return {
        scan,
        finish: () => {
            if (stack.length || inString)
                throw new Error('Brand Analytics report ended before its JSON document closed');
            return rows;
        },
    };
};

const isRowParent = (stack: readonly string[]) =>
    stack.length === 2 && stack[0] === '{' && stack[1] === '[';
