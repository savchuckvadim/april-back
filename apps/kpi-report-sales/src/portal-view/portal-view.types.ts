import type {
    EnumPortalAppCode,
    PortalAppSettingsPatch,
    PortalAppSettingsValues,
    ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import type { PortalViewBadgeGroup } from './portal-view.const';

type KpiSalesSettings = PortalAppSettingsValues<
    typeof EnumPortalAppCode.kpiSales
>;

/** Ключи схемы `[kpiSales]`, из которых собирается вид отчёта. */
export const PORTAL_VIEW_SETTING_KEYS = [
    'reportViewTabsHidden',
    'reportViewChartsEnabled',
    'reportViewBadgesMain',
    'reportViewUpdatedBy',
    'reportViewUpdatedAt',
] as const;

/** Сохранённые значения вида отчёта (как их отдаёт PortalAppSettingsService). */
export type PortalViewSettingValues = Pick<
    KpiSalesSettings,
    (typeof PORTAL_VIEW_SETTING_KEYS)[number]
>;

/** Патч ключей вида отчёта для PortalAppSettingsService.save. */
export type PortalViewSettingsPatch = Pick<
    PortalAppSettingsPatch<typeof EnumPortalAppCode.kpiSales>,
    (typeof PORTAL_VIEW_SETTING_KEYS)[number]
>;

/** Вид отчёта портала: что скрыто, графики и основные бейджи списка разборов. */
export interface PortalViewState {
    /** Скрытые вкладки: только известные коды, без дублей. */
    tabsHidden: ReportViewTabCode[];
    chartsEnabled: boolean;
    /** Идентификаторы основных бейджей в порядке показа; пусто — набор по умолчанию. */
    badgesMain: string[];
    /** «Фамилия Имя» того, кто менял последним; null — не меняли. */
    updatedBy: string | null;
    /** Когда меняли последний раз (ISO); null — не меняли. */
    updatedAt: string | null;
}

/** Какие поля вида отчёта меняет запрос сохранения (отсутствует — не трогать). */
export interface PortalViewChanges {
    tabsHidden?: ReportViewTabCode[];
    chartsEnabled?: boolean;
    badgesMain?: string[];
}

/** Кто и когда сохранил: пишется в служебные ключи вида отчёта. */
export interface PortalViewStamp {
    updatedBy: string;
    updatedAt: string;
}

export interface PortalViewTabOption {
    code: string;
    name: string;
    /** Вкладку видят все сотрудники: хотя бы одна такая остаётся видимой. */
    common: boolean;
}

export interface PortalViewBadgeOption {
    id: string;
    title: string;
    hint: string | null;
    group: PortalViewBadgeGroup;
    callTypes: string[];
    mainByDefault: boolean;
}

export interface PortalViewMethodologyInfo {
    code: string;
    title: string;
}

export interface PortalViewOptions {
    tabs: PortalViewTabOption[];
    badges: PortalViewBadgeOption[];
    methodology: PortalViewMethodologyInfo | null;
}

/** Пункт методики, как его отдаёт источник пунктов списка разборов. */
export interface PortalViewPointDef {
    code: string;
    /** Короткая подпись плашки. */
    label: string;
    /** Полная формулировка пункта. */
    title: string;
    callTypes: readonly string[];
    main: boolean;
}

/** Действующая методика портала и её пункты (контракт CallListPointsProvider). */
export interface PortalViewPointsSnapshot {
    methodology: PortalViewMethodologyInfo | null;
    defs: readonly PortalViewPointDef[];
}
