/**
 * Чтение значений шины конвейера соседних шагов (план, поток 12: шаг
 * кладёт результат под своим ключом, следующие читают).
 *
 * Паспорт менеджера, снимок планов и доля сцепки приходят из ШАГОВ ДРУГИХ
 * ПОТОКОВ, поэтому читаются структурно, а не импортом их файлов: у
 * менеджерских снапшотов не должно быть зависимости от порядка слияния
 * потоков волны. Чужая или неполная форма не роняет прогон — она
 * деградирует до `null` (штатная деградация §5.4).
 */
import type {
    ManagerPassportFacts,
    ManagerPlanSnapshot,
    ManagerStyleFacts,
} from './manager-snapshot.types';

type Unknown = Record<string, unknown>;

const isObject = (value: unknown): value is Unknown =>
    typeof value === 'object' && value !== null;

const asString = (value: unknown): string | null =>
    typeof value === 'string' && value !== '' ? value : null;

const asNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

/** managerId любого вида (число Битрикс или строка) → строка ключа. */
export function asManagerId(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }
    return asString(value);
}

/**
 * Элементы значения шины: массив, конверт со списком `managers` (форма
 * снимка планов `PlanSnapshot`) либо словарь по managerId.
 */
function entriesOf(value: unknown): Unknown[] {
    if (Array.isArray(value)) return value.filter(isObject);
    if (isObject(value)) {
        const managers = value.managers;
        if (Array.isArray(managers)) return managers.filter(isObject);
        return Object.values(value).filter(isObject);
    }
    return [];
}

/** Паспорта менеджеров из шины (ключ `passport`) по managerId. */
export function readPassports(
    value: unknown,
): Map<string, ManagerPassportFacts> {
    const found = new Map<string, ManagerPassportFacts>();
    for (const item of entriesOf(value)) {
        const managerId = asManagerId(item.managerId);
        if (managerId === null) continue;
        found.set(managerId, {
            managerId,
            since: asString(item.since),
            sinceSource: asString(item.sinceSource),
            status: asString(item.status),
            leftAt: asString(item.leftAt),
            level: asString(item.level),
            levelSource: asString(item.levelSource),
            tenureMonths: asNumber(item.tenureMonths),
            tenureBand: asString(item.tenureBand),
        });
    }
    return found;
}

/** Снимок планов руководителя из шины (ключ `plans`) по managerId. */
export function readPlans(value: unknown): Map<string, ManagerPlanSnapshot> {
    const found = new Map<string, ManagerPlanSnapshot>();
    for (const item of entriesOf(value)) {
        const managerId = asManagerId(item.managerId);
        if (managerId === null) continue;
        found.set(managerId, {
            sales: asNumber(item.sales),
            calls: asNumber(item.calls),
            presentations: asNumber(item.presentations),
        });
    }
    return found;
}

/** Подпись профиля стиля: код, заголовок, опора и объём. */
function styleTagOf(value: Unknown): ManagerStyleFacts['tags'][number] | null {
    const code = asString(value.code);
    return code === null
        ? null
        : {
              code,
              title: asString(value.title) ?? code,
              basis: asString(value.basis) ?? '',
              n: asNumber(value.n) ?? 0,
          };
}

/** Профили стиля из шины (ключ `style`) по managerId. */
export function readStyles(value: unknown): Map<string, ManagerStyleFacts> {
    const found = new Map<string, ManagerStyleFacts>();
    for (const item of entriesOf(value)) {
        const managerId = asManagerId(item.managerId);
        const facts = isObject(item.style) ? item.style : null;
        if (managerId === null || facts === null) continue;
        found.set(managerId, {
            calls: asNumber(facts.calls) ?? 0,
            peers: asNumber(facts.peers) ?? 0,
            vector: isObject(facts.vector)
                ? (facts.vector as Record<string, number>)
                : {},
            tags: (Array.isArray(facts.tags) ? facts.tags : [])
                .filter(isObject)
                .flatMap(tag => styleTagOf(tag) ?? []),
            confidence: asString(facts.confidence) ?? 'none',
            confidenceReason: asString(facts.confidenceReason),
            window: (Array.isArray(facts.window) ? facts.window : []).flatMap(
                month => asString(month) ?? [],
            ),
        });
    }
    return found;
}

/**
 * Доля сцепки звонков со сделками, % (ключ `chain` шага истории стадий).
 * Нет значения — 0: рёбра остаются интенсивностями.
 */
export function readChainSharePct(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (isObject(value)) {
        return asNumber(value.chainSharePct) ?? 0;
    }
    return 0;
}
