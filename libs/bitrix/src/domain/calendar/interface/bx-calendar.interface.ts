import { BxCalendarFailureReason } from '../consts/bx-calendar.const';

/**
 * Настройки календаря портала (ответ calendar.settings.get).
 *
 * Состав полей — строго по официальной документации метода:
 * https://apidocs.bitrix24.ru/api-reference/calendar/calendar-settings-get.html
 * Производственный календарь читается из четырёх первых полей.
 *
 * ВАЖНО: документация объявляет work_time_start/work_time_end строками,
 * порталы отдают их числом (9, 8.5) — поэтому тип union, а привод к числу
 * делает потребитель (расхождение зафиксировано, не «подгонка» под код).
 */
export interface IBXCalendarSettings {
    /** Время начала рабочего дня (часы: '9' | 9 | 8.5). */
    work_time_start: string | number;
    /** Время окончания рабочего дня (часы: '19' | 19 | 18.5). */
    work_time_end: string | number;
    /**
     * Праздничные дни года: строка «день.месяц» через запятую,
     * например '1.1,7.1,23.2,8.3,1.5,9.5,12.6,4.11'.
     */
    year_holidays: string;
    /** Выходные дни недели кодами MO … SU (см. BX_CALENDAR_WEEK_DAY_CODES). */
    week_holidays: string[];
    /** День начала недели (код дня недели). */
    week_start?: string;
    /** Шаблон имени пользователя. */
    user_name_template?: string;
    /** Автоматическая синхронизация календарей по подписке (Google/Office365). */
    sync_by_push?: boolean;
    /** Показывать логин пользователя. */
    user_show_login?: boolean;
    /** Шаблон ссылки на профиль пользователя. */
    path_to_user?: string;
    /** Шаблон ссылки на календарь пользователя. */
    path_to_user_calendar?: string;
    /** Шаблон ссылки на рабочую группу. */
    path_to_group?: string;
    /** Шаблон ссылки на календарь группы. */
    path_to_group_calendar?: string;
    /** Шаблон ссылки к видеопереговорной. */
    path_to_vr?: string;
    /** Шаблон ссылки к переговорной. */
    path_to_rm?: string;
    /** Тип инфоблока бронирования переговорных. */
    rm_iblock_type?: string;
    /** Идентификатор инфоблока бронирования переговорных. */
    rm_iblock_id?: string;
    /** Начальники видят календари подчинённых. */
    dep_manager_sub?: boolean;
    /** Типы календарей, недоступные для добавления в избранные. */
    denied_superpose_types?: string[];
    /** Шаблоны ссылок общие для всех сайтов. */
    pathes_for_sites?: boolean;
    /** Идентификатор форума для комментариев. */
    forum_id?: string;
    /** Параметры переговорных общие для всех сайтов. */
    rm_for_sites?: boolean;
    /** Шаблон ссылки на календари компании. */
    path_to_type_company_calendar?: string;
    /** Шаблон ссылки на бронирование переговорных. */
    path_to_type_location?: string;
    /** Шаблон ссылки на календарь открытых событий. */
    path_to_type_open_event?: string;
}

/** calendar.settings.get параметров не принимает. */
export type IBXCalendarSettingsRequest = Record<string, never>;

/** Успешное чтение настроек календаря портала. */
export interface IBXCalendarSettingsOk {
    ok: true;
    settings: IBXCalendarSettings;
}

/** Типизированный отказ: потребитель деградирует на календарь РФ. */
export interface IBXCalendarSettingsFailure {
    ok: false;
    /** Причина отказа (различима: нет прав / нет метода / сбой / кривой ответ). */
    reason: BxCalendarFailureReason;
    /** Код ошибки Битрикс, если портал его вернул. */
    code: string | null;
    /** Описание ошибки Битрикс, если портал его вернул. */
    description: string | null;
}

/** Результат безопасного чтения настроек календаря. */
export type BxCalendarSettingsResult =
    | IBXCalendarSettingsOk
    | IBXCalendarSettingsFailure;
