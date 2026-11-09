import type { OwnerReportFacts } from '../owner-report.types';
import { LEAK_LABELS, SIGN_LABELS } from './owner-report.labels';
import { pctText } from './owner-report.format';
import type {
    OwnerReportAttentionItem,
    OwnerReportTone,
} from './owner-report.text.types';

/**
 * «На что обратить внимание»: до четырёх пунктов сразу под шапкой —
 * две главные утечки, провалы управления («нет») и пустая разметка
 * периода. Каждый пункт — что не так и одно действие (просьба владельца
 * 07.11.2026: «чуть цвета, бейджиков и на что обратить внимание»).
 */

export const ATTENTION_LIMIT = 4;
const LEAKS_IN_ATTENTION = 2;

/** Одно действие на провал признака управления. */
const SIGN_ACTIONS: Readonly<Record<string, string>> = {
    repeatability:
        'Разобрать с отделом три лучших показа месяца и сделать из них общий порядок показа.',
    people_dependency:
        'Передать приёмы лучшего сотрудника команде: совместные звонки и разбор его записей.',
    stage_control:
        'Требовать в конце каждого разговора следующий шаг с датой и проверять это на планёрке.',
    needs_discovery:
        'Начинать разговор с вопросов о задачах клиента; разбирать звонки, где их не выяснили.',
    upsell: 'Добавить в разговор предложение следующего продукта после основного решения.',
    base_quality:
        'Почистить базу от дублей и неверных контактов, назначить ответственного за базу.',
    objections_handling:
        'Собрать ответы на частые возражения и отработать их с менеджерами на записях.',
    plan_fact:
        'Разобрать отставание от плана по сотрудникам и договориться о недельных целях.',
};

const UNMARKED_ITEM: OwnerReportAttentionItem = {
    tone: 'neutral',
    title: 'Исходы разговоров, сбои и допродажа за этот период не размечены',
    action: 'Попросите разработчика переразобрать звонки периода — после этого отчёт покажет исходы и утечки полностью.',
};

export function buildOwnerReportAttention(
    facts: OwnerReportFacts,
): OwnerReportAttentionItem[] {
    const items: OwnerReportAttentionItem[] = [];
    if (
        facts.coverage.analyzed > 0 &&
        facts.coverage.outcomeFromAnalysis === 0
    ) {
        items.push(UNMARKED_ITEM);
    }
    for (const leak of facts.leaks.slice(0, LEAKS_IN_ATTENTION)) {
        const label = LEAK_LABELS[leak.code];
        items.push({
            tone: 'bad',
            title: `${label.title}: ${leak.scale.successes} из ${leak.scale.n} (${pctText(leak.scale.pct)})`,
            action: label.action,
        });
    }
    for (const sign of facts.management.signs) {
        const label = SIGN_LABELS[sign.code];
        const action = SIGN_ACTIONS[sign.code];
        if (sign.verdict !== 'no' || !label || !action) continue;
        items.push({
            tone: 'warn',
            title: `${label.title}: ${label.no}`,
            action,
        });
    }
    return items.slice(0, ATTENTION_LIMIT);
}

/** Цвет доли по порогам: выше — лучше или выше — хуже. */
export function ownerReportToneOf(
    pct: number | null,
    thresholds: { good: number; bad: number },
): OwnerReportTone {
    if (pct === null) return 'neutral';
    const higherBetter = thresholds.good > thresholds.bad;
    if (higherBetter) {
        if (pct >= thresholds.good) return 'good';
        return pct <= thresholds.bad ? 'bad' : 'warn';
    }
    if (pct <= thresholds.good) return 'good';
    return pct >= thresholds.bad ? 'bad' : 'warn';
}

/** Пороги плиток шапки: где доля «хорошая», где «плохая». */
export const OWNER_REPORT_TILE_THRESHOLDS: Readonly<
    Record<string, { good: number; bad: number }>
> = {
    no_contact: { good: 15, bad: 35 },
    cold_advanced: { good: 25, bad: 10 },
    followup_no_decision: { good: 40, bad: 65 },
    postponed_with_date: { good: 60, bad: 30 },
};
