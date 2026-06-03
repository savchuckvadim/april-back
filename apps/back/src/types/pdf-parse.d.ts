declare module 'pdf-parse' {
    interface PdfParseResult {
        text: string;
        numpages: number;
        numrender: number;
        info: Record<string, unknown>;
        metadata: Record<string, unknown> | null;
        version: string;
    }

    function pdfParse(
        data: Buffer | Uint8Array,
        options?: Record<string, unknown>,
    ): Promise<PdfParseResult>;

    export = pdfParse;
}
