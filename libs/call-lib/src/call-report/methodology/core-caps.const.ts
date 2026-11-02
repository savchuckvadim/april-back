import type { MethodologyCap } from './methodology.types';

/**
 * Ограничители оценки ЯДРА — действуют на всех порталах независимо от
 * методики (решение владельца 01.11.2026: ограничители сразу влияют на
 * оценку). Это ограничители общего смысла из каталога
 * ai/tasks/ai-polyansky-method/2026-10-27-methodology-materials.md, раздел 5
 * (класс «общий»); ограничители конкретной методики — в её конфиге.
 *
 * Условия считаются кодом по фактам разбора (`MethodologyFacts`):
 * неизвестный факт условие не включает, поэтому на портале без спиралей
 * ограничители по спиралям молчат.
 */
export const CORE_CAPS: readonly MethodologyCap[] = [
    {
        code: 'core.presentation_without_needs',
        title: 'презентация без выявленных потребностей',
        when: [
            { op: 'is', field: 'needsFound', value: false },
            { op: 'is', field: 'presentationDone', value: true },
        ],
        target: 'PRESENTATION',
        max: 6,
    },
    {
        code: 'core.presentation_without_need_link',
        title: 'показ не связан с задачами клиента',
        when: [{ op: 'gt', field: 'spiralsWithoutNeed', value: 0 }],
        target: 'PRESENTATION',
        max: 5,
    },
    {
        code: 'core.presentation_monologue',
        title: 'показ монологом: клиент почти не говорил',
        when: [
            { op: 'is', field: 'presentationDone', value: true },
            { op: 'above_norm', field: 'talkRatioPct' },
        ],
        target: 'PRESENTATION',
        max: 6,
    },
    {
        code: 'core.no_action_offered',
        title: 'не предложен счёт, КП, договор, демо или показ для руководителя',
        when: [{ op: 'is', field: 'hvostDecisionWay', value: false }],
        target: 'CLOSING',
        max: 6,
    },
    {
        code: 'core.decision_process_unknown',
        title: 'не выяснены процесс решения и кто решает',
        when: [{ op: 'is', field: 'hvostDecisionProcess', value: false }],
        target: 'CLOSING',
        max: 7,
    },
    {
        code: 'core.next_step_incomplete',
        title: 'у следующего контакта нет даты, времени или цели',
        when: [
            { op: 'is', field: 'nextStepSet', value: true },
            { op: 'is', field: 'nextStepComplete', value: false },
        ],
        target: 'CLOSING',
        max: 7,
    },
    {
        code: 'core.info_promise_without_date',
        title: 'финал «отправлю информацию» без даты следующего контакта',
        when: [
            { op: 'is', field: 'nextStepSet', value: true },
            { op: 'empty', field: 'nextStepDate' },
        ],
        target: 'CLOSING',
        max: 5,
    },
];
