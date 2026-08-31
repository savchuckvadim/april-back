import { buildZprSurveySnapshot } from '../lib/zpr-survey-snapshot';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Снимок клиента для элемента ЗПР: плановая дата покупки со СДЕЛКИ, фолбэк
 * на КОМПАНИЮ (реестр op_sale_date_prognoz: лида у поля нет). Читаются уже
 * загруженные сущности контекста — снимок не ходит в Bitrix вовсе.
 */
const portal = (installed = true) =>
    ({
        getEntityFieldByCode: (entity: string, code: string) =>
            installed && code === 'op_sale_date_prognoz'
                ? { bitrixId: `UF_${entity.toUpperCase()}_PROGNOZ` }
                : undefined,
        getFieldBitrixId: (field: { bitrixId: string }) => field.bitrixId,
    }) as unknown as PortalModel;

describe('buildZprSurveySnapshot', () => {
    it('дата берётся со СДЕЛКИ, когда она там есть', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: { UF_DEAL_PROGNOZ: '01.10.2026' },
            company: { UF_COMPANY_PROGNOZ: '15.12.2026' },
        });

        expect(snapshot).toEqual({ ZPR_SALE_DATE_PROGNOZ: '01.10.2026' });
    });

    it('на сделке пусто — фолбэк на компанию', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: { UF_DEAL_PROGNOZ: '   ' },
            company: { UF_COMPANY_PROGNOZ: '15.12.2026' },
        });

        expect(snapshot).toEqual({ ZPR_SALE_DATE_PROGNOZ: '15.12.2026' });
    });

    it('сделки нет вовсе — компания тоже источник', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: null,
            company: { UF_COMPANY_PROGNOZ: '15.12.2026' },
        });

        expect(snapshot).toEqual({ ZPR_SALE_DATE_PROGNOZ: '15.12.2026' });
    });

    it('значений нет нигде — пустой снимок, поле не затирается пустотой', () => {
        expect(
            buildZprSurveySnapshot({
                portal: portal(),
                baseDeal: {},
                company: null,
            }),
        ).toEqual({});
    });

    it('поле не установлено на портале — мягкая деградация в пусто', () => {
        expect(
            buildZprSurveySnapshot({
                portal: portal(false),
                baseDeal: { UF_DEAL_PROGNOZ: '01.10.2026' },
                company: null,
            }),
        ).toEqual({});
    });
});
