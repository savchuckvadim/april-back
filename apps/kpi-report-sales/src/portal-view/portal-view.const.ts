import { REPORT_VIEW_COMMON_TAB_NAMES } from '@lib/portal-lib/store/app-settings';
import type { VendorSettingKey } from '@lib/vendor-settings';

/** Тег Swagger: страница «Настройки отчёта» — часть отчёта KPI. */
export const PORTAL_VIEW_SWAGGER_TAG = 'Sales Report' as const;

/** Префикс ручек вида отчёта портала. */
export const PORTAL_VIEW_ROUTE_PREFIX = 'kpi-report/portal-view' as const;

export const PORTAL_VIEW_ROUTES = {
    get: 'get',
    save: 'save',
} as const;

/** Настройка вендора: адрес чата открытой линии поддержки для клиентов. */
export const PORTAL_VIEW_SUPPORT_URL_SETTING: VendorSettingKey =
    'SUPPORT_CHAT_URL';

/** Откуда бейдж в списке вариантов: общий справочник или пункт методики. */
export const PORTAL_VIEW_BADGE_GROUPS = ['general', 'methodology'] as const;
export type PortalViewBadgeGroup = (typeof PORTAL_VIEW_BADGE_GROUPS)[number];

/** Приставка идентификатора бейджа пункта методики: `m:<код пункта>`. */
export const PORTAL_VIEW_METHODOLOGY_PREFIX = 'm:' as const;

/** Пределы запроса сохранения: список вкладок, список бейджей, длина id бейджа. */
export const PORTAL_VIEW_LIMITS = {
    tabs: 20,
    badges: 60,
    badgeIdLength: 80,
} as const;

/**
 * Идентификатор бейджа: код общего бейджа (`step_missing`) либо пункта
 * методики с приставкой (`m:cold.utp_unique`) — строчная латиница, цифры и
 * разделители «.», «_», «-» внутри.
 */
export const PORTAL_VIEW_BADGE_ID_PATTERN =
    /^(m:)?[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

export const PORTAL_VIEW_MESSAGES = {
    forbidden: 'Настройки отчёта меняет руководитель группы и выше',
    unknownBadge: 'Неизвестный бейдж в списке основных',
    badgePattern:
        'Бейдж — строчная латиница, цифры и знаки «.», «_», «-»; пункт методики — с приставкой «m:»',
    unknownTab: 'Неизвестная вкладка отчёта в списке скрытых',
    noCommonTab: `Нельзя скрыть сразу все вкладки, которые видят все сотрудники (${REPORT_VIEW_COMMON_TAB_NAMES}): оставьте хотя бы одну из этих вкладок`,
} as const;

/** Подписи сохраняемых полей — для строки журнала «кто что менял». */
export const PORTAL_VIEW_FIELD_LABELS = {
    tabsHidden: 'скрытые вкладки',
    chartsEnabled: 'графики',
    badgesMain: 'основные бейджи',
} as const;
