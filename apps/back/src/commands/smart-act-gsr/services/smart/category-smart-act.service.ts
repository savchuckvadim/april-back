import { RedisService } from '@/core/redis/redis.service';
import {
    BitrixService,
    IBXCategory,
    IBXItem,
    IBXStatus,
} from '@/modules/bitrix';
import { PBXService } from '@/modules/pbx';
import { IPSmart } from '@lib/portal/interfaces/portal.interface';
import { Injectable } from '@nestjs/common';

export interface ICategorySmartActData {
    category: IBXCategory | null;
    stages: IBXStatus[];
}
export interface IGetStageData {
    stage: IBXStatus | null;
    category: IBXCategory | null;
}
@Injectable()
export class CategorySmartActService {
    private readonly cachePrefix = 'smart-act:category-smart-act';
    private readonly cacheTtlSeconds = 60 * 30;

    constructor(
        private readonly pbx: PBXService,
        private readonly redis: RedisService,
    ) {}
    public isNewStage(item: IBXItem): boolean {
        return item.stageId?.includes('NEW') || false;
    }
    public isSuccessStage(item: IBXItem): boolean {
        return item.stageId?.includes('SUCCESS') || false;
    }
    public isFailStage(item: IBXItem): boolean {
        return item.stageId?.includes('FAIL') || false;
    }
    public async getSmartStageDataForCreate(
        domain: string,
        targetSmart: IPSmart,
    ): Promise<{
        new: IGetStageData;
        inprogress: IGetStageData;
        success: IGetStageData;
    }> {
        return {
            new: await this.getNewStageData(domain, targetSmart),
            inprogress: await this.getInProgressStageData(domain, targetSmart),
            success: await this.getSuccessStageData(domain, targetSmart),
        };
    }

    private async getNewStageData(
        domain: string,
        targetSmart: IPSmart,
    ): Promise<IGetStageData> {
        const stages = await this.getCategorySmartAct(domain, targetSmart);
        if (!stages.category) {
            return {
                stage: null,
                category: null,
            };
        }
        const newStage =
            stages.stages.find(
                stage =>
                    stage.SYSTEM === 'Y' || stage.STATUS_ID?.includes('NEW'),
            ) || null;
        if (!newStage) {
            return {
                stage: null,
                category: null,
            };
        }
        return {
            stage: newStage || null,
            category: stages.category || null,
        };
    }

    private async getInProgressStageData(
        domain: string,
        targetSmart: IPSmart,
    ): Promise<IGetStageData> {
        const stages = await this.getCategorySmartAct(domain, targetSmart);
        if (!stages.category) {
            return {
                stage: null,
                category: null,
            };
        }
        const newStage =
            stages.stages.find(
                stage =>
                    stage.SYSTEM === 'N' || stage.STATUS_ID?.includes('CLIENT'),
            ) || null;
        if (!newStage) {
            return {
                stage: null,
                category: null,
            };
        }
        return {
            stage: newStage || null,
            category: stages.category || null,
        };
    }

    private async getSuccessStageData(
        domain: string,
        targetSmart: IPSmart,
    ): Promise<IGetStageData> {
        const stages = await this.getCategorySmartAct(domain, targetSmart);
        if (!stages.category) {
            return {
                stage: null,
                category: null,
            };
        }
        const successStage =
            stages.stages.find(
                stage =>
                    stage.SEMANTICS === 'S' ||
                    (typeof stage.STATUS_ID === 'string' &&
                        stage.STATUS_ID.includes('SUCCESS')) ||
                    (typeof stage.NAME_INIT === 'string' &&
                        stage.NAME_INIT.includes('Успех')),
            ) || null;
        if (!successStage) {
            return {
                stage: null,
                category: null,
            };
        }
        return {
            stage: successStage || null,
            category: stages.category || null,
        };
    }

    async getCategorySmartAct(
        domain: string,
        targetSmart: IPSmart,
    ): Promise<ICategorySmartActData> {
        const data: ICategorySmartActData = {
            category: null,
            stages: [],
        };
        if (!targetSmart?.entityTypeId) {
            return data;
        }
        const cacheKey = this.getCacheKey(domain, targetSmart.entityTypeId);
        const cached = await this.getCachedData(cacheKey);
        if (cached) {
            return cached;
        }
        const { bitrix } = await this.pbx.init(domain);
        const allCategories = await bitrix.category.getList(
            targetSmart.entityTypeId,
        );
        const currentCategory = allCategories.result.categories[0];
        if (!currentCategory) {
            return data;
        }
        const stages = await this.getStages(
            bitrix,
            currentCategory.id.toString(),
        );
        const result: ICategorySmartActData = {
            category: currentCategory,
            stages: stages.result,
        };
        await this.redis
            .getClient()
            .set(cacheKey, JSON.stringify(result), 'EX', this.cacheTtlSeconds);
        return result;
    }

    private getStages(bitrix: BitrixService, categoryId: string) {
        return bitrix.status.getList({ CATEGORY_ID: categoryId });
    }

    private getCacheKey(domain: string, entityTypeId: number | string): string {
        return `${this.cachePrefix}:${domain}:${String(entityTypeId)}`;
    }

    private async getCachedData(
        cacheKey: string,
    ): Promise<ICategorySmartActData | null> {
        const raw = await this.redis.getClient().get(cacheKey);
        if (!raw) {
            return null;
        }
        try {
            return JSON.parse(raw) as ICategorySmartActData;
        } catch {
            return null;
        }
    }
}

// [
//     {
//       ID: '1649',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:NEW',
//       NAME: 'Начало',
//       NAME_INIT: 'Начало',
//       SORT: '10',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#dbdde0',
//       SEMANTICS: null
//     },
//     {
//       ID: '1651',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:PREPARATION',
//       NAME: 'Запланирован',
//       NAME_INIT: 'Подготовка',
//       SORT: '20',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#7aa5da',
//       SEMANTICS: null
//     },
//     {
//       ID: '1653',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:CLIENT',
//       NAME: 'Выписан',
//       NAME_INIT: 'Согласование',
//       SORT: '30',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#3f8bcd',
//       SEMANTICS: null
//     },
//     {
//       ID: '1659',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_980XQ7',
//       NAME: 'У клиента',
//       NAME_INIT: '',
//       SORT: '31',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#0052a7',
//       SEMANTICS: null
//     },
//     {
//       ID: '1663',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_PATLI3',
//       NAME: 'Оплачен',
//       NAME_INIT: '',
//       SORT: '32',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#922091',
//       SEMANTICS: null
//     },
//     {
//       ID: '1655',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:SUCCESS',
//       NAME: 'Сдан',
//          : 'Успех',
//       SORT: '40',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#00ff00',
//       SEMANTICS: 'S'
//     },
//     {
//       ID: '1657',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:FAIL',
//       NAME: 'Отказ',
//       NAME_INIT: 'Провал',
//       SORT: '50',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#ff0000',
//       SEMANTICS: 'F'
//     },
//     {
//       ID: '1661',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       NAME: 'Не состоялся',
//       NAME_INIT: '',
//       SORT: '51',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#000000',
//       SEMANTICS: 'F'
//     }
//   ],
//   total: 8,
//   time: {
//     start: 1777382267,
//     finish: 1777382267.330735,
//     duration: 0.3307349681854248,
//     processing: 0,
//     date_start: '2026-04-28T16:17:47+03:00',
//     date_finish: '2026-04-28T16:17:47+03:00',
//     operating_reset_at: 1777382867,
//     operating: 0
//   }
// }
// categorySmartActData {
//   category: {
//     id: 21,
//     name: 'Общая',
//     sort: 500,
//     entityTypeId: 1044,
//     isDefault: 'Y'
//   },
//   stages: [
//     {
//       ID: '1649',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:NEW',
//       NAME: 'Начало',
//       NAME_INIT: 'Начало',
//       SORT: '10',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#dbdde0',
//       SEMANTICS: null
//     },
//     {
//       ID: '1651',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:PREPARATION',
//       NAME: 'Запланирован',
//       NAME_INIT: 'Подготовка',
//       SORT: '20',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#7aa5da',
//       SEMANTICS: null
//     },
//     {
//       ID: '1653',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:CLIENT',
//       NAME: 'Выписан',
//       NAME_INIT: 'Согласование',
//       SORT: '30',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#3f8bcd',
//       SEMANTICS: null
//     },
//     {
//       ID: '1659',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_980XQ7',
//       NAME: 'У клиента',
//       NAME_INIT: '',
//       SORT: '31',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#0052a7',
//       SEMANTICS: null
//     },
//     {
//       ID: '1663',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_PATLI3',
//       NAME: 'Оплачен',
//       NAME_INIT: '',
//       SORT: '32',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#922091',
//       SEMANTICS: null
//     },
//     {
//       ID: '1655',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:SUCCESS',
//       NAME: 'Сдан',
//       NAME_INIT: 'Успех',
//       SORT: '40',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#00ff00',
//       SEMANTICS: 'S'
//     },
//     {
//       ID: '1657',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:FAIL',
//       NAME: 'Отказ',
//       NAME_INIT: 'Провал',
//       SORT: '50',
//       SYSTEM: 'Y',
//       CATEGORY_ID: '21',
//       COLOR: '#ff0000',
//       SEMANTICS: 'F'
//     },
//     {
//       ID: '1661',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       SEMANTICS: 'F'
//     },
//     {
//       ID: '1661',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//     },
//     {
//       ID: '1661',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       ID: '1661',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       ENTITY_ID: 'DYNAMIC_1044_STAGE_21',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       STATUS_ID: 'DT1044_21:UC_9GNZVU',
//       NAME: 'Не состоялся',
//       NAME_INIT: '',
//       SORT: '51',
//       SYSTEM: 'N',
//       CATEGORY_ID: '21',
//       COLOR: '#000000',
//       SEMANTICS: 'F'
//     }
//   ]
