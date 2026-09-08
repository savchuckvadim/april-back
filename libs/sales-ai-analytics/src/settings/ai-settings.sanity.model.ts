/**
 * Проверки блоков «как считаем»: определения событий, гиперпараметры
 * реестра, потолки оценивания и дата подтверждения ростера (план Фазы 2,
 * §3.3). Вынесены из `ai-settings.sanity.ts` ради правила «файл ≤ 300
 * строк»; входные типы-заявки объявлены здесь же, потому что это контракт
 * проверки, а не разобранная настройка.
 *
 * Границы берутся из реестра параметров (`findParam(code).range`) —
 * литералов диапазонов в DTO быть не должно.
 */
import { CALL_REPORT_SECTION_CODES } from '@lib/portal-lib/pbx/pbx-aicall-smart/type/pbx-aicall-smart.type';
import { findParam } from '../params/registry.const';
import type { ParamPrimitive } from '../params/registry.types';
import { AI_SALES_STAGE_CODES, registryRange } from './ai-settings.defaults';
import {
    AI_FUNNEL_EDGE_CODES,
    AI_HOT_CLIENT_COLORS,
    AI_INVOICE_NESTINGS,
    AI_NORM_STRATA,
    AI_SETTINGS_LIMITS,
    type AiQualityHypothesis,
} from './ai-settings.types';

/** Итог проверки: сохранять нельзя / можно с оговоркой. */
export interface AiSanityAccumulator {
    blocking: string[];
    warnings: string[];
}

/** Заявленные определения: справочники ещё не проверены. */
export interface AiDefinitionsClaim {
    productiveCall?: string;
    presentationCanon?: string;
    confirmedOnly?: boolean;
    hotClient?: string;
    minDurationSecByType?: Readonly<Record<string, number>>;
    invoiceNesting?: string;
    callDoneIncludesSiteComeCall?: boolean;
    decisionStages?: readonly string[];
    funnelEdges?: readonly string[];
    normStratum?: string;
    hotClientColors?: readonly string[];
}

/** Заявленное правило потолка оценки. */
export interface AiScoringCapClaim {
    ruleCode: string;
    condition?: string;
    section: string;
    maxScore: number;
    flag?: string;
}

/** Заявленные потолки и стоп-фразы. */
export interface AiScoringClaim {
    caps?: readonly AiScoringCapClaim[];
    stopWords?: readonly string[];
}

/** Заявленные гиперпараметры: коды и типы ещё не сверены с реестром. */
export type AiModelParamsClaim = Readonly<Record<string, ParamPrimitive>>;

/** Значение из справочника; иначе сообщение о неизвестном коде. */
function requireOneOf(
    value: string | undefined,
    allowed: readonly string[],
    title: string,
    blocking: string[],
): void {
    if (value === undefined) return;
    if (!allowed.includes(value)) {
        blocking.push(`${title}: неизвестное значение «${value}»`);
    }
}

/** Каждый элемент списка — из справочника. */
function requireSubsetOf(
    values: readonly string[] | undefined,
    allowed: readonly string[],
    title: string,
    blocking: string[],
): void {
    if (!values) return;
    for (const value of values) {
        if (!allowed.includes(value)) {
            blocking.push(`${title}: неизвестное значение «${value}»`);
        }
    }
    if (values.length === 0) {
        blocking.push(`${title}: список не может быть пустым`);
    }
}

/** Пороги длительности: только известные типы и диапазон реестра. */
function durationSanity(
    byType: Readonly<Record<string, number>> | undefined,
    blocking: string[],
): void {
    if (!byType) return;
    const range = registryRange('min_duration_sec_by_type', [30, 600]);
    for (const [type, seconds] of Object.entries(byType)) {
        if (seconds < range[0] || seconds > range[1]) {
            blocking.push(
                `Порог длительности типа ${type} (${seconds} с) вне ` +
                    `[${range[0]}; ${range[1]}]`,
            );
        }
    }
}

/** Определения событий: справочники стадий, рёбер, слоя нормы и цветов. */
export function definitionsSanity(
    claim: AiDefinitionsClaim,
    result: AiSanityAccumulator,
): void {
    requireOneOf(
        claim.normStratum,
        AI_NORM_STRATA,
        'Слой нормы',
        result.blocking,
    );
    requireOneOf(
        claim.invoiceNesting,
        AI_INVOICE_NESTINGS,
        'Вложенность счетов',
        result.blocking,
    );
    requireSubsetOf(
        claim.funnelEdges,
        AI_FUNNEL_EDGE_CODES,
        'Ребро воронки',
        result.blocking,
    );
    requireSubsetOf(
        claim.decisionStages,
        AI_SALES_STAGE_CODES,
        'Стадия решения',
        result.blocking,
    );
    requireSubsetOf(
        claim.hotClientColors,
        AI_HOT_CLIENT_COLORS,
        'Цвет компании',
        result.blocking,
    );
    durationSanity(claim.minDurationSecByType, result.blocking);
    if (claim.normStratum === 'level') {
        result.warnings.push(
            'Нормы стратифицируются по уровню, а не по стажу: уровень ' +
                'назначает руководитель, и норма junior может стать средним слабых',
        );
    }
}

/** Гиперпараметры: код известен реестру, тип совпал, значение в диапазоне. */
export function modelParamsSanity(
    claim: AiModelParamsClaim,
    result: AiSanityAccumulator,
): void {
    for (const [code, value] of Object.entries(claim)) {
        const descriptor = findParam(code);
        if (!descriptor) {
            result.blocking.push(`Параметр ${code} не найден в реестре`);
            continue;
        }
        if (typeof value !== typeof descriptor.defaultValue) {
            result.blocking.push(
                `Параметр ${code}: ожидается ${typeof descriptor.defaultValue}, ` +
                    `получено ${typeof value}`,
            );
            continue;
        }
        const range = descriptor.range;
        if (
            typeof value === 'number' &&
            range &&
            (value < range[0] || value > range[1])
        ) {
            result.blocking.push(
                `Параметр ${code} (${value}) вне [${range[0]}; ${range[1]}]`,
            );
        }
        if (descriptor.source === 'estimated') {
            result.warnings.push(
                `Параметр ${code} оценивается из данных — ручное значение ` +
                    'будет перезаписано ночным конвейером',
            );
        }
    }
}

/** Потолки оценивания: не больше 20 правил, балл 1–9, раздел из рубрики. */
export function scoringSanity(
    claim: AiScoringClaim,
    result: AiSanityAccumulator,
): void {
    const { capsMax, capMaxScore, stopWordsMax } = AI_SETTINGS_LIMITS;
    const caps = claim.caps ?? [];
    if (caps.length > capsMax) {
        result.blocking.push(
            `Правил потолка ${caps.length} — больше ${capsMax}`,
        );
    }
    const codes = new Set<string>();
    for (const rule of caps) {
        if (rule.ruleCode.trim() === '') {
            result.blocking.push('У правила потолка пустой код');
        }
        if (codes.has(rule.ruleCode)) {
            result.blocking.push(
                `Правило потолка ${rule.ruleCode} указано дважды`,
            );
        }
        codes.add(rule.ruleCode);
        if (rule.maxScore < capMaxScore[0] || rule.maxScore > capMaxScore[1]) {
            result.blocking.push(
                `Потолок правила ${rule.ruleCode} (${rule.maxScore}) вне ` +
                    `[${capMaxScore[0]}; ${capMaxScore[1]}]`,
            );
        }
        requireOneOf(
            rule.section,
            CALL_REPORT_SECTION_CODES,
            `Раздел правила ${rule.ruleCode}`,
            result.blocking,
        );
    }
    const stopWords = claim.stopWords ?? [];
    if (stopWords.length > stopWordsMax) {
        result.blocking.push(
            `Стоп-фраз ${stopWords.length} — больше ${stopWordsMax}`,
        );
    }
}

/** Гипотеза: пар не меньше двух, объём падает с ростом качества. */
export function hypothesisSanity(
    hypothesis: AiQualityHypothesis,
    result: AiSanityAccumulator,
): void {
    const { hypothesisPairsMin, hypothesisScore } = AI_SETTINGS_LIMITS;
    if (hypothesis.pairs.length < hypothesisPairsMin) {
        result.blocking.push(
            'Гипотеза «качество → объём» требует не меньше ' +
                `${hypothesisPairsMin} пар`,
        );
    }
    for (const pair of hypothesis.pairs) {
        if (pair.s < hypothesisScore[0] || pair.s > hypothesisScore[1]) {
            result.blocking.push(
                `Качество ${pair.s} в гипотезе вне ` +
                    `[${hypothesisScore[0]}; ${hypothesisScore[1]}]`,
            );
        }
        if (!(pair.n > 0)) {
            result.blocking.push(
                `Число презентаций в гипотезе должно быть больше нуля (${pair.n})`,
            );
        }
    }
    const sorted = [...hypothesis.pairs].sort(
        (left, right) => left.s - right.s,
    );
    const growing = sorted.some(
        (pair, index) => index > 0 && pair.n > sorted[index - 1].n,
    );
    if (growing) {
        result.warnings.push(
            'В гипотезе с ростом качества растёт и число презентаций — ' +
                'проверьте пары, обычно зависимость обратная',
        );
    }
}

/** Дата подтверждения ростера: формат и «не из будущего». */
export function rosterSanity(
    confirmedAt: string,
    today: string,
    result: AiSanityAccumulator,
): void {
    if (confirmedAt === '') return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(confirmedAt)) {
        result.blocking.push(
            `Дата подтверждения ростера «${confirmedAt}» не в формате YYYY-MM-DD`,
        );
        return;
    }
    if (confirmedAt > today) {
        result.blocking.push(
            `Дата подтверждения ростера ${confirmedAt} позже сегодняшнего ` +
                `дня ${today}`,
        );
    }
}
