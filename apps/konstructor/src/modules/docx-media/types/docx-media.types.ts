/** Что сделали с конкретной картинкой и почему. */
export type DocxMediaAction =
    | 'resized'
    | 'recompressed'
    | 'skipped-small'
    | 'skipped-format'
    | 'skipped-no-gain'
    | 'failed';

export type DocxMediaItemReport = {
    name: string;
    action: DocxMediaAction;
    beforeBytes: number;
    afterBytes: number;
    /** Пиксели до и после — видно, сколько лишнего разрешения было. */
    before?: { width: number; height: number };
    after?: { width: number; height: number };
    format?: string;
    note?: string;
};

export type DocxMediaOptimizationResult = {
    /** Оптимизированный .docx. null в режиме dryRun — файл не собирался. */
    buffer: Buffer | null;
    beforeBytes: number;
    afterBytes: number;
    mediaBeforeBytes: number;
    mediaAfterBytes: number;
    items: DocxMediaItemReport[];
};
