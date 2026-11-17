import { Logger } from '@nestjs/common';
import {
    normalizeFiveKAnalysisText,
    normalizeHvostAnalysisText,
} from '@lib/call-lib/call-report/checklist-text';
import {
    AgentCallAnalysisDto,
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

/**
 * Тексты разборов «Хвоста» и «5К» читаемыми строками (17.11.2026): модель
 * иногда кладёт в текстовое поле запись словаря ({'client': '…;', …}), и она
 * уходила в карточку, ленту и на страницу звонка как есть. Запись становится
 * строками «Клиент: …» по блокам анкеты, обычный текст не меняется.
 */
export function tidyChecklistTexts(
    dto: AgentCallAnalysisDto,
    logger: Logger,
): AgentCallAnalysisDto {
    // Значение типизировано строкой, но ответ модели мог прийти объектом:
    // проверяем то, что пришло на самом деле.
    const tidy = (
        value: unknown,
        normalize: (raw: unknown) => string | null,
        label: string,
    ): string | null | undefined => {
        if (value === null || value === undefined) return value;
        const text = normalize(value);
        const before = typeof value === 'string' ? value.trim() : null;
        if (text !== before) {
            logger.log(`Разбор ${label}: запись словаря переведена в строки`);
        }
        return text;
    };
    const fixed = { ...dto };
    if (fixed.hvostAnalysis !== undefined) {
        fixed.hvostAnalysis = tidy(
            fixed.hvostAnalysis,
            normalizeHvostAnalysisText,
            'хвоста',
        );
    }
    if (fixed.fiveKAnalysis !== undefined) {
        fixed.fiveKAnalysis = tidy(
            fixed.fiveKAnalysis,
            normalizeFiveKAnalysisText,
            '5К',
        );
    }
    return fixed;
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
