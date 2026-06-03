import { Injectable } from '@nestjs/common';
import { BxUserRepository } from '../repository/bx-user.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXUser } from '../../interfaces/bitrix.interface';
import { IBXField } from '../../crm';
import { AddRequestType, UpdateRequestType } from '../../type/request.type';

@Injectable()
export class BxUserBatchService {
    private repo: BxUserRepository;

    clone(api: BitrixBaseApi): BxUserBatchService {
        const instance = new BxUserBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxUserRepository(api);
    }

    add(cmdCode: string, data: Partial<IBXUser>) {
        return this.repo.addBtch(cmdCode, data);
    }

    get(
        cmdCode: string,
        filter: Partial<IBXUser>,
        select?: string[],
        order?: { [key in keyof IBXUser]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return this.repo.getBtch(cmdCode, filter, select, order);
    }

    search(cmdCode: string, data: AddRequestType<IBXUser>) {
        return this.repo.searchBtch(cmdCode, data);
    }

    getCurrent(cmdCode: string) {
        return this.repo.getCurrentBtch(cmdCode);
    }

    update(
        cmdCode: string,
        userId: number | string,
        data: UpdateRequestType<IBXUser>,
    ) {
        return this.repo.updateBtch(cmdCode, userId, data);
    }

    getFields(cmdCode: string) {
        return this.repo.getFieldsBtch(cmdCode);
    }

    getUserFieldList(cmdCode: string, id: number | string, select?: string[]) {
        return this.repo.getUserFieldListBtch(cmdCode, id, select);
    }

    addUserField(cmdCode: string, fields: AddRequestType<IBXField>) {
        return this.repo.addUserFieldBtch(cmdCode, fields);
    }

    updateUserField(
        cmdCode: string,
        id: number | string,
        fields: AddRequestType<IBXField>,
    ) {
        return this.repo.updateUserFieldBtch(cmdCode, id, fields);
    }

    deleteUserField(cmdCode: string, id: number | string) {
        return this.repo.deleteUserFieldBtch(cmdCode, id);
    }
}
