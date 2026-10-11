declare const __BUILD_REVISION__: string | undefined;

export const BUILD_REVISION: string =
    typeof __BUILD_REVISION__ === 'string' ? __BUILD_REVISION__ : 'dev';
