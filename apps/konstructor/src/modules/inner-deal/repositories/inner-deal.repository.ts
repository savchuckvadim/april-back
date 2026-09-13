import { BxDocumentDeal } from 'generated/prisma';

/**
 * Порядок выбора строки, когда слепков по ключу несколько.
 * 'oldest' — исторический дефолт чтения; 'newest' — для копирования,
 * восстанавливать надо последнее сохранённое состояние.
 */
export type InnerDealSnapshotOrder = 'oldest' | 'newest';

/**
 * Чем слепок отличается от других слепков той же сделки.
 *
 * Исторически различитель был один — `serviceSmartId` (слепок «предложения на
 * будущий период»). С вариантами комплекта их стало два: у варианта свой
 * элемент смарта «Варианты комплекта», и он кладётся в колонку `smartId`
 * (до этого пустовала: писателей и читателей у неё не было ни в Nest, ни в
 * Laravel — в отличие от `offerSmartId`, который Laravel пишет до сих пор).
 *
 * Оба поля `null` — обычный слепок сделки.
 */
export interface InnerDealSnapshotKey {
    /**
     * Элемент смарта «Сервис Предложение» — черновик БУДУЩЕЙ сделки: пока идёт
     * обсуждение следующего периода, новые цифры нельзя писать в действующую
     * сделку. Ровно один на сделку.
     */
    serviceSmartId?: number | null;
    /**
     * Элемент смарта «Варианты комплекта» — одно из нескольких предложений
     * внутри ТЕКУЩЕЙ сделки. Их много.
     */
    variantSmartId?: number | null;
}

export abstract class InnerDealRepository {
    abstract findById(id: bigint): Promise<BxDocumentDeal | null>;
    abstract findByDomainAndDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal | null>;
    abstract findSnapshot(
        domain: string,
        dealId: number,
        serviceSmartId: number | null,
        order?: InnerDealSnapshotOrder,
    ): Promise<BxDocumentDeal | null>;
    abstract listByDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]>;
    /** Слепок конкретного варианта комплекта. */
    abstract findVariantSnapshot(
        domain: string,
        dealId: number,
        variantSmartId: number,
        order?: InnerDealSnapshotOrder,
    ): Promise<BxDocumentDeal | null>;
    /** Все варианты комплекта сделки (строки с непустым smartId). */
    abstract listVariantsByDealId(
        domain: string,
        dealId: number,
    ): Promise<BxDocumentDeal[]>;
    abstract findPortalIdByDomain(domain: string): Promise<bigint | null>;
    abstract findByDomain(domain: string): Promise<BxDocumentDeal[] | null>;

    abstract findByServiceSmartId(
        domain: string,
        serviceSmartId: number,
        order?: InnerDealSnapshotOrder,
    ): Promise<BxDocumentDeal | null>;
    abstract setOfferTemplate(
        id: bigint,
        offerTemplateId: bigint,
    ): Promise<BxDocumentDeal>;
    abstract create(
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal>;
    abstract update(
        id: bigint,
        innerDeal: Partial<BxDocumentDeal>,
    ): Promise<BxDocumentDeal>;
    abstract delete(id: bigint): Promise<boolean>;
}
