import {
    isReportViewLabelKey,
    isReportViewPlanColumnCode,
    parseReportViewLabels,
    REPORT_VIEW_LABEL_LIMITS,
    serializeReportViewLabels,
    type ReportViewLabels,
    type ReportViewPlanColumnCode,
} from '@lib/portal-lib/store/app-settings';
import type { PortalViewMessageCode } from './portal-view.const';
import { joinCsvList, parseCsvList, uniqueList } from './portal-view-csv.util';
import type {
    PortalViewChanges,
    PortalViewIndicator,
    PortalViewLabelsState,
    PortalViewSettingValues,
    PortalViewSettingsPatch,
} from './portal-view.types';

/**
 * Свои названия показателей и колонки планов: разбор из настроек, запрос
 * сохранения → изменения и патч ключей. Отдельно от portal-view.util,
 * чтобы тот не разрастался.
 */

type LabelsChanges = Pick<
    PortalViewChanges,
    'plansEvents' | 'plansMerged' | 'plansCallings' | 'planColumnsHidden'
>;

type LabelsSettingsPatch = Pick<
    PortalViewSettingsPatch,
    | 'reportViewLabels'
    | 'reportViewPlansEvents'
    | 'reportViewPlansMerged'
    | 'reportViewPlansCallings'
    | 'reportViewPlanColumnsHidden'
>;

/** Скрытые плановые колонки: только известные коды, без дублей, порядок сохраняется. */
export function normalizePlanColumnsHidden(
    items: readonly string[],
): ReportViewPlanColumnCode[] {
    return uniqueList(items).filter(isReportViewPlanColumnCode);
}

/** Скрытые плановые колонки из строки настройки (как вкладки). */
export function parsePlanColumnsHidden(
    raw: unknown,
): ReportViewPlanColumnCode[] {
    return normalizePlanColumnsHidden(parseCsvList(raw));
}

/** Флаг из настройки: только настоящее «да» включает, остальное — выключено. */
const flagOf = (raw: unknown): boolean => raw === true;

/** Сохранённые ключи → свои названия и колонки планов; незаданное — выключено и пусто. */
export function labelsViewFromSettings(
    values: PortalViewSettingValues,
): PortalViewLabelsState {
    return {
        labels: parseReportViewLabels(values.reportViewLabels),
        plansEvents: flagOf(values.reportViewPlansEvents),
        plansMerged: flagOf(values.reportViewPlansMerged),
        plansCallings: flagOf(values.reportViewPlansCallings),
        planColumnsHidden: parsePlanColumnsHidden(
            values.reportViewPlanColumnsHidden,
        ),
    };
}

/**
 * Что не так со своими названиями из тела запроса (проверка DTO): не
 * объект, слишком много записей, ключ не по шаблону, название не строка
 * или длиннее предела после обрезки пробелов. null — годится. Пустая
 * строка допустима: она убирает своё название показателя.
 */
export function reportViewLabelsProblem(
    value: unknown,
): PortalViewMessageCode | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return 'labelsShape';
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > REPORT_VIEW_LABEL_LIMITS.entries) {
        return 'tooManyLabels';
    }
    if (entries.some(([key]) => !isReportViewLabelKey(key))) {
        return 'labelKey';
    }
    if (entries.some(([, name]) => typeof name !== 'string')) {
        return 'labelsShape';
    }
    return entries.some(
        ([, name]) =>
            (name as string).trim().length >
            REPORT_VIEW_LABEL_LIMITS.nameLength,
    )
        ? 'labelTooLong'
        : null;
}

/**
 * Свои названия запроса → набор для записи: пробелы по краям обрезаны,
 * пустое значение означает «убрать своё название» и в набор не входит.
 */
export function normalizeLabelsChange(
    labels: Readonly<Record<string, string>>,
): ReportViewLabels {
    return Object.fromEntries(
        Object.entries(labels).flatMap(([key, value]) => {
            const name = typeof value === 'string' ? value.trim() : '';
            return name === '' ? [] : [[key, name] as const];
        }),
    );
}

/**
 * Проверка набора перед записью (после normalizeLabelsChange): число
 * записей, длина названий и ключи — только из каталога показателей
 * портала. null — годится.
 */
export function labelsChangeProblem(
    labels: ReportViewLabels,
    indicators: readonly Pick<PortalViewIndicator, 'key'>[],
): PortalViewMessageCode | null {
    const keys = Object.keys(labels);
    if (keys.length > REPORT_VIEW_LABEL_LIMITS.entries) return 'tooManyLabels';
    const tooLong = Object.values(labels).some(
        name => name.length > REPORT_VIEW_LABEL_LIMITS.nameLength,
    );
    if (tooLong) return 'labelTooLong';
    const known = new Set(indicators.map(indicator => indicator.key));
    return keys.every(key => known.has(key)) ? null : 'unknownLabel';
}

/**
 * Значение передано в запросе. null — тоже «не передано»: `@IsOptional`
 * пропускает его без проверки типа, а записывать null в настройку нельзя.
 */
export const isGiven = <T>(value: T | null | undefined): value is T =>
    value !== undefined && value !== null;

/** Флаги и скрытые колонки планов из запроса: только переданные, список нормализован. */
export function planColumnsChanges(request: {
    [K in keyof LabelsChanges]?: LabelsChanges[K] | null;
}): LabelsChanges {
    const { plansEvents, plansMerged, plansCallings, planColumnsHidden } =
        request;
    return {
        ...(isGiven(plansEvents) ? { plansEvents } : {}),
        ...(isGiven(plansMerged) ? { plansMerged } : {}),
        ...(isGiven(plansCallings) ? { plansCallings } : {}),
        ...(isGiven(planColumnsHidden)
            ? {
                  planColumnsHidden:
                      normalizePlanColumnsHidden(planColumnsHidden),
              }
            : {}),
    };
}

/**
 * Изменения своих названий и колонок планов → патч ключей схемы. Только
 * переданные поля; пустые набор и список пишутся пустой строкой.
 */
export function labelsSettingsPatch(
    changes: PortalViewChanges,
): LabelsSettingsPatch {
    return {
        ...(changes.labels === undefined
            ? {}
            : { reportViewLabels: serializeReportViewLabels(changes.labels) }),
        ...(changes.plansEvents === undefined
            ? {}
            : { reportViewPlansEvents: changes.plansEvents }),
        ...(changes.plansMerged === undefined
            ? {}
            : { reportViewPlansMerged: changes.plansMerged }),
        ...(changes.plansCallings === undefined
            ? {}
            : { reportViewPlansCallings: changes.plansCallings }),
        ...(changes.planColumnsHidden === undefined
            ? {}
            : {
                  reportViewPlanColumnsHidden: joinCsvList(
                      changes.planColumnsHidden,
                  ),
              }),
    };
}
