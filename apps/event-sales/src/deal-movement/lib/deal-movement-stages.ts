import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import {
    PBX_DEAL_SALES_BASE_STAGES,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import { scalarText } from '../../event-report/services/entity/scalar-text.util';

/** Стадия лестницы «ОП Основная»: код и порядок из portal-lib. */
export interface SalesBaseStageRef {
    readonly code: PbxDealSalesBaseStageCode;
    readonly order: number;
}

/** STAGE_ID Битрикса и bitrixId стадии → ступень лестницы. */
export type SalesBaseStageLookup = ReadonlyMap<string, SalesBaseStageRef>;

/** Разделитель STAGE_ID воронки: `C{categoryId}:{stageBitrixId}`. */
const STAGE_ID_SEPARATOR = ':';

/**
 * Словарь стадий категории: на каждую ступень лестницы, настроенную на
 * портале, два ключа — полный STAGE_ID `C{id}:{bitrixId}` и голый bitrixId
 * (у воронки по умолчанию префикса нет). Коды — только из лестницы
 * portal-lib, литералов стадий нет (ai/rules/pbx-typing.md); тот же приём,
 * что у истории стадий AI-аналитики.
 */
export function buildSalesBaseStageLookup(
    category: Pick<IPCategory, 'bitrixId' | 'stages'>,
): SalesBaseStageLookup {
    const lookup = new Map<string, SalesBaseStageRef>();
    for (const ladder of PBX_DEAL_SALES_BASE_STAGES) {
        const portalStage = category.stages.find(
            stage => stage.code === ladder.code,
        );
        if (!portalStage?.bitrixId) continue;
        const stage: SalesBaseStageRef = {
            code: ladder.code,
            order: ladder.order,
        };
        lookup.set(String(portalStage.bitrixId), stage);
        lookup.set(
            `C${category.bitrixId}${STAGE_ID_SEPARATOR}${portalStage.bitrixId}`,
            stage,
        );
    }
    return lookup;
}

/** Ступень по STAGE_ID: полный ключ, иначе часть после `C{id}:`; чужая — null. */
export function resolveSalesBaseStage(
    raw: unknown,
    lookup: SalesBaseStageLookup,
): SalesBaseStageRef | null {
    const value = scalarText(raw);
    if (!value) return null;
    const direct = lookup.get(value);
    if (direct) return direct;
    const separator = value.indexOf(STAGE_ID_SEPARATOR);
    return separator < 0
        ? null
        : (lookup.get(value.slice(separator + 1)) ?? null);
}
