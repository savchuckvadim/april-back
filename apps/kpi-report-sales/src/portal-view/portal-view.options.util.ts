import { REPORT_VIEW_TABS } from '@lib/portal-lib/store/app-settings';
import { CALL_BADGES } from '@lib/sales-ai-analytics';
import type {
    PortalViewBadgeOption,
    PortalViewIndicator,
    PortalViewOptions,
    PortalViewPointDef,
    PortalViewPointsSnapshot,
    PortalViewTabOption,
} from './portal-view.types';
import { methodologyBadgeId } from './portal-view.util';

/**
 * Вкладки, которые можно скрыть. `common` — вкладку видят все сотрудники:
 * хотя бы одна такая должна оставаться видимой.
 */
export function buildTabOptions(): PortalViewTabOption[] {
    return REPORT_VIEW_TABS.map(({ code, name, common }) => ({
        code,
        name,
        common,
    }));
}

/** Общие бейджи справочника: подпись, подсказка и «основной» — как в справочнике. */
export function buildGeneralBadgeOptions(): PortalViewBadgeOption[] {
    return CALL_BADGES.map(badge => ({
        id: badge.id,
        title: badge.title,
        hint: badge.hint,
        group: 'general',
        callTypes: [],
        mainByDefault: badge.main,
    }));
}

/** Пункт методики → вариант бейджа: подпись — короткая, подсказка — полная формулировка. */
function pointBadgeOption(point: PortalViewPointDef): PortalViewBadgeOption {
    const hint = point.title.trim();
    return {
        id: methodologyBadgeId(point.code),
        title: point.label.trim() || hint || point.code,
        hint: hint === '' ? null : hint,
        group: 'methodology',
        callTypes: [...point.callTypes],
        mainByDefault: point.main,
    };
}

/**
 * Варианты страницы настроек: вкладки, общие бейджи, затем пункты методики
 * портала; каталог показателей портала для своих названий и колонок планов.
 */
export function buildViewOptions(
    points: PortalViewPointsSnapshot,
    indicators: readonly PortalViewIndicator[],
): PortalViewOptions {
    return {
        tabs: buildTabOptions(),
        badges: [
            ...buildGeneralBadgeOptions(),
            ...points.defs.map(pointBadgeOption),
        ],
        methodology: points.methodology,
        indicators: [...indicators],
    };
}
