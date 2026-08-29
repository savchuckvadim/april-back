import {
    EnumQuestionnaireChannel,
    EnumQuestionnaireConditionKind,
    EnumQuestionnaireControl,
    EnumQuestionnairePersist,
    EnumQuestionnairePresentation,
    EnumQuestionnairePurpose,
    EnumQuestionnaireTargetMode,
    QuestionnaireCatalog,
    QuestionnaireCatalogEntry,
    QuestionnaireCatalogItem,
} from '@lib/portal-lib/store/questionnaires';
import {
    buildQuestionnaireSmartAnswers,
    findLostQuestionnaireAnswers,
} from '../build-questionnaire-smart-answers';

/**
 * Снимок ответов для элемента смарта: источник правды — КАТАЛОГ, а не
 * payload фрейма. Всё, чего нет в каталоге, чужого смарта, погашенной
 * анкеты или пустое — в элемент не едет.
 */
const item = (over?: Partial<QuestionnaireCatalogItem>) =>
    ({
        code: 'decision',
        title: 'Кто решает',
        placeholder: null,
        hint: null,
        groupTitle: null,
        sort: 100,
        control: EnumQuestionnaireControl.string,
        isRequired: false,
        requireChange: false,
        staleAfterDays: null,
        channel: EnumQuestionnaireChannel.smart,
        dtoPath: null,
        target: { mode: EnumQuestionnaireTargetMode.entity, entity: null },
        smart: { kind: 'presentation', entityTypeId: 1040 },
        isNative: false,
        field: { name: 'UF_CRM_8_Q_DECISION', type: 'string' },
        options: [],
        ...over,
    }) as QuestionnaireCatalogItem;

const entry = (over?: Partial<QuestionnaireCatalogEntry>) =>
    ({
        code: 'q_pres',
        title: 'Анкета презентации',
        hint: null,
        purpose: EnumQuestionnairePurpose.report,
        presentation: EnumQuestionnairePresentation.inline,
        place: null,
        persist: EnumQuestionnairePersist.onChange,
        conditions: [
            {
                kind: EnumQuestionnaireConditionKind.reportType,
                values: ['presentation'],
            },
        ],
        configKey: null,
        legacyChecklistId: null,
        sort: 100,
        version: 1,
        items: [item()],
        ...over,
    }) as QuestionnaireCatalogEntry;

const catalog = (
    entries: QuestionnaireCatalogEntry[],
): QuestionnaireCatalog => ({
    contract: 1,
    version: 1,
    hash: 'hash',
    questionnaires: entries,
});

const build = (over?: {
    entries?: QuestionnaireCatalogEntry[];
    answers?: Array<{ questionnaire: string; item: string; value: string }>;
    smartKind?: string;
    disabledEventTypes?: string[];
}) =>
    buildQuestionnaireSmartAnswers({
        catalog: catalog(over?.entries ?? [entry()]),
        answers: over?.answers ?? [
            { questionnaire: 'q_pres', item: 'decision', value: 'Директор' },
        ],
        smartKind: over?.smartKind ?? 'presentation',
        disabledEventTypes: over?.disabledEventTypes ?? [],
    });

describe('buildQuestionnaireSmartAnswers', () => {
    it('ответ получает адрес поля, тип и назначение из каталога', () => {
        const answers = build();

        expect(answers).toEqual([
            {
                key: 'q_pres:decision',
                purpose: 'report',
                fieldName: 'UF_CRM_8_Q_DECISION',
                fieldType: 'string',
                control: EnumQuestionnaireControl.string,
                value: 'Директор',
                title: 'Кто решает',
                optionTitle: null,
            },
        ]);
    });

    it('назначение анкеты «план» даёт ответ планового элемента', () => {
        const answers = build({
            entries: [entry({ purpose: EnumQuestionnairePurpose.plan })],
        });

        expect(answers[0].purpose).toBe('plan');
    });

    it('вариант списка везёт КОД, а подпись — только для лога', () => {
        const answers = build({
            entries: [
                entry({
                    items: [
                        item({
                            control: EnumQuestionnaireControl.enumeration,
                            field: {
                                name: 'UF_CRM_8_Q_SOURCE',
                                type: 'enumeration',
                            },
                            options: [
                                { code: 'site', title: 'Сайт', bitrixId: null },
                                {
                                    code: 'ads',
                                    title: 'Реклама',
                                    bitrixId: null,
                                },
                            ],
                        }),
                    ],
                }),
            ],
            answers: [
                { questionnaire: 'q_pres', item: 'decision', value: 'ads' },
            ],
        });

        expect(answers[0].value).toBe('ads');
        expect(answers[0].optionTitle).toBe('Реклама');
    });

    it('вопрос ЧУЖОГО смарта в снимок не попадает', () => {
        const answers = build({ smartKind: 'zpr' });
        expect(answers).toEqual([]);
    });

    it('вопрос не смарт-канала в снимок не попадает', () => {
        const answers = build({
            entries: [
                entry({
                    items: [item({ channel: EnumQuestionnaireChannel.crm })],
                }),
            ],
        });

        expect(answers).toEqual([]);
    });

    it('неизвестный код вопроса отбрасывается молча (payload — данные)', () => {
        const answers = build({
            answers: [
                { questionnaire: 'q_pres', item: 'stolen', value: 'x' },
                { questionnaire: 'unknown', item: 'decision', value: 'x' },
            ],
        });

        expect(answers).toEqual([]);
    });

    it('пустой ответ не едет: он затёр бы чужое значение пустотой', () => {
        const answers = build({
            answers: [
                { questionnaire: 'q_pres', item: 'decision', value: '   ' },
            ],
        });

        expect(answers).toEqual([]);
    });

    it('выключатель типа события гасит анкету целиком', () => {
        const answers = build({ disabledEventTypes: ['presentation'] });
        expect(answers).toEqual([]);
    });

    it('выключатель другого типа события анкету не трогает', () => {
        const answers = build({ disabledEventTypes: ['hot'] });
        expect(answers).toHaveLength(1);
    });

    it('дубль ключа в payload: ответом остаётся первый', () => {
        const answers = build({
            answers: [
                { questionnaire: 'q_pres', item: 'decision', value: 'Первый' },
                { questionnaire: 'q_pres', item: 'decision', value: 'Второй' },
            ],
        });

        expect(answers).toHaveLength(1);
        expect(answers[0].value).toBe('Первый');
    });

    it('ответов нет — каталог не обходится вовсе', () => {
        expect(build({ answers: [] })).toEqual([]);
    });
});

/**
 * Разбор потерь: ответ отбросил САМ снимок, и раньше об этом не было ни
 * строки лога — «куда делся ответ» расследовать было нечем.
 *
 * Считается один раз на отчёт, а не на каждый смарт: «вопрос чужого
 * смарта» здесь потерей не считается (его несёт соседний поток), иначе
 * половина строк лога была бы ложной.
 */
const lost = (over?: {
    entries?: QuestionnaireCatalogEntry[];
    answers?: Array<{ questionnaire: string; item: string; value: string }>;
    disabledEventTypes?: string[];
}) =>
    findLostQuestionnaireAnswers({
        catalog: catalog(over?.entries ?? [entry()]),
        answers: over?.answers ?? [
            { questionnaire: 'q_pres', item: 'decision', value: 'Директор' },
        ],
        disabledEventTypes: over?.disabledEventTypes ?? [],
    });

describe('findLostQuestionnaireAnswers', () => {
    it('ответ, который поток унесёт, потерей не считается', () => {
        expect(lost()).toEqual([]);
    });

    it('неизвестный код вопроса назван ключом и причиной', () => {
        const losses = lost({
            answers: [
                { questionnaire: 'q_pres', item: 'stolen', value: 'x' },
                { questionnaire: 'unknown', item: 'decision', value: 'y' },
            ],
        });

        expect(losses.map(loss => loss.key)).toEqual([
            'q_pres:stolen',
            'unknown:decision',
        ]);
        expect(losses[0].reason).toContain('в каталоге портала нет');
    });

    it('вопрос ЧУЖОГО смарта потерей не считается — его несёт соседний поток', () => {
        const losses = lost({
            entries: [
                entry({
                    items: [
                        item({ smart: { kind: 'zpr', entityTypeId: 1038 } }),
                    ],
                }),
            ],
        });

        expect(losses).toEqual([]);
    });

    it('погашенная выключателем анкета названа своим заголовком', () => {
        const losses = lost({ disabledEventTypes: ['presentation'] });

        expect(losses).toHaveLength(1);
        expect(losses[0].key).toBe('q_pres:decision');
        expect(losses[0].title).toBe('Кто решает');
        expect(losses[0].reason).toContain('Анкета презентации');
        expect(losses[0].reason).toContain('выключена типом события');
    });

    it('вопрос не смарт-канала: фрейм прислал его по ошибке', () => {
        const losses = lost({
            entries: [
                entry({
                    items: [item({ channel: EnumQuestionnaireChannel.crm })],
                }),
            ],
        });

        expect(losses[0].reason).toContain('в элемент смарта такие не пишутся');
    });

    it('вопрос без имени поля: каталог собран неполно', () => {
        const losses = lost({
            entries: [entry({ items: [item({ field: null })] })],
        });

        expect(losses[0].reason).toContain('нет имени поля');
    });

    it('дубль ключа: сказано, что записан первый ответ', () => {
        const losses = lost({
            answers: [
                { questionnaire: 'q_pres', item: 'decision', value: 'Первый' },
                { questionnaire: 'q_pres', item: 'decision', value: 'Второй' },
            ],
        });

        expect(losses).toHaveLength(1);
        expect(losses[0].reason).toContain('записан первый ответ');
    });

    it('про один ключ говорим один раз, сколько бы строк ни прислал фрейм', () => {
        const losses = lost({
            answers: [
                { questionnaire: 'unknown', item: 'decision', value: 'x' },
                { questionnaire: 'unknown', item: 'decision', value: 'y' },
                { questionnaire: 'unknown', item: 'decision', value: 'z' },
            ],
        });

        expect(losses).toHaveLength(1);
    });

    it('пустой ответ не теряется — его просто нет', () => {
        const losses = lost({
            answers: [
                { questionnaire: 'q_pres', item: 'decision', value: '   ' },
            ],
        });

        expect(losses).toEqual([]);
    });

    it('ответов нет — разбирать нечего', () => {
        expect(lost({ answers: [] })).toEqual([]);
    });
});
