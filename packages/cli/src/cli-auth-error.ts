export class CliAuthError extends Error {
    readonly code: string;
    readonly details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = 'CliAuthError';
        this.code = code;
        this.details = details;
    }
}
