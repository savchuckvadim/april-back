import { Logger } from '@nestjs/common';
import { SALES_DOCUMENT_KIND, SalesDocumentEventJobData } from '@lib/queue';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE as STAGE,
    PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { DocumentBaseDealService } from '../services/deal/document-base-deal.service';
import {
    BASE_CATEGORY_BITRIX_ID,
    DOCUMENT_BASE_DEAL_ID,
    FakePortalOptions,
    baseStageId,
    fieldKey,
    makeBaseCategory,
    makeContext,
    makeFakeBitrix,
    makeFakeBuffer,
    makePresentationCategory,
} from './event-document.fixtures';

const { offer, supply } = SALES_DOCUMENT_KIND;

interface RunOptions {
    /** Стадия сделки в воронке «ОП Основная»; по умолчанию «Тёплая». */
    stage?: PbxDealSalesBaseStageCode;
    /** Своя запись сделки целиком (перекрывает `stage`). */
    deal?: Record<string, unknown>;
    event?: Partial<SalesDocumentEventJobData>;
    portal?: FakePortalOptions;
}

const run = ({ stage = STAGE.warm, deal, event, portal }: RunOptions = {}) => {
    const { bitrix, dealUpdates } = makeFakeBitrix();
    const { ctx, portal: fakePortal } = makeContext({
        event,
        portal,
        snapshot: {
            baseDeal: deal ?? {
                ID: String(DOCUMENT_BASE_DEAL_ID),
                CATEGORY_ID: BASE_CATEGORY_BITRIX_ID,
                STAGE_ID: baseStageId(stage),
                [fieldKey('op_offer_q')]: '2',
            },
        },
    });
    const buffer = makeFakeBuffer();

    new DocumentBaseDealService(bitrix as never, fakePortal as never).queue(
        ctx,
        buffer,
    );
    return { dealUpdates, buffer };
};

/**
 * «ОП Основная» по документу: поля карточки и стадия уходят одной командой
 * `deal.update`. Документ двигает сделку только вперёд, чужую воронку не
 * трогает, а ответственного и название не меняет — сделку не создаёт.
 */
describe('DocumentBaseDealService — основная сделка по документу', () => {
    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(
            () => undefined,
        );
    });

    afterEach(() => jest.restoreAllMocks());

    it('сделка на «Тёплой» + КП: одна команда — стадия «Создание КП» и счётчик КП', () => {
        const { dealUpdates } = run({ stage: STAGE.warm });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].cmd).toBe('doc_base_deal');
        expect(dealUpdates[0].id).toBe(DOCUMENT_BASE_DEAL_ID);
        expect(dealUpdates[0].fields).toMatchObject({
            STAGE_ID: `C${BASE_CATEGORY_BITRIX_ID}:OFFER_CREATE`,
            // В карточке было 2 КП — станет 3.
            [fieldKey('op_offer_q')]: 3,
        });
    });

    it('команда ставится в буфер пачки, а не уходит в Битрикс сразу', () => {
        const { buffer } = run();

        expect(buffer.getCurrentGroupSize()).toBe(1);
    });

    it.each([STAGE.new, STAGE.cold, STAGE.presentation, STAGE.refine])(
        'сделка на стадии %s + КП: двигается на «Создание КП»',
        stage => {
            const { dealUpdates } = run({ stage });

            expect(dealUpdates[0].fields.STAGE_ID).toBe(
                baseStageId(STAGE.offerCreate),
            );
        },
    );

    it('сделка на «Документы отправлены» + КП: стадии в полях нет, счётчик есть', () => {
        const { dealUpdates } = run({ stage: STAGE.documentSend });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_offer_q')]).toBe(3);
    });

    it('сделка уже на «Создании КП»: повторное КП стадию не пишет', () => {
        const { dealUpdates } = run({ stage: STAGE.offerCreate });

        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_offer_q')]).toBe(3);
    });

    it('сделка на «Ожидании денег» + поставка: двигается на «Поставку»', () => {
        const { dealUpdates } = run({
            stage: STAGE.moneyAwait,
            event: { kinds: [supply] },
        });

        expect(dealUpdates[0].fields.STAGE_ID).toBe(baseStageId(STAGE.supply));
        expect(dealUpdates[0].fields[fieldKey('op_supplies_q')]).toBe(1);
    });

    it('закрытая сделка: стадию документ не меняет, счётчики пишутся', () => {
        const { dealUpdates } = run({
            stage: STAGE.success,
            event: { kinds: [offer, supply] },
        });

        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_supplies_q')]).toBe(1);
    });

    it('сделка в другой воронке: стадии нет, поля есть', () => {
        const { dealUpdates } = run({
            deal: {
                ID: String(DOCUMENT_BASE_DEAL_ID),
                CATEGORY_ID: '99',
                STAGE_ID: 'C99:WARM',
            },
        });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_offer_q')]).toBe(1);
    });

    it('категория сделки числом тоже сравнивается с воронкой основной', () => {
        const { dealUpdates } = run({
            deal: {
                ID: String(DOCUMENT_BASE_DEAL_ID),
                CATEGORY_ID: Number(BASE_CATEGORY_BITRIX_ID),
                STAGE_ID: baseStageId(STAGE.warm),
            },
        });

        expect(dealUpdates[0].fields.STAGE_ID).toBe(
            baseStageId(STAGE.offerCreate),
        );
    });

    it('на портале нет воронки «ОП Основная»: стадии нет, поля есть', () => {
        const { dealUpdates } = run({
            portal: { categories: [makePresentationCategory()] },
        });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_offer_q')]).toBe(3);
    });

    it('целевая стадия не установлена в воронке портала: стадии нет, поля есть', () => {
        const { dealUpdates } = run({
            portal: {
                categories: [makeBaseCategory([STAGE.offerCreate])],
            },
        });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
        expect(dealUpdates[0].fields[fieldKey('op_offer_q')]).toBe(3);
    });

    it('стадия сделки неизвестна лестнице (своя стадия портала): не двигаем', () => {
        const { dealUpdates } = run({
            deal: {
                ID: String(DOCUMENT_BASE_DEAL_ID),
                CATEGORY_ID: BASE_CATEGORY_BITRIX_ID,
                STAGE_ID: `C${BASE_CATEGORY_BITRIX_ID}:MY_OWN_STAGE`,
            },
        });

        expect(dealUpdates[0].fields).not.toHaveProperty('STAGE_ID');
    });

    it('ответственного и название сделки документ не меняет никогда', () => {
        const scenarios: RunOptions[] = [
            { stage: STAGE.warm },
            { stage: STAGE.documentSend },
            { stage: STAGE.moneyAwait, event: { kinds: [supply] } },
            { event: { kinds: [offer, supply], presentation: {} } },
        ];

        for (const scenario of scenarios) {
            const { dealUpdates } = run(scenario);

            const keys = Object.keys(dealUpdates[0].fields);
            expect(keys).not.toContain('ASSIGNED_BY_ID');
            expect(keys).not.toContain('TITLE');
            // Пишутся только стадия и пользовательские поля документов.
            expect(
                keys.every(
                    key => key === 'STAGE_ID' || key.startsWith('UF_CRM_'),
                ),
            ).toBe(true);
        }
    });

    it('писать нечего (полей нет на портале, стадия не двигается) — команда не ставится', () => {
        const { dealUpdates, buffer } = run({
            stage: STAGE.documentSend,
            portal: { fields: {} },
        });

        expect(dealUpdates).toEqual([]);
        expect(buffer.getCurrentGroupSize()).toBe(0);
    });

    it('полей нет на портале, но сделку надо двигать — уходит одна стадия', () => {
        const { dealUpdates } = run({
            stage: STAGE.warm,
            portal: { fields: {} },
        });

        expect(dealUpdates).toHaveLength(1);
        expect(dealUpdates[0].fields).toEqual({
            STAGE_ID: baseStageId(STAGE.offerCreate),
        });
    });
});
