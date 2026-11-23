/**
 * Роли картинок поставщика. Перечень живёт в коде: новая роль добавляется
 * сюда без миграции (колонка `provider_images.role` — обычная строка).
 */
export const PROVIDER_IMAGE_ROLES = [
    'stamp',
    'signature_director',
    'signature_accountant',
    'logo',
] as const;

export type ProviderImageRole = (typeof PROVIDER_IMAGE_ROLES)[number];

/** Подписи ролей для сообщений об ошибках и для админки. */
export const PROVIDER_IMAGE_ROLE_LABELS: Readonly<
    Record<ProviderImageRole, string>
> = {
    stamp: 'Печать',
    signature_director: 'Подпись руководителя',
    signature_accountant: 'Подпись главного бухгалтера',
    logo: 'Логотип',
};

export const isProviderImageRole = (
    value: string,
): value is ProviderImageRole =>
    (PROVIDER_IMAGE_ROLES as readonly string[]).includes(value);
