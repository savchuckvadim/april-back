/**
 * Разделы досье, которые в отдельных ручках собирают соседние срезы
 * (план Фазы 3): тренды (П1), план-факт (П2) и «год назад» (П3). Досье
 * не считает их заново — оно вызывает те же презентеры на тех же
 * снапшотах, чтобы карточка менеджера и обзор не расходились в числах.
 *
 * Каждая функция отдаёт блок и причину, с которой раздел придёт пустым,
 * если блока нет: у трендов «снапшота нет» и «данных мало» — разные
 * объяснения для руководителя.
 *
 * Чистые функции: без DI, Bitrix и Prisma; время приходит параметром.
 */
import { toPortalDate } from '@lib/sales-ai-analytics';
import {
    AI_DOSSIER_REASONS,
    type AiDossierReason,
} from '../../constants/ai-dossier.const';
import { isClosedMonth } from '../../constants/ai-plan-fact.const';
import type { AiPlanFactDto } from '../../dto/ai-plan-fact.dto';
import type { AiManagerTrendsDto } from '../../dto/ai-trend.dto';
import type { AiYoyDto } from '../../dto/ai-yoy.dto';
import type { DossierPlanFactSource } from '../loaders/dossier-neighbours.loader';
import { presentPlanFact } from '../presenter/plan-fact.presenter';
import { toTrendsBlock, type TrendsView } from '../presenter/trends.presenter';
import { baseDepartmentOf } from '../presenter/yoy-rows.presenter';
import { toYoyBlock, type YoyMonthView } from '../presenter/yoy.presenter';
import type { DossierSnapshotView } from './dossier.reader';
import type { ManagerMonthPayload } from './manager-snapshot.types';
import { buildPlanFactView } from './plan-fact.assembler';

/** Раздел досье: блок либо причина, с которой он придёт пустым. */
export interface DossierSectionOutcome<T> {
    block: T | null;
    missing: AiDossierReason;
}

/** Целое поле чужой нагрузки; не число — 0. */
function countOf(payload: unknown, field: string): number {
    const value = (payload as Record<string, unknown> | null)?.[field];

    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Разобранных звонков за окно — сумма `n` месяцев менеджера. */
export function windowAnalyzed(months: readonly DossierSnapshotView[]): number {
    return months.reduce((sum, month) => sum + countOf(month.payload, 'n'), 0);
}

/**
 * Тренды: тот же презентер, что у строки обзора. Снапшота нет —
 * `no-snapshots`; снапшот есть, но разборов меньше `n_min_none` либо
 * доверие рядов none — `too-few-data`.
 */
export function dossierTrends(
    trends: DossierSnapshotView | null,
    analyzed: number,
): DossierSectionOutcome<AiManagerTrendsDto> {
    if (trends === null) {
        return { block: null, missing: AI_DOSSIER_REASONS.noSnapshots };
    }

    return {
        block: toTrendsBlock(trends.payload as TrendsView, { n: analyzed }),
        missing: AI_DOSSIER_REASONS.tooFewData,
    };
}

/**
 * «Год назад»: месяц окончания окна против M−12 тем же презентером, что
 * у строки обзора. Отдел «сейчас» и «год назад» — из паспортов обоих
 * месяцев (В9: смена отдела помечает пару несопоставимой, но сравнение
 * идёт с тем же менеджером). Снапшота M−12 нет — `no-history`; оба
 * месяца ниже `n_min_none` — `too-few-data`.
 */
export function dossierYoy(
    current: DossierSnapshotView | null,
    base: DossierSnapshotView | null,
    monthKey: string,
    comparableFrom: string | null,
): DossierSectionOutcome<AiYoyDto> {
    if (base === null) {
        return { block: null, missing: AI_DOSSIER_REASONS.noHistory };
    }
    const currentView = (current?.payload ?? null) as YoyMonthView | null;
    const baseView = base.payload as YoyMonthView;

    return {
        block: toYoyBlock(currentView, baseView, {
            periodKey: monthKey,
            departmentId: baseDepartmentOf(currentView),
            baseDepartmentId: baseDepartmentOf(baseView),
            comparableFrom,
        }),
        missing: AI_DOSSIER_REASONS.tooFewData,
    };
}

/**
 * План-факт последнего месяца окна по одному менеджеру: та же сборка и
 * тот же презентер, что у ручки `plan-fact`. Периметр здесь — сам
 * менеджер: право смотреть досье проверено до постановки джобы. Блок
 * есть всегда, когда прочитаны настройки портала (без плана и без
 * месяца строки приходят с причинами внутри); настроек нет —
 * `section-failed`.
 */
export function dossierPlanFact(
    source: DossierPlanFactSource | null,
    month: DossierSnapshotView | null,
    managerId: string,
    now: Date,
): DossierSectionOutcome<AiPlanFactDto> {
    if (source === null) {
        return { block: null, missing: AI_DOSSIER_REASONS.sectionFailed };
    }
    const today = toPortalDate(now, source.timeZone);
    const months = new Map<string, Partial<ManagerMonthPayload>>();
    if (month !== null) {
        months.set(managerId, month.payload as Partial<ManagerMonthPayload>);
    }
    const view = buildPlanFactView({
        monthKey: source.monthKey,
        managerIds: [managerId],
        plan: source.plan,
        months,
        calendar: source.calendar,
        today,
        dailyPlanEnabled: source.dailyPlanEnabled,
        ...(source.dayCeiling === undefined
            ? {}
            : { dayCeiling: source.dayCeiling }),
    });

    return {
        block: presentPlanFact(
            view,
            { role: 'manager', visibleManagerIds: [managerId] },
            { today, closed: isClosedMonth(source.monthKey, today) },
        ),
        missing: AI_DOSSIER_REASONS.sectionFailed,
    };
}
