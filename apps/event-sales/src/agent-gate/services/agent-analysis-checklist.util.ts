import {
    AgentFiveKItemsDto,
    AgentHvostStepsDto,
} from '../dto/agent-analysis-request.dto';

/**
 * Пункты чек-листов «Хвост» и «5К» одной строкой на пункт — общий текст для
 * достройки разбора кодом и для записей таймлайна (одна шкала с анкетой).
 */

/** Отметка пункта: ✓ / ✗ / — (null или нет ответа). */
export function checklistMark(value: boolean | null | undefined): string {
    return value === true ? '✓' : value === false ? '✗' : '—';
}

/** В чеклисте есть хотя бы один boolean-ответ (не пусто и не «все null»). */
export function hasChecklistAnswer(items: object | null | undefined): boolean {
    return (
        Boolean(items) &&
        Object.values(items as object).some(value => typeof value === 'boolean')
    );
}

/** Пять пунктов «хвоста» в порядке анкеты менеджера. */
export function hvostChecklistLines(
    steps: AgentHvostStepsDto | null | undefined,
): string[] {
    return [
        `${checklistMark(steps?.desire)} ЖЕЛАНИЕ РАБОТАТЬ С ГАРАНТОМ`,
        `${checklistMark(steps?.offered)} ЧТО ПРЕДЛОЖИЛИ`,
        `${checklistMark(steps?.priceReaction)} РЕАКЦИЯ НА ЦЕНУ`,
        `${checklistMark(steps?.decisionProcess)} ПРОЦЕСС ПРИНЯТИЯ РЕШЕНИЯ`,
        `${checklistMark(steps?.decisionWay)} ВЫХОД НА РЕШЕНИЕ`,
    ];
}

/** Пять пунктов «5К» в порядке анкеты менеджера. */
export function fiveKChecklistLines(
    items: AgentFiveKItemsDto | null | undefined,
): string[] {
    return [
        `${checklistMark(items?.client)} КЛИЕНТ`,
        `${checklistMark(items?.company)} КОМПАНИЯ`,
        `${checklistMark(items?.colleagues)} КОЛЛЕГИ`,
        `${checklistMark(items?.competitor)} КОНКУРЕНТ`,
        `${checklistMark(items?.criteria)} КРИТЕРИИ ВЫБОРА`,
    ];
}
