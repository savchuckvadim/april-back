/**
 * Версии разбора в недельном снапшоте менеджера и в рядах трендов.
 *
 * Смешанность недели и разрыв ряда считаются по СЕРИЯМ версий
 * (`versionsSeriesKey` библиотеки — та же граница, по которой матрица
 * помечает разборы «по прежним правилам»): минорная правка промпта
 * (3.1 → 3.2 → 3.3) серию не меняет, правка по существу (версия без записи
 * в таблице серий) — меняет. Сырая сигнатура (`versionsKey`) остаётся для
 * выбора точного набора.
 *
 * Чистые функции.
 */
import {
    versionDate,
    versionsSeriesKey,
    type AnalysisVersions,
} from '@lib/sales-ai-analytics';
import type { DatedLiteRow } from '../loaders/lite-row.mapper';
import { versionsKey } from './manager-snapshot.types';

/** Набор без единой даты: серия неизвестна, у всех таких она одна. */
const UNDATED_SERIES = 'undated';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

/** Версии недели менеджера: набор для снапшота и признак смешанных серий. */
export interface WeekVersions {
    /** Набор поздней серии с наибольшей датой промпта; нет — null. */
    versions: AnalysisVersions | null;
    /** Разборы недели принадлежат больше чем одной серии. */
    mixed: boolean;
}

/** Карта версий разбора → контракт AnalysisVersions; неполная — null. */
export function toAnalysisVersions(
    versions: Record<string, string> | null,
): AnalysisVersions | null {
    if (versions === null) return null;
    const { prompt, rubric, registry, attribution, classifier } = versions;
    const values = [prompt, rubric, registry, attribution, classifier];
    return values.every(value => typeof value === 'string' && value !== '')
        ? { prompt, rubric, registry, attribution, classifier }
        : null;
}

/**
 * Ключи выбора набора недели по убыванию старшинства: серия, дата в
 * строке промпта, точная строка — выбор не зависит от порядка разборов.
 */
const rankOf = (versions: AnalysisVersions): readonly string[] => [
    versionsSeriesKey(versions) ?? '',
    versionDate(versions.prompt) ?? '',
    versionsKey(versions),
];

/** Набор `left` старше `right` по ключам выбора. */
function isLater(left: AnalysisVersions, right: AnalysisVersions): boolean {
    const a = rankOf(left);
    const b = rankOf(right);
    const index = a.findIndex((value, position) => value !== b[position]);
    return index !== -1 && a[index] > b[index];
}

/**
 * Версии недели менеджера по разобранным строкам с полным набором версий:
 * смешанность — по сериям, набор — детерминированно старший.
 */
export function weekVersionsOf(
    rows: readonly DatedLiteRow[],
    managerId: string,
): WeekVersions {
    let latest: AnalysisVersions | null = null;
    const series = new Set<string>();
    for (const row of rows) {
        if (row.managerId !== managerId || !row.analysisPresent) continue;
        const versions = toAnalysisVersions(row.versions);
        if (versions === null) continue;
        series.add(versionsSeriesKey(versions) ?? UNDATED_SERIES);
        if (latest === null || isLater(versions, latest)) latest = versions;
    }
    return { versions: latest, mixed: series.size > 1 };
}

/**
 * Сигнатура точки ряда трендов из сохранённых `payload.versions` недели —
 * серия набора. Считается при чтении, поэтому лечит и старые снимки.
 * Неполный или чужой набор и набор без дат — null: точка ряд не рвёт.
 */
export function seriesSignatureOf(raw: unknown): string | null {
    if (!isRecord(raw)) return null;
    const versions = toAnalysisVersions(
        Object.fromEntries(
            Object.entries(raw).filter(
                (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
            ),
        ),
    );
    return versions === null ? null : versionsSeriesKey(versions);
}
