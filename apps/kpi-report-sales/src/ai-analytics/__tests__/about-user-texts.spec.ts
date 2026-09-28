import { findParam, type ParamContext } from '@lib/sales-ai-analytics';
import { buildAiAnalyticsAbout } from '../about/ai-analytics-about.builder';
import {
    AI_ABOUT_ENDPOINTS,
    AI_ABOUT_ESTIMATES,
    AI_ABOUT_MODEL_REASONS,
} from '../about/ai-analytics-about.const';
import { AI_ABOUT_ENDPOINT_TEXTS } from '../about/ai-analytics-about.texts.const';
import type { PortalModelPayload } from '../domain/assembler/portal-model.types';
import { recomputeModel } from './fixtures/recompute.fixture';

/**
 * Правило владельца для блока «Как считаем»: всё, что читает
 * руководитель, — простым русским. Ни формул, ни греческих букв, ни
 * кодов реестра, ни жаргона. Проверяются и тексты реестра
 * (`userTitle`/`userDescription` у каждого кода, который попадает в блок),
 * и собранный блок целиком по всем ручкам.
 */

/** Символы формул и обозначения, которых в текстах быть не должно. */
const FORBIDDEN_SYMBOLS = /[κφλβσμθτρα=×_]|E\[|P50|p90|n_min/;

/** Английские коды и жаргон, которые нельзя показывать руководителю. */
const FORBIDDEN_WORDS =
    /\b(descriptive|junior|middle|senior|sales_offer_create|presentation|goodhart|plan_day_ceiling|delta_prac_pct|style_min_calls|n_min_none|template|yoy|ais|snapshot|VibeCode|LLM)\b|ручк[аеиу]|конвейер|презентер|пайплайн|админк/i;

const ABOUT_PARAM_CODES = [
    ...new Set(
        AI_ABOUT_ENDPOINTS.flatMap(
            endpoint => AI_ABOUT_ENDPOINT_TEXTS[endpoint].params,
        ),
    ),
].sort();

/** Все читаемые строки блока одним списком (коды полей не считаются). */
function readableTexts(
    endpoint: (typeof AI_ABOUT_ENDPOINTS)[number],
): string[] {
    const about = buildAiAnalyticsAbout({
        endpoint,
        registry: {} as ParamContext,
        paramsVersion: 'pv-texts',
        comparableFrom: '',
        model: { id: 'ais-model-texts', payload: recomputeModel() },
    });
    const model = about.model;
    return [
        about.title,
        about.purpose,
        ...about.sources,
        ...about.howToRead,
        ...about.notDoing,
        ...about.params.flatMap(param => [param.title, param.description]),
        ...(model === null
            ? []
            : [model.kappa, model.phi, model.lambda].flatMap(estimate => [
                  estimate.symbol,
                  estimate.title,
                  estimate.note,
              ])),
    ];
}

describe('about: тексты реестра для руководителя', () => {
    it('у каждого кода блока есть userTitle и userDescription', () => {
        const missing = ABOUT_PARAM_CODES.filter(code => {
            const descriptor = findParam(code);
            return (
                !descriptor?.userTitle?.trim() ||
                !descriptor?.userDescription?.trim()
            );
        });

        expect(ABOUT_PARAM_CODES.length).toBeGreaterThan(50);
        expect(missing).toEqual([]);
    });

    it.each(ABOUT_PARAM_CODES)(
        '%s: userTitle и userDescription без формул, символов и кодов',
        code => {
            const descriptor = findParam(code);
            const texts = [descriptor?.userTitle, descriptor?.userDescription];

            for (const text of texts) {
                expect(text).toMatch(/[а-яё]/i);
                expect(text).not.toMatch(FORBIDDEN_SYMBOLS);
                expect(text).not.toMatch(FORBIDDEN_WORDS);
            }
        },
    );
});

describe('about: собранный блок — простым русским', () => {
    it.each(AI_ABOUT_ENDPOINTS)('%s', endpoint => {
        const offenders = readableTexts(endpoint).filter(
            text => FORBIDDEN_SYMBOLS.test(text) || FORBIDDEN_WORDS.test(text),
        );

        expect(offenders).toEqual([]);
    });

    it('подписи оценок модели и причины отсутствия модели — без символов', () => {
        const texts = [
            ...Object.values(AI_ABOUT_ESTIMATES).flatMap(estimate => [
                estimate.symbol,
                estimate.title,
            ]),
            ...Object.values(AI_ABOUT_MODEL_REASONS),
        ];

        for (const text of texts) {
            expect(text).not.toMatch(FORBIDDEN_SYMBOLS);
            expect(text).not.toMatch(FORBIDDEN_WORDS);
        }
    });

    it('пояснение к силе усадки называет число уточнённых шагов словами', () => {
        const model = recomputeModel();
        const payload: Partial<PortalModelPayload> = {
            ...model,
            edges: model.edges.map((edge, index) => ({
                ...edge,
                kappaSource: index === 0 ? 'kleinman' : 'default',
            })),
        };
        const about = buildAiAnalyticsAbout({
            endpoint: 'overview',
            registry: {},
            paramsVersion: 'pv-texts',
            comparableFrom: '',
            model: { id: 'ais-model-texts', payload },
        });

        expect(about.model?.kappa.note).toBe(
            `для 1 из ${model.edges.length} шагов воронки норма уточнена ` +
                'по данным портала, для остальных — стандартное значение',
        );
        expect(about.model?.kappa.source).toBe('estimated');
    });
});
