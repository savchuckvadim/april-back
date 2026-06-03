import { PbxEntityTypePrisma } from '@/shared/enums';
import { Stage } from '../../shared';

/**
 * Указатель на «владельца» воронок в портальной БД (`btx_categories.entity_*`).
 *
 * - Для смарта: `{ entityType: SMART, entityDbId: btx_smarts.id, parentType: 'smart' }`.
 * - Для сделки: `{ entityType: DEAL, entityDbId: btx_deals.id, parentType: 'deal' }`.
 *   В Bitrix отдельной строки «сделка-владелец» нет — строка в БД нужна только как якорь
 *   для связи `btx_categories → btx_deals`.
 * - Для RPA (на будущее): `{ entityType: BTX_RPA, entityDbId: btx_rpa.id, parentType: 'rpa' }`.
 */
export interface InstallCategoryParent {
    entityType: PbxEntityTypePrisma;
    entityDbId: bigint;
    parentType: string;
}

/**
 * Стратегия Bitrix-идентификаторов для пары (категория, стадия) и резолва семантики стадии.
 *
 * Алгоритм синхронизации (`InstallCategorySyncService`, `InstallStageSyncService`) общий
 * для смарта/сделки/RPA, а вот форматы `ENTITY_ID`/`STATUS_ID` и источник `SEMANTICS`
 * у них различаются — это вынесено сюда.
 */
export interface BitrixCategoryStageStrategy {
    /**
     * `ENTITY_ID` для `crm.status.*` под одну воронку.
     * - smart: `DYNAMIC_<entityTypeId>_STAGE_<bxCategoryId>`
     * - deal:  `DEAL_STAGE` (default-воронка, id=0) или `DEAL_STAGE_<bxCategoryId>`
     */
    statusEntityId(entityTypeId: number, bxCategoryId: number): string;

    /**
     * Полный `STATUS_ID` одной стадии в Bitrix.
     * - smart: `DT<entityTypeId>_<bxCategoryId>:<bitrixId>`
     * - deal:  `<bitrixId>` для default-воронки, `C<bxCategoryId>:<bitrixId>` для остальных
     */
    statusId(
        entityTypeId: number,
        bxCategoryId: number,
        bitrixId: string,
    ): string;

    /**
     * CamelCase-id категории для зеркала в `btx_categories.bitrixCamelId`.
     * - smart: `DT<entityTypeId>_<bxCategoryId>`
     * - deal:  `<bxCategoryId>`
     */
    categoryCamelId(entityTypeId: number, bxCategoryId: number): string;

    /**
     * Семантика стадии (`SEMANTICS` в `crm.status.add/update`): `'S' | 'F' | '' (по умолчанию)`.
     * - smart: эвристика по `bitrixId` (SUCCESS/FAIL/...) + fallback по `code`.
     * - deal:  уже распаршено в `stage.type` (`'P' | 'S' | 'F'`); `'P'` нормализуем в пустую строку.
     */
    resolveStageSemantics(stage: Stage): string;
}
