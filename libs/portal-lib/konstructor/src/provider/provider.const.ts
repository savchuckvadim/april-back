/**
 * Тип поставщика (`agents.type`) и его реквизитов (`rqs.type`).
 * Совпадает с техническим разрезом пресета реквизита в Bitrix
 * (см. `apps/rq` → `RQ_TYPE`). Значения хранятся в БД как есть.
 */
export type ProviderType = 'org' | 'org_state' | 'ip' | 'fiz' | 'advokat';

/**
 * Runtime-список значений типа поставщика. Единый источник правды для
 * Swagger `enum`, валидации и наполнения select'а на фронте.
 * `satisfies` ловит расхождение с union {@link ProviderType}.
 */
export const PROVIDER_TYPE_VALUES = [
    'org',
    'org_state',
    'ip',
    'fiz',
    'advokat',
] as const satisfies readonly ProviderType[];

/** Одна позиция выпадающего списка: значение + подпись для интерфейса. */
export interface ProviderSelectOption {
    value: ProviderType;
    label: string;
}

/**
 * Опции для select'а типа поставщика/реквизита. Порядок задаёт порядок
 * отрисовки в выпадающем списке админки.
 */
export const PROVIDER_TYPE_OPTIONS: readonly ProviderSelectOption[] = [
    { value: 'org', label: 'Организация' },
    { value: 'org_state', label: 'Бюджетная организация' },
    { value: 'ip', label: 'Индивидуальный предприниматель' },
    { value: 'fiz', label: 'Физическое лицо' },
    { value: 'advokat', label: 'Адвокат/нотариус' },
];

/** Проверка, что произвольная строка — валидный тип поставщика. */
export const isProviderType = (value: string): value is ProviderType =>
    (PROVIDER_TYPE_VALUES as readonly string[]).includes(value);
