/**
 * Настройки пост-отказа из реестра портала (`with_post_fail`,
 * `post_fail_assign_user_id`, `post_fail_company_date_text_field`).
 *
 * Резолвятся один раз в use-case и кладутся в контекст — тем же путём, что
 * политики полей и правила стадий: сервис пост-отказа настроек не читает.
 */
export interface EventPostFailSettings {
    /** «Пост-отказная дата» включена на портале. */
    readonly enabled: boolean;
    /** Кому передать компанию после отказа; 0 — не переназначать. */
    readonly assignUserId: number;
    /** UF-код строкового поля компании для даты «ДД.ММ.ГГГГ»; пусто — не писать. */
    readonly companyDateTextField: string;
}

/** Дефолт схемы: пост-отказ выключен, ничего не переназначаем и не пишем. */
export const DEFAULT_POST_FAIL_SETTINGS: EventPostFailSettings = {
    enabled: false,
    assignUserId: 0,
    companyDateTextField: '',
};
