/**
 * Событие, снимок сделок и настоящий контекст события на фейковом портале.
 */
import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import { EventDocumentContext } from '../../services/context/event-document.context';
import { EventDocumentSnapshot } from '../../services/init/event-document-init.types';
import {
    BASE_CATEGORY_BITRIX_ID,
    DOCUMENT_BASE_DEAL_ID,
    DOCUMENT_COMPANY_ID,
    DOCUMENT_CREATED_AT,
    DOCUMENT_DOMAIN,
    DOCUMENT_EVENT_ID,
    DOCUMENT_USER_ID,
} from './document-scenario.fixture';
import { baseStageId } from './portal-categories.fixture';
import { FakePortalOptions, makeFakePortal } from './fake-portal.fixture';

// === Событие, снимок и контекст ===
export const makeEvent = (
    over: Partial<SalesDocumentEventJobData> = {},
): SalesDocumentEventJobData => ({
    eventId: DOCUMENT_EVENT_ID,
    domain: DOCUMENT_DOMAIN,
    userId: DOCUMENT_USER_ID,
    companyId: DOCUMENT_COMPANY_ID,
    dealId: DOCUMENT_BASE_DEAL_ID,
    kinds: [SALES_DOCUMENT_KIND.offer],
    createdAt: DOCUMENT_CREATED_AT,
    ...over,
});

export interface SnapshotOptions {
    /** `null` — компания не прочитана. */
    company?: Record<string, unknown> | null;
    baseDeal?: Record<string, unknown>;
    /** `null` — сделки презентации нет. */
    presentationDeal?: Record<string, unknown> | null;
}

/** По умолчанию основная сделка стоит на «Тёплой» в воронке «ОП Основная». */
export const makeSnapshot = (
    options: SnapshotOptions = {},
): EventDocumentSnapshot => ({
    company: (options.company === undefined
        ? { ID: String(DOCUMENT_COMPANY_ID) }
        : options.company) as never,
    baseDeal: (options.baseDeal ?? {
        ID: String(DOCUMENT_BASE_DEAL_ID),
        CATEGORY_ID: BASE_CATEGORY_BITRIX_ID,
        STAGE_ID: baseStageId('sales_warm'),
    }) as never,
    presentationDeal: (options.presentationDeal ?? null) as never,
});

export interface ContextOptions {
    event?: Partial<SalesDocumentEventJobData>;
    snapshot?: SnapshotOptions;
    portal?: FakePortalOptions;
}

/** Настоящий контекст события на фейковом портале: тест проверяет и его. */
export const makeContext = (options: ContextOptions = {}) => {
    const portal = makeFakePortal(options.portal);
    const ctx = new EventDocumentContext(
        makeEvent(options.event),
        portal as never,
        makeSnapshot(options.snapshot),
    );
    return { ctx, portal };
};
