/**
 * Бесплатный LegalTech комплекта для легаси-клиентов (init-form отчёта о
 * поставке) — порт Laravel `SupplyController::getSpecification`
 * (online/app, строки ~2860-2898).
 *
 * Легаси-фронт присылает:
 *  - `complect.lt` — номера LT-сервисов, входящих в комплект бесплатно
 *    (у Гарант-Юриста: 0 «Сутяжник», 1 «Конструктор правовых документов»);
 *  - `legalTech.packages` — пакеты по весу: ключ = число сервисов
 *    («2» Малый, «5» Средний, «10» Большой);
 *  - `legalTech.value` — каталог сервисов с номерами; в массиве бывают
 *    `null`-«дыры».
 *
 * Пакет — `packages[вес]`, где вес = число сервисов комплекта, и сервисы
 * 16, 1000, 1001 весят вдвое (+1). Состав — сервисы каталога с номерами из
 * `complect.lt`. Пакета такого веса нет — бесплатного LT нет вовсе (как в
 * Laravel: состав считался только внутри найденного пакета).
 *
 * Без этого расчёта (Nest до 17.11.2026) пункты спецификации
 * `specification_lt_free*` были пустыми, и бесплатный LT пропадал из отчёта
 * о поставке и из комментария заявки RPA.
 */
export interface LegacyFreeLt {
    freePacket: string;
    freeServices: string[];
}

/** Сервисы, которые в весе пакета считаются дважды (Laravel: in_array strict). */
const DOUBLE_WEIGHT_LT_NUMBERS = [16, 1000, 1001];

const EMPTY: LegacyFreeLt = { freePacket: '', freeServices: [] };

const asRecord = (value: unknown): Record<string, unknown> | null =>
    value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;

const toNumbers = (value: unknown): number[] =>
    Array.isArray(value)
        ? value
              .map(item => Number(item))
              .filter(item => Number.isFinite(item))
        : [];

export const legacyFreeLt = (
    complectLt: unknown,
    legalTech: unknown,
): LegacyFreeLt => {
    const numbers = toNumbers(complectLt);
    if (!numbers.length) return EMPTY;

    const lt = asRecord(legalTech);
    const packages = asRecord(lt?.packages);
    if (!packages) return EMPTY;

    const weight =
        numbers.length +
        DOUBLE_WEIGHT_LT_NUMBERS.filter(code => numbers.includes(code)).length;
    const packet = asRecord(packages[String(weight)]);
    if (!packet) return EMPTY;

    const freePacket =
        typeof packet.fullName === 'string' ? packet.fullName : '';
    const catalog = Array.isArray(lt?.value) ? lt.value : [];
    const freeServices = catalog
        .map(asRecord)
        .filter(
            (service): service is Record<string, unknown> =>
                service !== null &&
                typeof service.name === 'string' &&
                service.name !== '' &&
                numbers.includes(Number(service.number)),
        )
        .map(service => service.name as string);

    return { freePacket, freeServices };
};
