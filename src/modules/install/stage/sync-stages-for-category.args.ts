import { BitrixService } from '@/modules/bitrix';
import { Stage } from '../smart/type/parse.type';

/** Общие аргументы синхронизации стадий воронки (Bitrix `crm.status.*` + `btx_stages`). */
export interface SyncStagesForCategoryArgs {
    bitrix: BitrixService;
    entityTypeId: number;
    bxCategoryId: number;
    portalCategoryId: number;
    stages: Stage[];
}
