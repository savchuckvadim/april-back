/**
 * Фикстуры истории стадий (план Фазы 2, поток 13): портал с настроенной
 * воронкой sales_base, записи crm.stagehistory.list по нескольким сделкам,
 * строки звонков для шины и записи `ais` с сущностью звонка.
 *
 * Коды стадий — только из PBX_DEAL_SALES_BASE_STAGE_CODE: в фикстурах, как
 * и в рабочем коде, литералов стадий нет.
 */
import type {
    IPCategory,
    IStage,
} from '@lib/portal-lib/portal/interfaces/portal.interface';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    PBX_DEAL_SALES_BASE_STAGE_CODE,
    type PbxDealSalesBaseStageCode,
} from '@lib/portal-lib/pbx-domain/portal-deal/sales/base/const/pbx-deal-sales-base-stages.const';
import type { IBXStageHistoryItem } from '@lib/bitrix/domain/crm/stage-history';
import type { StageHistoryPortal } from '../../domain/loaders/stage-history.mapper';

const STAGE = PBX_DEAL_SALES_BASE_STAGE_CODE;

/** Идентификатор воронки «ОП Основная» на портале фикстуры. */
export const FIXTURE_CATEGORY_ID = 4;

/** bitrixId стадий портала: код лестницы → идентификатор Битрикса. */
export const FIXTURE_STAGE_BITRIX_IDS: Readonly<
    Partial<Record<PbxDealSalesBaseStageCode, string>>
> = {
    [STAGE.new]: 'NEW',
    [STAGE.presentation]: 'PRESENT',
    [STAGE.documentSend]: 'DOCS',
    [STAGE.success]: 'WON',
    [STAGE.fail]: 'LOSE',
};

function stage(code: PbxDealSalesBaseStageCode, index: number): IStage {
    return {
        id: index,
        created_at: '2026-01-01T00:00:00+03:00',
        updated_at: '2026-01-01T00:00:00+03:00',
        btx_category_id: FIXTURE_CATEGORY_ID,
        name: code,
        title: code,
        code,
        bitrixId: FIXTURE_STAGE_BITRIX_IDS[code] ?? code,
        color: '#000000',
        isActive: 1,
    };
}

/** Категория sales_base с настроенными стадиями лестницы. */
export const FIXTURE_SALES_BASE_CATEGORY: IPCategory = {
    id: 1,
    type: 'deal',
    group: 'sales',
    name: PbxDealCategoryCodeEnum.sales_base,
    title: 'ОП Основная',
    bitrixId: String(FIXTURE_CATEGORY_ID),
    bitrixCamelId: String(FIXTURE_CATEGORY_ID),
    code: PbxDealCategoryCodeEnum.sales_base,
    isActive: 1,
    entity_id: 1,
    entity_type: 'deal',
    parent_type: 'deal',
    stages: Object.keys(FIXTURE_STAGE_BITRIX_IDS).map((code, index) =>
        stage(code as PbxDealSalesBaseStageCode, index + 1),
    ),
};

/**
 * Портал глазами маппера: отдаёт категорию sales_base и ничего больше.
 * `null` — воронка на портале не настроена (проверка деградации).
 */
export const stageHistoryPortal = (
    category: IPCategory | null = FIXTURE_SALES_BASE_CATEGORY,
): StageHistoryPortal => ({
    getDealCategoryByCode: (code: PbxDealCategoryCodeEnum) =>
        code === PbxDealCategoryCodeEnum.sales_base
            ? (category ?? undefined)
            : undefined,
});

let nextId = 1;

/** Запись истории стадий: STAGE_ID собирается как `C{categoryId}:{bitrixId}`. */
export function stageHistoryItem(
    ownerId: number,
    code: PbxDealSalesBaseStageCode,
    createdTime: string,
    overrides: Partial<IBXStageHistoryItem> = {},
): IBXStageHistoryItem {
    const semantic =
        code === STAGE.success ? 'S' : code === STAGE.fail ? 'F' : 'P';

    return {
        ID: nextId++,
        TYPE_ID: 2,
        OWNER_ID: ownerId,
        CREATED_TIME: createdTime,
        CATEGORY_ID: FIXTURE_CATEGORY_ID,
        STAGE_SEMANTIC_ID: semantic,
        STAGE_ID: `C${FIXTURE_CATEGORY_ID}:${
            FIXTURE_STAGE_BITRIX_IDS[code] ?? code
        }`,
        ...overrides,
    };
}

/** Момент расчёта фикстуры: 1 сентября 2026, тот же час, что у переходов. */
export const FIXTURE_NOW = '2026-09-01T10:00:00+03:00';

/**
 * Четыре сделки с известными исходами:
 * 101 — продажа, 102 — отказ, 103 — открыта (цензура), 104 — продажа.
 * Размах истории: 02.03.2026 … 20.06.2026 — больше трёх месяцев.
 */
export const STAGE_HISTORY_ITEMS: IBXStageHistoryItem[] = [
    stageHistoryItem(104, STAGE.new, '2026-03-02T10:00:00+03:00'),
    stageHistoryItem(104, STAGE.presentation, '2026-03-20T10:00:00+03:00'),
    stageHistoryItem(104, STAGE.success, '2026-04-05T10:00:00+03:00'),
    stageHistoryItem(103, STAGE.new, '2026-05-01T10:00:00+03:00'),
    stageHistoryItem(103, STAGE.presentation, '2026-05-11T10:00:00+03:00'),
    stageHistoryItem(101, STAGE.new, '2026-06-01T10:00:00+03:00'),
    stageHistoryItem(101, STAGE.presentation, '2026-06-03T10:00:00+03:00'),
    stageHistoryItem(101, STAGE.success, '2026-06-10T10:00:00+03:00'),
    stageHistoryItem(102, STAGE.new, '2026-06-02T10:00:00+03:00'),
    stageHistoryItem(102, STAGE.presentation, '2026-06-05T10:00:00+03:00'),
    stageHistoryItem(102, STAGE.fail, '2026-06-20T10:00:00+03:00'),
];

/**
 * Сделка 105: продана 20.04, а 25.04 вернулась на презентацию — метка
 * активности позже даты закрытия (плацебо-тест меток времени, §4.4).
 */
export const REOPENED_SALE_ITEMS: IBXStageHistoryItem[] = [
    stageHistoryItem(105, STAGE.new, '2026-04-01T10:00:00+03:00'),
    stageHistoryItem(105, STAGE.presentation, '2026-04-10T10:00:00+03:00'),
    stageHistoryItem(105, STAGE.success, '2026-04-20T10:00:00+03:00'),
    stageHistoryItem(105, STAGE.presentation, '2026-04-25T10:00:00+03:00'),
];

/** Страница ответа crm.stagehistory.list вне батча. */
export const stageHistoryPage = (
    items: readonly IBXStageHistoryItem[],
): { result: { items: IBXStageHistoryItem[] } } => ({
    result: { items: [...items] },
});

/** Чанк батча: под ключом команды — результат метода `{ items }`. */
export function stageHistoryChunk(
    byCmd: Readonly<Record<string, readonly IBXStageHistoryItem[]>>,
): { result: Record<string, { items: IBXStageHistoryItem[] }> } {
    const result: Record<string, { items: IBXStageHistoryItem[] }> = {};
    for (const [cmd, items] of Object.entries(byCmd)) {
        result[cmd] = { items: [...items] };
    }

    return { result };
}

/** n записей истории подряд одной сделки — для проверки курсора. */
export function stageHistoryPageOf(
    count: number,
    fromId: number,
): IBXStageHistoryItem[] {
    return Array.from({ length: count }, (_, index) =>
        stageHistoryItem(200 + index, STAGE.new, '2026-06-01T10:00:00+03:00', {
            ID: fromId + index,
        }),
    );
}
