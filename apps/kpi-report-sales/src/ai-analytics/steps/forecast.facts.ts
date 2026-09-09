/**
 * Факты дневного прогноза, не зависящие от DI (план Фазы 2, поток 16a):
 * рабочие дни месяца по календарю портала и вход прогноза по одному
 * менеджеру.
 *
 * Отделено от `forecast.step.ts` по образцу `sanity.facts.ts`: шаг
 * оркеструет и пишет снапшоты, разбор и раскладка — здесь, каждый файл в
 * пределах 300 строк.
 *
 * Чистые функции: без DI, Bitrix и Prisma, без `new Date()` внутри.
 */
import {
    enumerateWorkdays,
    type PipelineEpisode,
} from '@lib/sales-ai-analytics';
import type { AiTargets } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { monthBounds } from '../constants/ai-manager-snapshot.const';
import type { ForecastManagerInput } from '../domain/assembler/forecast.types';
import type {
    PortalManagerMonth,
    PortalModelPayload,
} from '../domain/assembler/portal-model.types';
import type { AiPipelineStepContext } from './step.types';

/** Рабочие дни месяца: всего, прошло и осталось (включая сегодня). */
export function workdaysOf(ctx: AiPipelineStepContext): {
    total: number;
    elapsed: number;
    left: number;
} {
    const bounds = monthBounds(ctx.monthKey);
    const days = enumerateWorkdays(bounds.from, bounds.to, ctx.calendar);
    const elapsed = days.filter(day => day < ctx.day).length;

    return {
        total: days.length,
        elapsed,
        left: days.filter(day => day >= ctx.day).length,
    };
}

/** Что нужно знать о менеджере, чтобы собрать его прогноз дня. */
export interface ManagerInputOptions {
    readonly managerId: string;
    readonly months: readonly PortalManagerMonth[];
    readonly monthKey: string;
    readonly previousMonth: string;
    readonly openEpisodes: readonly PipelineEpisode[];
    readonly model: PortalModelPayload;
    /** Цели портала: уровень и личные переопределения. */
    readonly targets: AiTargets;
}

/** Цель уровня из настроек портала; уровня нет — цели нет. */
function levelTargetOf(
    targets: AiTargets,
    level: string | null,
): number | null {
    if (level === null) return null;
    const byLevel = targets.byLevel as Record<
        string,
        { sales: number | null } | undefined
    >;

    return byLevel[level]?.sales ?? null;
}

/** Вход прогноза по менеджеру: месяц, прошлый месяц и нормы модели. */
export function managerInput(
    options: ManagerInputOptions,
): ForecastManagerInput {
    const own = options.months.filter(
        month => month.managerId === options.managerId,
    );
    const current = own.find(month => month.monthKey === options.monthKey);
    const previous = own.find(
        month => month.monthKey === options.previousMonth,
    );

    return {
        managerId: options.managerId,
        doneSales: current?.salesCount ?? 0,
        entryDone: current?.callsDone ?? 0,
        planHead: current?.planSales ?? null,
        override: options.targets.overrides[options.managerId] ?? null,
        levelTarget: levelTargetOf(options.targets, current?.level ?? null),
        lastMonthSales: previous?.salesCount ?? null,
        openEpisodes: options.openEpisodes,
        edges: current?.edges ?? [],
        norms:
            options.model.managerNorms.find(
                norm => norm.managerId === options.managerId,
            ) ?? null,
    };
}
