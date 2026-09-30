/**
 * Входы сборки месячной модели портала, которые сценарий берёт из
 * настроек, шины и стора (план Фазы 2, поток 16a; Фаза 4): решения
 * портала для готовности (с источником календаря — хвост 1) и входы
 * Фазы 4 (связь качества, пул, ступени L4/L5, недели сверхдисперсии).
 *
 * Вынесено из `portal-model.use-case.ts` по лимиту 300 строк (там же
 * было обнаружение автособытий).
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    canonicalJson,
    type JsonValue,
    type OverdispersionPoint,
} from '@lib/sales-ai-analytics';
import { detectPortalEvents } from '@lib/sales-ai-analytics/model/portal-events';
import type { AiPortalEvent } from '@lib/sales-ai-analytics/settings/ai-settings.types';
import { monthBounds } from '../../constants/ai-manager-snapshot.const';
import type { PortalReadinessFacts } from '../assembler/portal-model.assembler';
import { calendarImportedOf } from '../assembler/portal-model.phase4';
import type { PortalModelPhase4Facts } from '../assembler/portal-model.phase4.types';
import type {
    PortalManagerMonth,
    PortalModelFacts,
    PortalModelRequest,
} from '../assembler/portal-model.types';
import type { Phase4LatestSnapshots } from '../loaders/phase4-snapshots.loader';
import {
    consentInForce,
    poolConsentDayOf,
} from '../loaders/pool-portals.facts';
import type { PortalModelRecord } from '../loaders/portal-model.loader';
import type { AiAnalyticsPortalSettings } from '../loaders/settings.loader';
import { snapshotHashKey } from '../../store/snapshot-serialize.util';
import { priceMedianOf } from './portal-model.reuse';

/** Автособытия окна: новички, версия рубрики, методичка, медиана цены. */
export function detectedEventsOf(
    request: PortalModelRequest,
    facts: PortalModelFacts,
    months: readonly PortalManagerMonth[],
    known: readonly AiPortalEvent[],
    previous: PortalModelRecord | null,
): AiPortalEvent[] {
    const bounds = monthBounds(request.monthKey);
    const signature = previous?.payload.signature;

    return detectPortalEvents({
        from: bounds.from,
        to: bounds.to,
        roster: facts.roster ?? [],
        rubricVersion: facts.rubricVersion ?? null,
        previousRubricVersion: signature?.rubricVersion ?? null,
        scriptHash: facts.scriptHash ?? null,
        previousScriptHash: signature?.scriptHash ?? null,
        priceMedian: priceMedianOf(months, request.monthKey),
        previousPriceMedian: signature?.priceMedian ?? null,
        known,
    });
}

/**
 * Решения портала для готовности модели. Календарь импортирован, если
 * прогон знает источник и он не запасной; без источника — прежнее
 * правило по праздникам ключа настроек.
 */
export function portalReadinessFactsOf(
    settings: AiAnalyticsPortalSettings,
    facts: PortalModelFacts,
    months: readonly PortalManagerMonth[],
    comparableFrom: string,
): PortalReadinessFacts {
    return {
        enabled: settings.enabled,
        // Разборы в окне есть: либо их принёс прогон (группы оценок),
        // либо они уже записаны в месяцах менеджеров.
        pipelineEnabled:
            (facts.qualityGroups ?? []).length > 0 ||
            months.some(month => month.score !== null),
        calendarImported: calendarImportedOf(
            facts.calendarSource,
            settings.calendar.holidays.length,
        ),
        ...(facts.calendarSource === undefined
            ? {}
            : { calendarSource: facts.calendarSource }),
        rosterLevels: settings.levels.length,
        rosterConfirmedAt: settings.rosterConfirmedAt,
        comparableFrom,
    };
}

/** Согласие портала на пул (ключи настроек). */
type PoolConsent = Pick<
    AiAnalyticsPortalSettings,
    'poolOptIn' | 'poolConsentAt'
>;

/**
 * Связь качества и пул, которыми модель месяца вправе пользоваться: из
 * шины прогона; ключа в шине нет (пересчёт одной модели) — из стора, только
 * за тот же месяц. Пул — только при согласии, действующем к концу месяца
 * модели: портал, отозвавший согласие, прайоры пула больше не получает,
 * даже если старая копия пула лежит в `ais`.
 */
export function phase4LinksOf(
    facts: PortalModelFacts,
    monthKey: string,
    stored: Phase4LatestSnapshots,
    consent: PoolConsent,
): Pick<PortalModelPhase4Facts, 'qualityLink' | 'pool'> {
    const sameMonth = <T extends { monthKey: string }>(
        value: T | null,
    ): T | null => (value?.monthKey === monthKey ? value : null);
    const poolAllowed = consentInForce(consent, poolConsentDayOf(monthKey));
    const pool = facts.pool === undefined ? sameMonth(stored.pool) : facts.pool;

    return {
        qualityLink:
            facts.qualityLink === undefined
                ? sameMonth(stored.qualityLink)
                : facts.qualityLink,
        pool: poolAllowed ? pool : null,
    };
}

/** Содержимое снапшота без `meta` (там момент прогона) в каноническом JSON. */
function contentOf(value: object | null | undefined): string {
    if (value === null || value === undefined) return 'null';
    const plain: unknown = JSON.parse(JSON.stringify({ ...value, meta: null }));

    return canonicalJson(plain as JsonValue);
}

/**
 * Отпечаток входов Фазы 4 модели месяца: пул (уже с учётом согласия) и
 * связь качества. Другой отпечаток — повтор прогона за тот же месяц модель
 * не переиспользует: после отзыва согласия или смены состава пула прайоры
 * пересчитываются, а не отдаются из прошлой записи.
 */
export function phase4InputsKeyOf(
    links: Pick<PortalModelPhase4Facts, 'qualityLink' | 'pool'>,
): string {
    return snapshotHashKey([
        contentOf(links.pool),
        contentOf(links.qualityLink),
    ]);
}

/**
 * Входы Фазы 4: связь качества и пул — `phase4LinksOf`. Точность прогноза
 * и эффект советов — из стора, не позже месяца модели
 * (`Phase4SnapshotsLoader.loadForMonth`).
 */
export function portalPhase4FactsOf(
    facts: PortalModelFacts,
    monthKey: string,
    stored: Phase4LatestSnapshots,
    weeklyActivity: readonly OverdispersionPoint[],
    consent: PoolConsent,
): PortalModelPhase4Facts {
    return {
        ...phase4LinksOf(facts, monthKey, stored, consent),
        forecastBacktest: stored.forecastBacktest,
        recommendationEffect: stored.recommendationEffect,
        weeklyActivity,
        ...(facts.calendarSource === undefined
            ? {}
            : { calendarSource: facts.calendarSource }),
    };
}
