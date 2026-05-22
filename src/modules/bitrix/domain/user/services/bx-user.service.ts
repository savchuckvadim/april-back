import { BxUserRepository } from '../repository/bx-user.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXUser } from '../../interfaces/bitrix.interface';
import { IBXField } from '../../crm';
import { AddRequestType, UpdateRequestType } from '../../type/request.type';

export class BxUserService {
    private repo: BxUserRepository;

    clone(api: BitrixBaseApi): BxUserService {
        const instance = new BxUserService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxUserRepository(api);
    }

    async add(data: Partial<IBXUser>) {
        return await this.repo.add(data);
    }

    async get(
        filter: Partial<IBXUser>,
        select?: string[],
        order?: { [key in keyof IBXUser]?: 'asc' | 'desc' | 'ASC' | 'DESC' },
    ) {
        return await this.repo.get(filter, select, order);
    }

    async search(data: AddRequestType<IBXUser>) {
        return await this.repo.search(data);
    }

    async getCurrent() {
        return await this.repo.getCurrent();
    }

    async update(userId: number | string, data: UpdateRequestType<IBXUser>) {
        return await this.repo.update(userId, data);
    }

    async getFields() {
        return await this.repo.getFields();
    }

    async getUserFieldList(id: number | string, select?: string[]) {
        return await this.repo.getUserFieldList(id, select);
    }

    async addUserField(fields: AddRequestType<IBXField>) {
        return await this.repo.addUserField(fields);
    }

    async updateUserField(
        id: number | string,
        fields: AddRequestType<IBXField>,
    ) {
        return await this.repo.updateUserField(id, fields);
    }

    async deleteUserField(id: number | string) {
        return await this.repo.deleteUserField(id);
    }
}
