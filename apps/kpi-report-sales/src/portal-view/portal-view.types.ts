import type {
    EnumPortalAppCode,
    PortalAppSettingsPatch,
    PortalAppSettingsValues,
    ReportViewLabels,
    ReportViewPlanColumnCode,
    ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import type {
    PortalViewBadgeGroup,
    PortalViewIndicatorGroup,
} from './portal-view.const';

type KpiSalesSettings = PortalAppSettingsValues<
    typeof EnumPortalAppCode.kpiSales
>;

/** Ключи схемы `[kpiSales]`, из которых собирается вид отчёта. */
export const PORTAL_VIEW_SETTING_KEYS = [
    'reportViewTabsHidden',
    'reportViewChartsEnabled',
    'reportViewBadgesMain',
    'reportViewLabels',
    'reportViewPlansEvents',
    'reportViewPlansMerged',
    'reportViewPlansCallings',
    'reportViewPlanColumnsHidden',
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

/**
 * Свои названия показателей и колонки планов в таблицах отчёта — часть
 * вида отчёта, которую разбирает и собирает portal-view-labels.util.
 */
export interface PortalViewLabelsState {
    /** Свои названия: ключ показателя (`ev:`/`call:`/`plan:` и код) → название. */
    labels: ReportViewLabels;
    /** Колонки планов на вкладках «Все» и «События». */
    plansEvents: boolean;
    /** Колонки планов в «Объединённом отчёте». */
    plansMerged: boolean;
    /** Колонки планов на вкладке «Звонки». */
    plansCallings: boolean;
    /** Плановые показатели, чью колонку не выводить: известные коды, без дублей. */
    planColumnsHidden: ReportViewPlanColumnCode[];
}

/**
 * Вид отчёта портала: что скрыто, графики, основные бейджи списка
 * разборов, свои названия показателей и колонки планов.
 */
export interface PortalViewState extends PortalViewLabelsState {
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
export interface PortalViewChanges extends Partial<PortalViewLabelsState> {
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

/**
 * Показатель отчёта, которому можно задать своё название: колонка событий,
 * бакет звонков или колонка плана.
 */
export interface PortalViewIndicator {
    /** Ключ своего названия: `ev:<innerCode>`, `call:<id>`, `plan:<код>`. */
    key: string;
    group: PortalViewIndicatorGroup;
    /** Исходное название, как в отчёте (лишние пробелы убраны). */
    name: string;
    /** У колонки плана — ключ показателя-факта; у остальных — null. */
    factKey: string | null;
}

export interface PortalViewOptions {
    tabs: PortalViewTabOption[];
    badges: PortalViewBadgeOption[];
    methodology: PortalViewMethodologyInfo | null;
    /** Каталог показателей портала для своих названий и колонок планов. */
    indicators: PortalViewIndicator[];
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
