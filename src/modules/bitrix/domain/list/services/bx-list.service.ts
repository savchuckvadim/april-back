import { Injectable } from '@nestjs/common';
import { BxListRepository } from '../repository/bx-list.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { EBxListCode, IBXList } from '../interface/bx-list.interface';

@Injectable()
export class BxListService {
    private repo: BxListRepository;

    clone(api: BitrixBaseApi): BxListService {
        const instance = new BxListService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxListRepository(api);
    }

    getList(IBLOCK_CODE?: EBxListCode) {
        return this.repo.getList(IBLOCK_CODE);
    }

    add(IBLOCK_CODE: string, fields: Partial<IBXList>) {
        return this.repo.add(IBLOCK_CODE, fields);
    }

    getListField(code: EBxListCode, ID: string | number) {
        return this.repo.getListField(code, ID);
    }

    getListFields(code: EBxListCode) {
        return this.repo.getListFields(code);
    }

    addField(IBLOCK_CODE: string, fields: Record<string, any>) {
        return this.repo.addField(IBLOCK_CODE, fields);
    }

    updateField(
        IBLOCK_CODE: string,
        FIELD_ID: string | number,
        fields: Record<string, any>,
    ) {
        return this.repo.updateField(IBLOCK_CODE, FIELD_ID, fields);
    }

    deleteField(IBLOCK_CODE: string, FIELD_ID: string | number) {
        return this.repo.deleteField(IBLOCK_CODE, FIELD_ID);
    }
}
