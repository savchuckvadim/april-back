import { isCallBadgeId } from '@lib/sales-ai-analytics';
import {
    isReportViewTabCode,
    type ReportViewTabCode,
} from '@lib/portal-lib/store/app-settings';
import { AI_ANALYTICS_LEADER_ROLES } from '../ai-analytics/constants/ai-analytics.const';
import type { RequesterAccess } from '../ai-analytics/domain/access/requester-access.service';
import {
    PORTAL_VIEW_BADGE_ID_PATTERN,
    PORTAL_VIEW_FIELD_LABELS,
    PORTAL_VIEW_LIMITS,
    PORTAL_VIEW_METHODOLOGY_PREFIX,
} from './portal-view.const';
import type {
    PortalViewChanges,
    PortalViewSettingValues,
    PortalViewSettingsPatch,
    PortalViewStamp,
    PortalViewState,
} from './portal-view.types';

/** Список без повторов, порядок первого появления сохраняется. */
export function uniqueList<T>(items: readonly T[]): T[] {
    return [...new Set(items)];
}

/**
 * Список из строки через запятую: пробелы по краям и пустые элементы
 * отбрасываются, повторы схлопываются. Не строка (чужой тип в настройке) —
 * пустой список.
 */
export function parseCsvList(raw: unknown): string[] {
    if (typeof raw !== 'string') return [];
    return uniqueList(
        raw
            .split(',')
            .map(item => item.trim())
            .filter(item => item !== ''),
    );
}

/** Список → строка через запятую (как хранится в настройке). */
export function joinCsvList(items: readonly string[]): string {
    return items.join(',');
}

/** Приставка «m:» — бейдж пункта методики, а не общий. */
export function isMethodologyBadgeId(id: string): boolean {
    return id.startsWith(PORTAL_VIEW_METHODOLOGY_PREFIX);
}

/** Идентификатор бейджа пункта методики по коду пункта. */
export function methodologyBadgeId(pointCode: string): string {
    return `${PORTAL_VIEW_METHODOLOGY_PREFIX}${pointCode}`;
}

/**
 * Годится ли строка как идентификатор основного бейджа: формат и длина
 * по правилам запроса, общий бейдж — ещё и из справочника. Пункт
 * методики («m:…») проверяется только по формату: методика портала может
 * смениться, а выбранный пункт — исчезнуть.
 */
export function isKnownBadgeId(id: string): boolean {
    if (id.length > PORTAL_VIEW_LIMITS.badgeIdLength) return false;
    if (!PORTAL_VIEW_BADGE_ID_PATTERN.test(id)) return false;
    return isMethodologyBadgeId(id) || isCallBadgeId(id);
}

/** Общие идентификаторы (без «m:»), которых нет в справочнике бейджей. */
export function unknownGeneralBadgeIds(ids: readonly string[]): string[] {
    return ids.filter(id => !isMethodologyBadgeId(id) && !isCallBadgeId(id));
}

/** Список вкладок: только известные коды, без дублей, порядок сохраняется. */
export function normalizeTabsHidden(
    items: readonly string[],
): ReportViewTabCode[] {
    return uniqueList(items).filter(isReportViewTabCode);
}

/** Скрытые вкладки из строки настройки: только известные коды, без дублей. */
export function parseTabsHidden(raw: unknown): ReportViewTabCode[] {
    return normalizeTabsHidden(parseCsvList(raw));
}

/** Основные бейджи из строки настройки: известные идентификаторы по порядку. */
export function parseBadgesMain(raw: unknown): string[] {
    return parseCsvList(raw)
        .filter(isKnownBadgeId)
        .slice(0, PORTAL_VIEW_LIMITS.badges);
}

/** Строка настройки → непустой текст либо null. */
function textOrNull(raw: unknown): string | null {
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : null;
}

/** Строка настройки → ISO-дата либо null (пусто и нечитаемое — «не меняли»). */
function isoOrNull(raw: unknown): string | null {
    const text = textOrNull(raw);
    if (text === null) return null;
    const time = Date.parse(text);
    return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/** Сохранённые ключи схемы → вид отчёта. Незаданное — значения по умолчанию. */
export function viewFromSettings(
    values: PortalViewSettingValues,
): PortalViewState {
    return {
        tabsHidden: parseTabsHidden(values.reportViewTabsHidden),
        chartsEnabled:
            typeof values.reportViewChartsEnabled === 'boolean'
                ? values.reportViewChartsEnabled
                : true,
        badgesMain: parseBadgesMain(values.reportViewBadgesMain),
        updatedBy: textOrNull(values.reportViewUpdatedBy),
        updatedAt: isoOrNull(values.reportViewUpdatedAt),
    };
}

/** Задано ли в запросе хоть одно поле для изменения. */
export function hasChanges(changes: PortalViewChanges): boolean {
    return changeFields(changes).length > 0;
}

/** Подписи изменяемых полей — для строки журнала. */
export function changeFields(changes: PortalViewChanges): string[] {
    return (
        Object.keys(PORTAL_VIEW_FIELD_LABELS) as (keyof PortalViewChanges)[]
    )
        .filter(field => changes[field] !== undefined)
        .map(field => PORTAL_VIEW_FIELD_LABELS[field]);
}

/**
 * Запрос сохранения → патч ключей схемы. Только переданные поля плюс
 * служебные «кто» и «когда»; пустой список пишется пустой строкой (явное
 * «ничего не скрыто» / «набор по умолчанию»).
 */
export function toSettingsPatch(
    changes: PortalViewChanges,
    stamp: PortalViewStamp,
): PortalViewSettingsPatch {
    return {
        ...(changes.tabsHidden !== undefined
            ? { reportViewTabsHidden: joinCsvList(changes.tabsHidden) }
            : {}),
        ...(changes.chartsEnabled !== undefined
            ? { reportViewChartsEnabled: changes.chartsEnabled }
            : {}),
        ...(changes.badgesMain !== undefined
            ? { reportViewBadgesMain: joinCsvList(changes.badgesMain) }
            : {}),
        reportViewUpdatedBy: stamp.updatedBy,
        reportViewUpdatedAt: stamp.updatedAt,
    };
}

/**
 * Вправе ли пользователь менять вид отчёта: руководитель группы и выше
 * (cup, op, group) либо суперпользователь вендора. Читать может любой.
 */
export function mayEditView(
    access: Pick<RequesterAccess, 'role' | 'isSuperUser'>,
): boolean {
    return (
        access.isSuperUser === true ||
        (AI_ANALYTICS_LEADER_ROLES as readonly string[]).includes(access.role)
    );
}

/** Подпись сотрудника, когда имя из Битрикса не прочитано. */
export function fallbackAuthorName(userId: string): string {
    return `Сотрудник № ${userId.trim()}`;
}

/**
 * Адрес чата поддержки из настройки: только полный http(s)-адрес, иначе
 * null (кнопки нет). Возвращается как задан, без нормализации.
 */
export function supportUrlOf(raw: string | null | undefined): string | null {
    const text = (raw ?? '').trim();
    if (text === '') return null;
    try {
        const { protocol } = new URL(text);
        return protocol === 'https:' || protocol === 'http:' ? text : null;
    } catch {
        return null;
    }
}
