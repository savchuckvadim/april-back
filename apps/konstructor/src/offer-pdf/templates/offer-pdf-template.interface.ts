import type { ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import type { OfferPdfPageFrame } from '../lib/pdf-layout';
import {
    OfferPdfBrand,
    OfferPdfDocumentModel,
} from '../model/offer-pdf-document.model';
import { OfferPdfSettings } from '../model/offer-pdf-settings';
import { OfferPdfTemplateCode } from '../model/offer-pdf-template-code';
import type {
    OfferPdfPalette,
    OfferPdfPaletteInfo,
} from './kit/theme/offer-pdf-palette';

/**
 * PDF-шаблон КП. Единственная обязанность — из модели документа собрать
 * React-дерево `<Document>` для @react-pdf/renderer. Данные шаблон не
 * считает и не ходит в БД: всё приходит в модели. Поля страницы (frame)
 * сервис рендера подбирает по измеренным шапке и подвалу; без них шаблон
 * берёт свои.
 */
export interface OfferPdfTemplate {
    readonly code: OfferPdfTemplateCode;
    /** Название для выбора в конструкторе */
    readonly name: string;
    readonly description: string;
    /** У стиля есть титульный лист (включается настройкой withCover) */
    readonly hasCover: boolean;
    /** У стиля есть промо-страница (включается настройкой withPromo) */
    readonly hasPromo: boolean;
    /**
     * Настройки, которые стиль задаёт сам: вёрстка стиля рассчитана на них
     * (например, описания комплекта только таблицей). Рендер ставит их
     * поверх выбора менеджера, фронт по списку стилей гасит переключатели.
     */
    readonly lockedSettings?: Partial<OfferPdfSettings>;
    /** Гаммы стиля; первая — по умолчанию. Нет — у стиля одна тема */
    readonly palettes?: readonly OfferPdfPalette[];
    /**
     * Картинки стиля из storage/app/konstructor/offer-pdf («facet/cover.jpg»)
     * и логотипы: сервис рендера подгружает их в model.assets до рендера
     */
    readonly assets?: readonly string[];
    readonly logos?: readonly OfferPdfBrand[];
    render(
        model: OfferPdfDocumentModel,
        frame?: OfferPdfPageFrame,
    ): ReactElement<DocumentProps>;
}

/** Описание шаблона для списка в UI (без функции рендера). */
export interface OfferPdfTemplateInfo {
    code: OfferPdfTemplateCode;
    name: string;
    description: string;
    hasCover: boolean;
    hasPromo: boolean;
    lockedSettings: Partial<OfferPdfSettings>;
    palettes: OfferPdfPaletteInfo[];
}
