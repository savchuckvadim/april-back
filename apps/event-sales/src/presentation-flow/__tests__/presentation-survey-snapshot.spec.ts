import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    normalizePresentationSurvey,
    RawPresentationSurveyValues,
} from '../../shared/presentation-survey';
import { buildPresentationSurveySnapshot } from '../lib/presentation-survey-snapshot';
import {
    derivePresentationOutcome,
    PRESENTATION_OUTCOME,
} from '../lib/presentation-outcome';

/**
 * Снимок анкеты и вывод исхода — чистые функции сайд-flow презентаций.
 *
 * Порядок источников снимка: PAYLOAD отчёта → ЛИД → БАЗОВАЯ СДЕЛКА. Первые
 * кейсы — легаси-путь (payload не прислан: «5К» и «Хвост» с лида с фолбэком
 * на сделку, пустые ответы не переносятся); дальше — новый путь с ответами
 * в payload.
 *
 * После переделки 01.09.2026 булевых вопросов в анкете нет вовсе: три
 * галочки стали частью связного текста «ЧТО ПРЕДЛОЖИЛИ». Со сделки читается
 * ровно одно поле — дата звонка по решению.
 */
const portal = (over?: {
    /** Коды полей, которых на портале НЕТ (у всех сущностей). */
    missing?: string[];
    /** Коды, не установленные у КОНКРЕТНОЙ сущности (фолбэк-сценарии). */
    missingOn?: Record<string, string[]>;
}): PortalModel =>
    ({
        getEntityFieldByCode: (entity: string, code: string) =>
            (over?.missing ?? []).includes(code) ||
            (over?.missingOn?.[entity] ?? []).includes(code)
                ? undefined
                : { bitrixId: code.toUpperCase() },
        getFieldBitrixId: (field: { bitrixId: string }) =>
            `UF_CRM_${field.bitrixId}`,
    }) as unknown as PortalModel;

/** Ответы, как их присылает фрейм в payload отчёта. */
const payload = (raw: RawPresentationSurveyValues) =>
    normalizePresentationSurvey(raw);

describe('buildPresentationSurveySnapshot', () => {
    it('«5К» и «Хвост» с лида, дата решения со сделки', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            lead: {
                UF_CRM_OP_PRESENTATION_5K: 'Решает директор',
                UF_CRM_OP_5K_CLIENT: '  Хочет замену  ',
                UF_CRM_OP_PRESENTATION_XVOST: 'Дожать через неделю',
            },
            baseDeal: {
                UF_CRM_OP_XVOST_DECISION_CALL_DATE: '05.09.2026',
            },
        });

        expect(snapshot.PRES_5K_SUMMARY).toBe('Решает директор');
        // Строки обрезаются по краям — как и при переносе в pres-сделку.
        expect(snapshot.PRES_5K_CLIENT).toBe('Хочет замену');
        expect(snapshot.PRES_XVOST).toBe('Дожать через неделю');
        expect(snapshot.PRES_DECISION_CALL_DATE).toBe('05.09.2026');
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
        // Сделки нет — дате звонка по решению взяться неоткуда.
        expect(snapshot.PRES_DECISION_CALL_DATE).toBeUndefined();
    });

    it('без лида ответы анкеты читаются с базовой сделки (deal-placement)', () => {
        // Ручка /presentation-survey с 31.08 зеркалит «5К»/«Разговор» в
        // сделки — фолбэк карты обязан подобрать их, иначе снимок в
        // deal-placement пуст (todo3108 №1).
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            lead: null,
            baseDeal: {
                UF_CRM_OP_PRESENTATION_5K: 'Решает директор',
                UF_CRM_OP_5K_CLIENT: 'Хочет замену',
                UF_CRM_OP_XVOST_DESIRE: 'Слушали внимательно',
            },
        });

        expect(snapshot.PRES_5K_SUMMARY).toBe('Решает директор');
        expect(snapshot.PRES_5K_CLIENT).toBe('Хочет замену');
        expect(snapshot.PRES_XVOST_DESIRE).toBe('Слушали внимательно');
    });

    it('лид точнее сделки, а пустой лид фолбэк не блокирует', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            lead: {
                UF_CRM_OP_5K_CLIENT: 'из лида',
                UF_CRM_OP_XVOST_DESIRE: '   ',
            },
            baseDeal: {
                UF_CRM_OP_5K_CLIENT: 'из сделки',
                UF_CRM_OP_XVOST_DESIRE: 'из сделки',
            },
        });

        // Первое непустое побеждает: заполненный лид главнее…
        expect(snapshot.PRES_5K_CLIENT).toBe('из лида');
        // …а пробельный ответ лида «непустым» не считается.
        expect(snapshot.PRES_XVOST_DESIRE).toBe('из сделки');
    });

    /*
     * ГЛАВНЫЙ кейс нового пути: ответы приехали ВМЕСТЕ с отчётом, и снимок
     * собирается, даже когда читать нечего — «анкету отправили после
     * отчёта» (сущности ещё пусты) и «встройка в сделку» (лида нет вовсе,
     * todo3108 №1) перестают быть ловушками.
     */
    it('ответы из PAYLOAD доезжают при пустых лиде и сделке', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            survey: payload({
                xvost: 'Дожать через неделю',
                fiveKSummary: 'Решает директор',
                fiveK: { op_5k_client: 'Хочет замену' },
                talk: { op_xvost_desire: 'Слушали внимательно' },
            }),
            lead: null,
            baseDeal: null,
        });

        expect(snapshot.PRES_XVOST).toBe('Дожать через неделю');
        expect(snapshot.PRES_5K_SUMMARY).toBe('Решает директор');
        expect(snapshot.PRES_5K_CLIENT).toBe('Хочет замену');
        expect(snapshot.PRES_XVOST_DESIRE).toBe('Слушали внимательно');
    });

    it('PAYLOAD перекрывает значения лида и сделки', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            survey: payload({ fiveK: { op_5k_client: 'из payload' } }),
            lead: { UF_CRM_OP_5K_CLIENT: 'из лида' },
            baseDeal: { UF_CRM_OP_5K_CLIENT: 'из сделки' },
        });

        expect(snapshot.PRES_5K_CLIENT).toBe('из payload');
    });

    it('ответа нет в PAYLOAD — работает прежний фолбэк по сущностям', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            survey: payload({ xvost: 'из payload' }),
            lead: { UF_CRM_OP_5K_CLIENT: 'из лида' },
            baseDeal: { UF_CRM_OP_XVOST_DESIRE: 'из сделки' },
        });

        expect(snapshot.PRES_XVOST).toBe('из payload');
        expect(snapshot.PRES_5K_CLIENT).toBe('из лида');
        expect(snapshot.PRES_XVOST_DESIRE).toBe('из сделки');
    });

    /*
     * Ответу из payload слепок портала не нужен вовсе: поле смарта
     * адресуется кодом карты напрямую. Ровно поэтому новый путь не
     * повторяет инцидент «поля нет в слепке — ответ молча пропал».
     */
    it('PAYLOAD не зависит от того, заведены ли поля на лиде и сделке', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal({
                missing: ['op_presentation_xvost', 'op_5k_client'],
            }),
            survey: payload({
                xvost: 'Дожать через неделю',
                fiveK: { op_5k_client: 'Хочет замену' },
            }),
            lead: null,
            baseDeal: null,
        });

        expect(snapshot.PRES_XVOST).toBe('Дожать через неделю');
        expect(snapshot.PRES_5K_CLIENT).toBe('Хочет замену');
    });

    /*
     * Дата звонка по решению в анкету payload не входит: это отдельное поле
     * сделки, а не текстовый блок с вопросами. Её единственный источник —
     * базовая сделка, и приход payload этого не меняет.
     *
     * Заодно проверяется whitelist: код не из состава анкеты не доезжает,
     * что бы клиент ни прислал.
     */
    it('дата решения берётся со сделки даже при непустом PAYLOAD', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal(),
            survey: payload({
                xvost: 'Дожать через неделю',
                fiveK: {
                    // Левый код: whitelist анкеты его не пропустит.
                    op_xvost_decision_call_date: '01.01.2020',
                },
            }),
            lead: null,
            baseDeal: { UF_CRM_OP_XVOST_DECISION_CALL_DATE: '05.09.2026' },
        });

        expect(snapshot.PRES_XVOST).toBe('Дожать через неделю');
        expect(snapshot.PRES_DECISION_CALL_DATE).toBe('05.09.2026');
    });

    it('фолбэк молчит, если поле не установлено на сделке', () => {
        const snapshot = buildPresentationSurveySnapshot({
            portal: portal({ missingOn: { deal: ['op_xvost_desire'] } }),
            lead: null,
            baseDeal: { UF_CRM_OP_XVOST_DESIRE: 'есть, но поля нет' },
        });

        expect(snapshot.PRES_XVOST_DESIRE).toBeUndefined();
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
