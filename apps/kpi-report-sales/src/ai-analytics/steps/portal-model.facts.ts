/**
 * Разбор чужих значений шины для шага модели портала (план Фазы 2,
 * поток 16a): эпизоды и стадийные θ шага истории стадий, строки разборов
 * шага звонков, паспорта шага паспорта.
 *
 * Отделено от `portal-model.step.ts` по образцу `sanity.facts.ts` и
 * `stage-history.facts.ts`: шаг оркеструет, разбор — здесь, каждый файл в
 * пределах 300 строк. Чужая или неполная форма молча отбрасывается —
 * месячный шаг не должен падать из-за соседа, положившего в шину не то.
 *
 * Чистые функции: без DI, Bitrix и Prisma.
 */
import {
    saleLags,
    type DealEpisode,
    type QualityGroup,
    type SaleLag,
    type StageTheta,
} from '@lib/sales-ai-analytics';
import type { PortalRosterMember } from '@lib/sales-ai-analytics/model/portal-events';
import { readPassports } from '../domain/assembler/bus-facts.util';

/** Делитель шкалы разбора: 0–100 в звонке, 1–10 в модели качества. */
const SCORE_SCALE = 10;

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value !== null && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : null;

function rowsOf(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];

    return (value as unknown[]).flatMap((item): Record<string, unknown>[] => {
        const row = asRecord(item);

        return row === null ? [] : [row];
    });
}

/** Число из шины; чужая форма — undefined, а не ноль. */
export function busNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value)
        ? value
        : undefined;
}

/**
 * Группы оценок по менеджерам для ANOVA (`estimateMS`): шкала 1–10,
 * только разборы с оценкой. Без групп m_S остаётся дефолтом реестра.
 */
export function qualityGroupsOf(value: unknown): QualityGroup[] {
    const byManager = new Map<string, number[]>();
    for (const row of rowsOf(value)) {
        const managerId =
            typeof row.managerId === 'string' && row.managerId !== ''
                ? row.managerId
                : null;
        const score = busNumber(row.score);
        if (managerId === null || score === undefined) continue;
        byManager.set(managerId, [
            ...(byManager.get(managerId) ?? []),
            score / SCORE_SCALE,
        ]);
    }

    return [...byManager.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, values]) => ({ key, values }));
}

/**
 * Версия рубрики окна: самая частая среди разборов. Разные версии в одном
 * окне — это и есть смена рубрики, и журнал получит событие на следующем
 * пересчёте (сравнение с сигнатурой прошлой модели).
 */
export function rubricVersionOf(value: unknown): string | null {
    const counts = new Map<string, number>();
    for (const row of rowsOf(value)) {
        const versions = asRecord(row.versions);
        const rubric = versions?.rubric;
        if (typeof rubric !== 'string' || rubric === '') continue;
        counts.set(rubric, (counts.get(rubric) ?? 0) + 1);
    }
    const top = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];

    return top?.[0] ?? null;
}

/** Реестр менеджеров с датами начала стажа (автособытие new_hire). */
export function rosterOf(value: unknown): PortalRosterMember[] {
    return [...readPassports(value).values()].map(passport => ({
        managerId: passport.managerId,
        since: passport.since,
    }));
}

/** Стадийные θ из шины; чужая форма — пустой список. */
export function stageThetasOf(value: unknown): StageTheta[] {
    return rowsOf(value).flatMap(row =>
        typeof row.stageCode === 'string' && typeof row.value === 'number'
            ? [row as unknown as StageTheta]
            : [],
    );
}

/** Эпизоды сделок из шины; чужая форма — пустой список. */
function episodesOf(value: unknown): DealEpisode[] {
    return rowsOf(value).flatMap(row =>
        typeof row.entityId === 'string' && typeof row.stageCode === 'string'
            ? [row as unknown as DealEpisode]
            : [],
    );
}

/**
 * Лаги продаж под шкалу `F(d)`: считает библиотека по эпизодам шины,
 * открытые эпизоды идут цензурированными точками (Каплан–Мейер).
 */
export function saleLagsOf(value: unknown): SaleLag[] {
    return saleLags(episodesOf(value), { includeOpen: true });
}

/** Трактовка ребра из значения шины `chain` шага истории стадий. */
export function chainEstimandOf(value: unknown): {
    edgeKind?: 'rate' | 'prob';
    edgeKindReason?: string;
} {
    const estimand = asRecord(asRecord(value)?.estimand);
    const kind = estimand?.estimand;
    const reason = estimand?.reason;

    return {
        ...(kind === 'rate' || kind === 'prob' ? { edgeKind: kind } : {}),
        ...(typeof reason === 'string' ? { edgeKindReason: reason } : {}),
    };
}

/**
 * Менеджер эпизода: сцепка звонков (`chain.links`) даёт «звонок →
 * эпизод», строки разборов — «звонок → менеджер». Без сцепки карта
 * пуста, и прогноз честно остаётся без пайплайна.
 */
export function managerByEpisodeKey(
    chain: unknown,
    rows: unknown,
): Map<string, string> {
    const byCall = new Map<string, string>();
    for (const row of rowsOf(rows)) {
        const id = row.transcriptionId;
        const managerId = row.managerId;
        if (
            (typeof id === 'string' || typeof id === 'number') &&
            typeof managerId === 'string' &&
            managerId !== ''
        ) {
            byCall.set(String(id), managerId);
        }
    }
    const links = asRecord(chain)?.links;
    const found = new Map<string, string>();
    for (const link of rowsOf(links)) {
        const episodeKey = link.episodeKey;
        const callId = link.callId;
        if (typeof episodeKey !== 'string' || typeof callId !== 'string') {
            continue;
        }
        const managerId = byCall.get(callId);
        if (managerId !== undefined && !found.has(episodeKey)) {
            found.set(episodeKey, managerId);
        }
    }

    return found;
}

/** Открытые (цензурированные) эпизоды шины: ключ, стадия и возраст. */
export function openEpisodesOf(value: unknown): {
    key: string;
    stageCode: string;
    ageDays: number;
}[] {
    return rowsOf(value).flatMap(row =>
        typeof row.key === 'string' &&
        typeof row.stageCode === 'string' &&
        row.endedAt === null
            ? [
                  {
                      key: row.key,
                      stageCode: row.stageCode,
                      ageDays: busNumber(row.ageDays) ?? 0,
                  },
              ]
            : [],
    );
}
