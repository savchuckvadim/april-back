import { BxStatusRepository } from '../repository/bx-status.repository';
import { BitrixBaseApi } from 'src/modules/bitrix/core/base/bitrix-base-api';
import { IBXStatus } from '../interface/bx-status.interface';
import {
    StatusEntityItemsRequestDto,
    StatusEntityItemsResponseDto,
    StatusEntityTypesResponseDto,
} from '../dto/status-entity.dto';

export class BxStatusService {
    private repo: BxStatusRepository;

    clone(api: BitrixBaseApi): BxStatusService {
        const instance = new BxStatusService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new BxStatusRepository(api);
    }

    getList(filter: Partial<IBXStatus>) {
        return this.repo.getList(filter);
    }

    async get(id: number | string) {
        return await this.repo.get(id);
    }

    async add(fields: Partial<IBXStatus>) {
        return await this.repo.add(fields);
    }

    async update(id: number | string, fields: Partial<IBXStatus>) {
        return await this.repo.update(id, fields);
    }

    async delete(id: number | string) {
        return await this.repo.delete(id);
    }

    async getEntityItems(
        dto: StatusEntityItemsRequestDto,
    ): Promise<StatusEntityItemsResponseDto> {
        return this.repo.getEntityItems(dto);
    }

    async getEntityTypes(): Promise<StatusEntityTypesResponseDto> {
        return this.repo.getEntityTypes();
    }
}
