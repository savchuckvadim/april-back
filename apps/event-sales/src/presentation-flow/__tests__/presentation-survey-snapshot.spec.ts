import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { buildPresentationSurveySnapshot } from '../lib/presentation-survey-snapshot';
import {
    derivePresentationOutcome,
    PRESENTATION_OUTCOME,
} from '../lib/presentation-outcome';

/**
 * Снимок анкеты и вывод исхода — чистые функции сайд-flow презентаций:
 * «5К» читается с ЛИДА, вопросы «Разговора» — с базовой СДЕЛКИ, булевы
 * нормализуются в 'Y'/'N', пустые ответы не переносятся.
 */
const portal = (over?: {
    /** Коды полей, которых на портале НЕТ. */
    missing?: string[];
}): PortalModel =>
    ({
        getEntityFieldByCode: (_entity: string, code: string) =>
            (over?.missing ?? []).includes(code)
                ? undefined
                : { bitrixId: code.toUpperCase() },
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as unknown as PortalModel;

describe('buildPresentationSurveySnapshot', () => {
    it('«5К» с лида, «Хвост» со сделки, булевы → Y/N', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            lead: {
                UF_CRM_OP_PRESENTATION_5K: 'Решает директор',
                UF_CRM_OP_5K_CLIENT_WHAT: '  Хочет замену  ',
                UF_CRM_OP_PRESENTATION_XVOST: 'Дожать через неделю',
            },
            baseDeal: {
                UF_CRM_OP_XVOST_DECISION_CALL_DATE: '05.09.2026',
                UF_CRM_OP_XVOST_IS_OFFER: '1',
                UF_CRM_OP_XVOST_IS_PRICE: '0',
            },
        });

        expect(snapshot.PRES_5K_SUMMARY).toBe('Решает директор');
        // Строки обрезаются по краям — как и при переносе в pres-сделку.
        expect(snapshot.PRES_5K_CLIENT_WHAT).toBe('Хочет замену');
        expect(snapshot.PRES_XVOST).toBe('Дожать через неделю');
        expect(snapshot.PRES_DECISION_CALL_DATE).toBe('05.09.2026');
        // '1' → 'Y', а '0' обязано стать 'N', а не непустой строкой «0».
        expect(snapshot.PRES_IS_OFFER).toBe('Y');
        expect(snapshot.PRES_IS_PRICE).toBe('N');
    });

    it('пустые ответы и неустановленные поля не переносятся', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal({ missing: ['op_presentation_xvost'] }),
            lead: {
                UF_CRM_OP_PRESENTATION_5K: '   ',
                UF_CRM_OP_PRESENTATION_XVOST: 'есть, но поля нет',
            },
            baseDeal: null,
        });

        expect(snapshot.PRES_5K_SUMMARY).toBeUndefined();
        expect(snapshot.PRES_XVOST).toBeUndefined();
        // Сделки нет — вопросы «Разговора» просто отсутствуют.
        expect(snapshot.PRES_IS_OFFER).toBeUndefined();
    });
});

describe('derivePresentationOutcome', () => {
    const flags = (
        over?: Partial<Parameters<typeof derivePresentationOutcome>[0]>,
    ) => ({
        isSuccessSale: false,
        isFail: false,
        isExpired: false,
        isResult: true,
        ...over,
    });

    it('порядок проверок: продажа → отказ → перенос → без результата → проведена', () => {
        expect(
            derivePresentationOutcome(
                flags({ isSuccessSale: true, isExpired: true }),
            ),
        ).toBe(PRESENTATION_OUTCOME.success);
        // Финал важнее переноса: иначе отказ повис бы открытой презентацией.
        expect(
            derivePresentationOutcome(flags({ isFail: true, isExpired: true })),
        ).toBe(PRESENTATION_OUTCOME.fail);
        expect(derivePresentationOutcome(flags({ isExpired: true }))).toBe(
            PRESENTATION_OUTCOME.expired,
        );
        expect(derivePresentationOutcome(flags({ isResult: false }))).toBe(
            PRESENTATION_OUTCOME.noresult,
        );
        expect(derivePresentationOutcome(flags())).toBe(
            PRESENTATION_OUTCOME.done,
        );
    });
});
