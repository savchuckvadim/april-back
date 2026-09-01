import { buildZprSurveySnapshot } from '../lib/zpr-survey-snapshot';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Снимок клиента для элемента ЗПР: плановая дата покупки со СДЕЛКИ, фолбэк
 * на КОМПАНИЮ (реестр op_sale_date_prognoz: лида у поля нет). Читаются уже
 * загруженные сущности контекста — снимок не ходит в Bitrix вовсе.
 */
const SNAPSHOT_CODES = [
    'op_sale_date_prognoz',
    'op_presentation_xvost',
    'op_presentation_5k',
];

const portal = (installed = true) =>
    ({
        getEntityFieldByCode: (entity: string, code: string) => {
            if (!installed || !SNAPSHOT_CODES.includes(code)) return undefined;
            const suffix =
                code === 'op_sale_date_prognoz'
                    ? 'PROGNOZ'
                    : code === 'op_presentation_xvost'
                      ? 'XVOST'
                      : 'FIVE_K';
            return { bitrixId: `UF_${entity.toUpperCase()}_${suffix}` };
        },
        getFieldBitrixId: (field: { bitrixId: string }) => field.bitrixId,
    }) as unknown as PortalModel;

/** Нормализованные ответы анкеты — как их отдаёт normalizePresentationSurvey. */
const surveyValues = (over: {
    xvost?: string | null;
    fiveKSummary?: string | null;
}) =>
    ({
        fiveK: new Map<string, string>(),
        talk: new Map<string, string>(),
        xvost: over.xvost ?? null,
        fiveKSummary: over.fiveKSummary ?? null,
        droppedCodes: [],
    }) as never;

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

/*
 * Сводки анкеты в элементе ЗПР (требование владельца 01.09.2026):
 * запланировали ЗПР и в том же отчёте отчитались по презентации —
 * собранный отчёт обязан приехать в ЗПР. Детализации по блокам здесь нет
 * намеренно: она живёт в элементе презентации.
 */
describe('сводки анкеты в снимке ЗПР', () => {
    it('сводки берутся со сделки', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: {
                UF_DEAL_XVOST: 'дожать через неделю',
                UF_DEAL_FIVE_K: 'КЛИЕНТ: нормативка',
            },
            company: null,
        });

        expect(snapshot.ZPR_XVOST).toBe('дожать через неделю');
        expect(snapshot.ZPR_5K_SUMMARY).toBe('КЛИЕНТ: нормативка');
    });

    it('на сделке пусто — фолбэк на лид (компании у сводок нет)', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: { UF_DEAL_XVOST: '   ' },
            company: { UF_COMPANY_XVOST: 'компанию не спрашиваем' },
            lead: { UF_LEAD_XVOST: 'с лида' },
        });

        expect(snapshot.ZPR_XVOST).toBe('с лида');
    });

    /*
     * ГЛАВНЫЙ кейс. Строки сущностей прочитаны ДО записи батча, поэтому у
     * клиента, заполнившего анкету прямо сейчас, в сделке лежит ещё прошлая
     * сводка. Без приоритета payload элемент ЗПР унёс бы позапрошлый отчёт.
     */
    it('PAYLOAD этого отчёта перекрывает сделку и лид', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: { UF_DEAL_XVOST: 'прошлый отчёт' },
            company: null,
            lead: { UF_LEAD_XVOST: 'позапрошлый отчёт' },
            survey: surveyValues({ xvost: 'ответ ЭТОГО отчёта' }),
        });

        expect(snapshot.ZPR_XVOST).toBe('ответ ЭТОГО отчёта');
    });

    it('в payload сводки нет — работает прежний фолбэк по сущностям', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(),
            baseDeal: { UF_DEAL_XVOST: 'со сделки' },
            company: null,
            survey: surveyValues({ fiveKSummary: 'только пятёрка' }),
        });

        expect(snapshot.ZPR_XVOST).toBe('со сделки');
        expect(snapshot.ZPR_5K_SUMMARY).toBe('только пятёрка');
    });

    it('поля не установлены на портале — снимок молчит', () => {
        const snapshot = buildZprSurveySnapshot({
            portal: portal(false),
            baseDeal: { UF_DEAL_XVOST: 'дожать' },
            company: null,
        });

        expect(snapshot).not.toHaveProperty('ZPR_XVOST');
    });
});
