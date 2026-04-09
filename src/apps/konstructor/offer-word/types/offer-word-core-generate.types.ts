import { WordTemplate } from '@/modules/offer-template/word';

/** Опции «чистой» генерации: только шаблон → данные → DOCX на диске. */
export type OfferWordCoreGenerateOptions = {
    /**
     * true — как раньше saveRenderedDocx: публичная ссылка на DOCX.
     * false — только файл на диске (для последующей конвертации в PDF без URL).
     */
    publishDocxLink: boolean;
};

export type OfferWordCoreGenerateResult<TRenderData = unknown> = {
    template: WordTemplate;
    renderData: TRenderData;
    docxPath: string;
    resultFileName: string;
    /** Только при publishDocxLink: true */
    docxLink?: string;
};
