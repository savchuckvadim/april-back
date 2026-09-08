/**
 * Проверка здравого смысла настроек портала (план Фазы 2, §3.3
 * «Валидация — блокирующая при сохранении»).
 *
 * Две категории: `blocking` — сохранять нельзя (ручка отвечает 400),
 * `warnings` — сохранить можно, но руководителю показывается предупреждение.
 * Диапазоны берутся **из реестра параметров** и `AI_SETTINGS_LIMITS`, а не
 * дублируются литералами в DTO: иначе форма и модель разъехались бы молча.
 *
 * Чистые функции: без DI, Bitrix и Prisma; «сегодня» приходит параметром.
 */
import { shiftDate } from '../model/workdays.util';
import {
    AI_SETTINGS_LIMITS,
    type AiAbsence,
    type AiAbsencesByManager,
    type AiManagerLevelSetting,
    type AiManagerParamsByManager,
    type AiPortalEvent,
    type AiQualityHypothesis,
    type AiTargets,
} from './ai-settings.types';
import {
    definitionsSanity,
    hypothesisSanity,
    modelParamsSanity,
    rosterSanity,
    scoringSanity,
    type AiDefinitionsClaim,
    type AiModelParamsClaim,
    type AiSanityAccumulator,
    type AiScoringClaim,
} from './ai-settings.sanity.model';

export type {
    AiDefinitionsClaim,
    AiModelParamsClaim,
    AiSanityAccumulator,
    AiScoringCapClaim,
    AiScoringClaim,
} from './ai-settings.sanity.model';

/**
 * Заявленные настройки: значения пришли из формы и ещё не проверены на
 * диапазоны и справочники. Отсутствующий блок означает «не меняли».
 */
export interface AiSettingsClaim {
    levels?: readonly AiManagerLevelSetting[];
    targets?: AiTargets;
    absences?: AiAbsencesByManager;
    managerParams?: AiManagerParamsByManager;
    definitions?: AiDefinitionsClaim;
    events?: readonly AiPortalEvent[];
    scoring?: AiScoringClaim;
    hypothesis?: AiQualityHypothesis | null;
    modelParams?: AiModelParamsClaim;
    rosterConfirmedAt?: string;
}

export interface AiSettingsSanityInput {
    claim: AiSettingsClaim;
    /** Сегодня в TZ портала, YYYY-MM-DD. */
    today: string;
    /** Bitrix-id менеджеров периметра; пусто — состав не проверяется. */
    knownManagerIds?: readonly string[];
}

/** Итог проверки: `blocking` — 400, `warnings` — сохранить с оговоркой. */
export type AiSettingsSanityResult = AiSanityAccumulator;

/** Уровни: без дублей и без стажа из будущего. */
function levelsSanity(
    levels: readonly AiManagerLevelSetting[],
    today: string,
    blocking: string[],
): void {
    const seen = new Set<number>();
    for (const level of levels) {
        if (seen.has(level.managerId)) {
            blocking.push(`Менеджер ${level.managerId} указан дважды`);
        }
        seen.add(level.managerId);
        if (level.since !== null && level.since > today) {
            blocking.push(
                `since менеджера ${level.managerId} (${level.since}) ` +
                    `позже сегодняшнего дня ${today}`,
            );
        }
    }
    if (levels.length > AI_SETTINGS_LIMITS.levelsMax) {
        blocking.push(
            `Уровней больше ${AI_SETTINGS_LIMITS.levelsMax} — список не сохранён`,
        );
    }
}

/** Отсутствия одного менеджера: from ≤ to, без пересечений, в горизонте. */
function absencesOfManager(
    managerId: string,
    absences: readonly AiAbsence[],
    today: string,
    blocking: string[],
): void {
    const horizon = shiftDate(today, AI_SETTINGS_LIMITS.absenceHorizonDays);
    const sorted = [...absences].sort((left, right) =>
        left.from.localeCompare(right.from),
    );
    let previousTo = '';
    for (const absence of sorted) {
        if (absence.from > absence.to) {
            blocking.push(
                `Отсутствие менеджера ${managerId}: начало ${absence.from} ` +
                    `позже конца ${absence.to}`,
            );
        }
        if (absence.from <= previousTo) {
            blocking.push(
                `Отсутствия менеджера ${managerId} пересекаются на ${absence.from}`,
            );
        }
        if (absence.to > horizon) {
            blocking.push(
                `Отсутствие менеджера ${managerId} заканчивается ${absence.to} — ` +
                    `дальше горизонта ${horizon}`,
            );
        }
        previousTo = absence.to > previousTo ? absence.to : previousTo;
    }
}

/** Цели: продажи и минимумы в границах, переопределения — тоже. */
function targetsSanity(targets: AiTargets, blocking: string[]): void {
    const { targetSales, presentationsMin, coldPerDay } = AI_SETTINGS_LIMITS;
    const outside = (
        value: number,
        range: readonly [number, number],
    ): boolean => value < range[0] || value > range[1];
    for (const [level, target] of Object.entries(targets.byLevel)) {
        if (target.sales !== null && outside(target.sales, targetSales)) {
            blocking.push(
                `Цель продаж уровня ${level} (${target.sales}) вне ` +
                    `[${targetSales[0]}; ${targetSales[1]}]`,
            );
        }
        if (outside(target.presentationsMin, presentationsMin)) {
            blocking.push(
                `Минимум презентаций уровня ${level} вне ` +
                    `[${presentationsMin[0]}; ${presentationsMin[1]}]`,
            );
        }
        if (outside(target.coldPerDay, coldPerDay)) {
            blocking.push(
                `Холодных в день у уровня ${level} вне ` +
                    `[${coldPerDay[0]}; ${coldPerDay[1]}]`,
            );
        }
    }
    for (const [managerId, value] of Object.entries(targets.overrides)) {
        if (value !== null && outside(value, targetSales)) {
            blocking.push(
                `Личная цель менеджера ${managerId} (${value}) вне ` +
                    `[${targetSales[0]}; ${targetSales[1]}]`,
            );
        }
    }
}

/** Слои менеджеров: ставка и личная цель в границах, отсутствия корректны. */
function managerParamsSanity(
    params: AiManagerParamsByManager,
    today: string,
    result: AiSettingsSanityResult,
): void {
    const { fteShare, targetSales } = AI_SETTINGS_LIMITS;
    for (const [managerId, item] of Object.entries(params)) {
        if (
            item.fteShare !== undefined &&
            (item.fteShare < fteShare[0] || item.fteShare > fteShare[1])
        ) {
            result.blocking.push(
                `Ставка менеджера ${managerId} (${item.fteShare}) вне ` +
                    `[${fteShare[0]}; ${fteShare[1]}]`,
            );
        }
        if (
            item.targetOverride !== undefined &&
            item.targetOverride !== null &&
            (item.targetOverride < targetSales[0] ||
                item.targetOverride > targetSales[1])
        ) {
            result.blocking.push(
                `Личная цель менеджера ${managerId} вне ` +
                    `[${targetSales[0]}; ${targetSales[1]}]`,
            );
        }
        if (item.absences) {
            absencesOfManager(managerId, item.absences, today, result.blocking);
        }
        if (item.excludeFromNorms) {
            result.warnings.push(
                `Менеджер ${managerId} исключён из норм отдела — его строки ` +
                    `не участвуют в оценке нормы полосы`,
            );
        }
    }
}

/** События: даты из будущего — предупреждение, журнал не режется. */
function eventsSanity(
    events: readonly AiPortalEvent[],
    today: string,
    result: AiSettingsSanityResult,
): void {
    if (events.length > AI_SETTINGS_LIMITS.eventsMax) {
        result.blocking.push(
            `Событий больше ${AI_SETTINGS_LIMITS.eventsMax} — журнал не сохранён`,
        );
    }
    if (events.some(event => event.date > today)) {
        result.warnings.push(
            'В журнале есть события с датой в будущем — тренды до них не рвутся',
        );
    }
}

/**
 * Полная проверка заявленных настроек. Не бросает исключений: решение
 * «400 или сохранять» принимает use-case, а сообщения уезжают
 * руководителю как есть.
 */
export function settingsSanity(
    input: AiSettingsSanityInput,
): AiSettingsSanityResult {
    const result: AiSettingsSanityResult = { blocking: [], warnings: [] };
    const { claim, today, knownManagerIds } = input;
    if (claim.levels) levelsSanity(claim.levels, today, result.blocking);
    if (claim.targets) targetsSanity(claim.targets, result.blocking);
    if (claim.absences) {
        for (const [managerId, absences] of Object.entries(claim.absences)) {
            absencesOfManager(managerId, absences, today, result.blocking);
        }
    }
    if (claim.managerParams) {
        managerParamsSanity(claim.managerParams, today, result);
    }
    if (claim.definitions) definitionsSanity(claim.definitions, result);
    if (claim.modelParams) modelParamsSanity(claim.modelParams, result);
    if (claim.scoring) scoringSanity(claim.scoring, result);
    if (claim.hypothesis) hypothesisSanity(claim.hypothesis, result);
    if (claim.events) eventsSanity(claim.events, today, result);
    if (claim.rosterConfirmedAt !== undefined) {
        rosterSanity(claim.rosterConfirmedAt, today, result);
    }
    if (claim.levels && knownManagerIds && knownManagerIds.length > 0) {
        const covered = new Set(
            claim.levels.map(level => String(level.managerId)),
        );
        const missing = knownManagerIds.filter(id => !covered.has(id));
        if (missing.length > 0) {
            result.warnings.push(
                `Уровень не задан менеджерам: ${missing.join(', ')} — ` +
                    'для них он подсказывается по стажу',
            );
        }
    }
    return result;
}
