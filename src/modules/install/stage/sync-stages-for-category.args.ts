import { BitrixService } from '@/modules/bitrix';
import { Stage } from '../shared';
import { BitrixCategoryStageStrategy } from '../category';

/**
 * Общие аргументы синхронизации стадий воронки (Bitrix `crm.status.*` + `btx_stages`).
 *
 * `strategy` отвечает за форматы `ENTITY_ID` / `STATUS_ID` и за резолв `SEMANTICS`,
 * которые различаются у смартов, сделок и RPA. Сам алгоритм синка от него не зависит.
 */
export interface SyncStagesForCategoryArgs {
    bitrix: BitrixService;
    entityTypeId: number;
    bxCategoryId: number;
    portalCategoryId: number;
    stages: Stage[];
    strategy: BitrixCategoryStageStrategy;
}
