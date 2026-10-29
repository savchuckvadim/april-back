import type { Logger } from '@nestjs/common';
import { AgentSectionAnalysisDto } from '../dto/agent-analysis-request.dto';

/** Итог схлопывания: разделы по одному на код и сколько лишних записей ушло. */
export interface MergedSections {
    sections: AgentSectionAnalysisDto[];
    /** код раздела → число лишних записей; пусто — дублей не было. */
    duplicates: Record<string, number>;
}

const TEXT_FIELDS = ['asWas', 'weaknesses', 'analysis', 'advice'] as const;

const hasText = (value: string | undefined): value is string =>
    typeof value === 'string' && value.trim().length > 0;

/**
 * Один раздел — одна запись. Модель (особенно фокус-проход с единственным
 * разрешённым кодом) иногда присылает несколько записей одного кода:
 * «моменты» приветствия, два захода на цену — в ленте сделки появлялись три
 * «Приветствия» и две «Работы по цене» (жалоба владельца 29.10.2026).
 * Главная запись — с максимальной актуальностью (при равенстве — первая по
 * порядку): её оценка и тексты остаются, пустые текстовые поля, варианты и
 * оценка добираются из остальных. Тексты не склеиваются: поля смарта
 * ограничены размером строки элемента. Порядок — по первому появлению кода.
 */
export function mergeDuplicateSections(
    sections: readonly AgentSectionAnalysisDto[] | undefined,
): MergedSections {
    const byCode = new Map<string, AgentSectionAnalysisDto[]>();
    for (const section of sections ?? []) {
        const group = byCode.get(section.section);
        if (group) group.push(section);
        else byCode.set(section.section, [section]);
    }
    const duplicates: Record<string, number> = {};
    const merged: AgentSectionAnalysisDto[] = [];
    for (const [code, group] of byCode) {
        if (group.length > 1) duplicates[code] = group.length - 1;
        merged.push(group.length === 1 ? group[0] : mergeGroup(group));
    }
    return { sections: merged, duplicates };
}

function mergeGroup(group: AgentSectionAnalysisDto[]): AgentSectionAnalysisDto {
    const primary = group.reduce(
        (best, item) => (item.relevance > best.relevance ? item : best),
        group[0],
    );
    const others = group.filter(item => item !== primary);
    const result: AgentSectionAnalysisDto = { ...primary };
    for (const field of TEXT_FIELDS) {
        if (hasText(result[field])) continue;
        const donor = others.find(item => hasText(item[field]));
        if (donor) result[field] = donor[field];
    }
    if (!result.alternatives?.length) {
        const donor = others.find(item => item.alternatives?.length);
        if (donor?.alternatives) result.alternatives = [...donor.alternatives];
    }
    if (result.score === undefined) {
        const donor = others.find(item => item.score !== undefined);
        if (donor) result.score = donor.score;
    }
    return result;
}

/**
 * Схлопывание с предупреждением в лог — общий шаг приёма разбора
 * (prepareAgentAnalysis) и фокус-разбора; `where` — чей разбор, для лога.
 * Нет дублей — массив возвращается как есть.
 */
export function dedupeSectionsWithLog(
    sections: readonly AgentSectionAnalysisDto[] | undefined,
    where: string,
    logger: Pick<Logger, 'warn'>,
): AgentSectionAnalysisDto[] {
    const { sections: merged, duplicates } = mergeDuplicateSections(sections);
    const entries = Object.entries(duplicates);
    if (entries.length) {
        logger.warn(
            `${where}: модель прислала несколько записей одного раздела — ${entries
                .map(([code, extra]) => `${code} ×${extra + 1}`)
                .join(', ')}; оставлена запись с максимальной актуальностью`,
        );
    }
    return merged;
}
