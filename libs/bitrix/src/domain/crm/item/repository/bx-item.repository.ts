// import { BitrixBaseApi } from "src/modules/bitrix/core/base/bitrix-base-api";
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import {
    EBxMethod,
    EBxNamespace,
} from '../../../../core/domain/consts/bitrix-api.enum';
import { EBXEntity } from '../../../../core/domain/consts/bitrix-entities.enum';
import { IBXItem } from '../interface/item.interface';
import { BitrixOwnerTypeId } from '../../../enums/bitrix-constants.enum';

export class BxItemRepository {
    constructor(private readonly bxApi: BitrixBaseApi) {}

    async update(
        id: number | string,
        entityTypeId: BitrixOwnerTypeId.DEAL,
        data: Partial<IBXItem>,
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.UPDATE,
            { id: id, entityTypeId, fields: data },
        );
    }

    updateBtch(
        cmdCode: string,
        id: number | string,
        entityTypeId: BitrixOwnerTypeId.DEAL,
        data: { [key: string]: any },
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.UPDATE,
            { id: id, entityTypeId, fields: data },
        );
    }

    async list(
        entityTypeId: string,
        filter?: Partial<IBXItem>,
        select?: string[],
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.LIST,
            { entityTypeId, filter, select },
        );
    }

    /**
     * Возвращает ВСЕ элементы смарт-процесса, листая страницы по 50 (предел crm.item.list).
     * Пагинация курсором по id (filter['>id'] + order id ASC, start: -1) — без этого
     * для длинных выборок (>50) видна только первая страница.
     */
    async listAll(
        entityTypeId: string,
        filter: Partial<IBXItem> = {},
        select?: string[],
    ): Promise<IBXItem[]> {
        const PAGE_SIZE = 50;
        const items: IBXItem[] = [];
        let lastId: number | undefined;
        let hasMore = true;
        while (hasMore) {
            const cursorFilter: Partial<IBXItem> =
                lastId == null ? filter : { ...filter, '>id': lastId };
            const page = await this.bxApi.callType(
                EBxNamespace.CRM,
                EBXEntity.ITEM,
                EBxMethod.LIST,
                {
                    entityTypeId,
                    filter: cursorFilter,
                    select,
                    order: { id: 'ASC' },
                    start: -1,
                },
            );
            const pageItems = page?.result?.items ?? [];
            for (const item of pageItems) {
                items.push(item);
                const numericId = Number(item.id);
                if (Number.isFinite(numericId)) {
                    lastId = numericId;
                }
            }
            hasMore = pageItems.length >= PAGE_SIZE;
        }
        return items;
    }

    async get(id: number | string, entityTypeId: string, select?: string[]) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.GET,
            { id, entityTypeId, select },
        );
    }
    getBtch(
        cmdCode: string,
        id: number | string,
        entityTypeId: string,
        select?: string[],
    ) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.GET,
            { id, entityTypeId, select },
        );
    }

    async add(entityTypeId: string, data: Partial<IBXItem>) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.ADD,
            { entityTypeId, fields: data },
        );
    }
    addBtch(cmdCode: string, entityTypeId: string, data: Partial<IBXItem>) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.ADD,
            { entityTypeId, fields: data },
        );
    }
    async delete(id: number | string, entityTypeId: string) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.DELETE,
            { id, entityTypeId },
        );
    }
    deleteBtch(cmdCode: string, id: number | string, entityTypeId: string) {
        return this.bxApi.addCmdBatchType(
            cmdCode,
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.DELETE,
            { id, entityTypeId },
        );
    }

    /**
     * crm.item.fields: ключи ответа — фактические camel-имена полей.
     *
     * `useOriginalUfNames: 'Y'` возвращает оригинальные UF-имена — их ждут
     * те, кто адресует поле именем (портальные анкеты), потому что
     * camelCase-ключом в CRM не записать.
     */
    async fields(
        entityTypeId: number | string,
        useOriginalUfNames?: 'Y' | 'N',
    ) {
        return this.bxApi.callType(
            EBxNamespace.CRM,
            EBXEntity.ITEM,
            EBxMethod.FIELDS,
            useOriginalUfNames
                ? { entityTypeId, useOriginalUfNames }
                : { entityTypeId },
        );
    }
}
