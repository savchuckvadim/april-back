/**
 * Маппинг записей crm.stagehistory.list в нормализованные переходы стадий
 * (план Фазы 2, поток 13; план ai-sales-analytics §4.1 «Три единицы
 * анализа»).
 *
 * ⚠ Формы данных Битрикс в чистый слой библиотеки не проникают: модель
 * эпизодов принимает только StageTransition, и превращение
 * IBXStageHistoryItem → StageTransition делается здесь, в приложении.
 *
 * Коды стадий берутся ТОЛЬКО из лестницы portal-lib
 * (PBX_DEAL_SALES_BASE_STAGES): STAGE_ID Битрикса вида `C4:PREPARATION`
 * сводится к коду через runtime-стадии категории портала, неизвестные
 * стадии отбрасываются. Литералов стадий в файле нет (ai/rules/pbx-typing.md).
 */
import type { IBXStageHistoryItem } from '@lib/bitrix/domain/crm/stage-history';
import type { IPCategory } from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    PBX_DEAL_SALES_BASE_STAGES,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import {
    AI_STAGE_SEMANTICS,
    type AiStageSemantic,
    type StageTransition,
} from '@lib/sales-ai-analytics';

/**
 * Портал глазами маппера: нужна только лестница воронки «ОП Основная».
 * Узкий интерфейс вместо PortalModel — маппер остаётся чистой функцией и
 * тестируется без инициализации портала (PortalModel подходит структурно).
 */
export interface StageHistoryPortal {
    getDealCategoryByCode(
        code: PbxDealCategoryCodeEnum,
    ): IPCategory | undefined;
}

/** Стадия лестницы sales_base: код и порядок из as const portal-lib. */
export interface SalesBaseStage {
    readonly code: PbxDealSalesBaseStageCode;
    readonly order: number;
}

/** STAGE_ID и bitrixId стадии → стадия лестницы. */
export type SalesBaseStageDict = ReadonlyMap<string, SalesBaseStage>;

/** Разделитель STAGE_ID воронки: `C{categoryId}:{stageBitrixId}`. */
const STAGE_ID_SEPARATOR = ':';

/** Категория sales_base портала; undefined — воронка не настроена. */
export function salesBaseCategoryOf(
    portal: StageHistoryPortal,
): IPCategory | undefined {
    return portal.getDealCategoryByCode(PbxDealCategoryCodeEnum.sales_base);
}

/**
 * Словарь стадий: на каждую стадию лестницы, настроенную в категории, два
 * ключа — полный STAGE_ID `C{categoryId}:{bitrixId}` и голый bitrixId
 * (воронка по умолчанию отдаёт STAGE_ID без префикса категории).
 */
export function buildSalesBaseStageDict(
    category: IPCategory | undefined,
): SalesBaseStageDict {
    const dict = new Map<string, SalesBaseStage>();
    if (!category) {
        return dict;
    }
    for (const ladder of PBX_DEAL_SALES_BASE_STAGES) {
        const portalStage = category.stages.find(
            stage => stage.code === ladder.code,
        );
        if (!portalStage?.bitrixId) {
            continue;
        }
        const stage: SalesBaseStage = {
            code: ladder.code,
            order: ladder.order,
        };
        dict.set(portalStage.bitrixId, stage);
        dict.set(
            `C${category.bitrixId}${STAGE_ID_SEPARATOR}${portalStage.bitrixId}`,
            stage,
        );
    }

    return dict;
}

/** Семантика записи истории: P — в работе, S — успех, F — провал. */
function semanticOf(value: unknown): AiStageSemantic {
    return AI_STAGE_SEMANTICS.includes(value as AiStageSemantic)
        ? (value as AiStageSemantic)
        : 'P';
}

/** Стадия записи: полный STAGE_ID, иначе часть после `C{id}:`. */
function stageOf(
    stageId: string,
    dict: SalesBaseStageDict,
): SalesBaseStage | undefined {
    const direct = dict.get(stageId);
    if (direct) {
        return direct;
    }
    const separator = stageId.indexOf(STAGE_ID_SEPARATOR);

    return separator < 0 ? undefined : dict.get(stageId.slice(separator + 1));
}

/**
 * Записи истории стадий → переходы. Отбрасываются записи без владельца,
 * без времени и со стадиями вне лестницы sales_base (чужие воронки,
 * удалённые стадии): у них нет ни кода, ни порядка, а значит и эпизода.
 */
export function toStageTransitions(
    items: readonly IBXStageHistoryItem[],
    portal: StageHistoryPortal,
): StageTransition[] {
    return toStageTransitionsByDict(
        items,
        buildSalesBaseStageDict(salesBaseCategoryOf(portal)),
    );
}

/** То же по готовому словарю: загрузчик строит его один раз на прогон. */
export function toStageTransitionsByDict(
    items: readonly IBXStageHistoryItem[],
    dict: SalesBaseStageDict,
): StageTransition[] {
    const transitions: StageTransition[] = [];
    for (const item of items) {
        const stage = stageOf(String(item.STAGE_ID ?? ''), dict);
        const entityId = String(item.OWNER_ID ?? '');
        const at = String(item.CREATED_TIME ?? '');
        if (!stage || !entityId || entityId === '0' || !at) {
            continue;
        }
        transitions.push({
            entityId,
            stageCode: stage.code,
            order: stage.order,
            semantic: semanticOf(item.STAGE_SEMANTIC_ID),
            at,
        });
    }

    return transitions;
}
