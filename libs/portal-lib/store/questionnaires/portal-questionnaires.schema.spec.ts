import { EVENT_TYPE_REGISTRY } from '@lib/portal-lib/pbx/event-type-registry';
import {
    EnumQuestionnaireConditionKind,
    isQuestionnaireDisabledByEventTypes,
    isQuestionnaireReachableForSmartKind,
    isQuestionnaireValuelessCondition,
    parseQuestionnaireDisabledEventTypes,
    QUESTIONNAIRE_PLAN_TYPE_VALUES,
    QUESTIONNAIRE_REPORT_TYPE_VALUES,
    QuestionnaireConditionLike,
} from './portal-questionnaires.schema';

/**
 * Реестр каталога анкет в той части, где он ПРОИЗВОДНЫЙ.
 *
 * Два справочника типов события и выключатель анкет считаются из одного
 * EVENT_TYPE_REGISTRY. Пока они выводились руками, списки уже разошлись с
 * фреймом; спека держит их сведёнными — и заодно фиксирует правила, по
 * которым анкета признаётся достижимой для смарта и погашенной
 * выключателем: их одинаково исполняют фрейм и бэк, и разъехаться им
 * нельзя.
 */

const cond = (
    kind: EnumQuestionnaireConditionKind,
    values: string[] = [],
): QuestionnaireConditionLike => ({ kind, values });

describe('справочники типов события выводятся из реестра', () => {
    it('типы отчётного события — реестр целиком, в его порядке', () => {
        expect(QUESTIONNAIRE_REPORT_TYPE_VALUES).toEqual(
            EVENT_TYPE_REGISTRY.map(({ code, name }) => ({ code, name })),
        );
    });

    it('типы планируемого события — только планируемые', () => {
        expect(QUESTIONNAIRE_PLAN_TYPE_VALUES.map(item => item.code)).toEqual(
            EVENT_TYPE_REGISTRY.filter(item => item.isPlannable).map(
                item => item.code,
            ),
        );
    });

    it('план — подмножество отчёта: подписи не расходятся', () => {
        const report = new Map(
            QUESTIONNAIRE_REPORT_TYPE_VALUES.map(item => [
                item.code,
                item.name,
            ]),
        );
        for (const item of QUESTIONNAIRE_PLAN_TYPE_VALUES) {
            expect(`${item.code}=${item.name}`).toBe(
                `${item.code}=${report.get(item.code) ?? 'нет в отчёте'}`,
            );
        }
    });
});

describe('условия без значений', () => {
    it('«Всегда» и «Презентация проведена» значений не принимают', () => {
        expect(
            isQuestionnaireValuelessCondition(
                EnumQuestionnaireConditionKind.always,
            ),
        ).toBe(true);
        expect(
            isQuestionnaireValuelessCondition(
                EnumQuestionnaireConditionKind.presentationDone,
            ),
        ).toBe(true);
    });

    it('условия по типу события значения требуют', () => {
        expect(
            isQuestionnaireValuelessCondition(
                EnumQuestionnaireConditionKind.reportType,
            ),
        ).toBe(false);
    });
});

describe('достижимость анкеты для смарта', () => {
    it('условие по типу события со смартом — достижима', () => {
        expect(
            isQuestionnaireReachableForSmartKind(
                [
                    cond(EnumQuestionnaireConditionKind.reportType, [
                        'presentation',
                    ]),
                ],
                'presentation',
            ),
        ).toBe(true);
        expect(
            isQuestionnaireReachableForSmartKind(
                [cond(EnumQuestionnaireConditionKind.planType, ['hot'])],
                'zpr',
            ),
        ).toBe(true);
    });

    it('«Презентация проведена» достижима для презентаций и только для них', () => {
        const conditions = [
            cond(EnumQuestionnaireConditionKind.presentationDone),
        ];
        expect(
            isQuestionnaireReachableForSmartKind(conditions, 'presentation'),
        ).toBe(true);
        expect(isQuestionnaireReachableForSmartKind(conditions, 'zpr')).toBe(
            false,
        );
    });

    it('чужой тип события — недостижима: элемент не создаётся', () => {
        expect(
            isQuestionnaireReachableForSmartKind(
                [cond(EnumQuestionnaireConditionKind.reportType, ['hot'])],
                'presentation',
            ),
        ).toBe(false);
    });

    it('без условия по типу события — недостижима', () => {
        expect(
            isQuestionnaireReachableForSmartKind(
                [
                    cond(EnumQuestionnaireConditionKind.always),
                    cond(EnumQuestionnaireConditionKind.workStatus, [
                        'success',
                    ]),
                ],
                'presentation',
            ),
        ).toBe(false);
    });

    it('смарт без типа события недостижим ни при каких условиях', () => {
        expect(
            isQuestionnaireReachableForSmartKind(
                [cond(EnumQuestionnaireConditionKind.reportType, ['warm'])],
                'skap',
            ),
        ).toBe(false);
    });
});

describe('выключатель анкет по типам события', () => {
    it('CSV разбирается, мусор и чужие коды выбрасываются', () => {
        expect(
            parseQuestionnaireDisabledEventTypes(
                ' presentation , hot ,cold, ,presentation',
            ),
        ).toEqual(['presentation', 'hot']);
        expect(parseQuestionnaireDisabledEventTypes('')).toEqual([]);
        expect(parseQuestionnaireDisabledEventTypes(null)).toEqual([]);
    });

    it('гасит анкету, чей тип события выключен', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [
                    cond(EnumQuestionnaireConditionKind.reportType, [
                        'presentation',
                    ]),
                ],
                ['presentation'],
            ),
        ).toBe(true);
    });

    it('гасит анкету «Презентация проведена» вместе с презентацией', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [cond(EnumQuestionnaireConditionKind.presentationDone)],
                ['presentation'],
            ),
        ).toBe(true);
    });

    it('не гасит, пока у условия остался хоть один включённый тип', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [
                    cond(EnumQuestionnaireConditionKind.reportType, [
                        'presentation',
                        'warm',
                    ]),
                ],
                ['presentation'],
            ),
        ).toBe(false);
    });

    it('гасит по ЛЮБОМУ выключенному шлагбауму: условия объединяются по И', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [
                    cond(EnumQuestionnaireConditionKind.planType, ['hot']),
                    cond(EnumQuestionnaireConditionKind.reportType, [
                        'presentation',
                        'warm',
                    ]),
                ],
                ['hot'],
            ),
        ).toBe(true);
    });

    it('анкету без условий по типу события выключатель не трогает', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [cond(EnumQuestionnaireConditionKind.workStatus, ['success'])],
                ['presentation', 'hot'],
            ),
        ).toBe(false);
    });

    it('пустой выключатель не гасит ничего', () => {
        expect(
            isQuestionnaireDisabledByEventTypes(
                [
                    cond(EnumQuestionnaireConditionKind.reportType, [
                        'presentation',
                    ]),
                ],
                [],
            ),
        ).toBe(false);
    });
});
