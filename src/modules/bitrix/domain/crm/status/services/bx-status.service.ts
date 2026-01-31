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

    /**
     * Возвращает элементы справочника по его символьному идентификатору
     * @param dto - DTO с entityId (например, 'DEAL_STAGE', 'SOURCE')
     * @returns Массив элементов справочника
     */
    async getEntityItems(
        dto: StatusEntityItemsRequestDto,
    ): Promise<StatusEntityItemsResponseDto> {
        return this.repo.getEntityItems(dto);
    }

    /**
     * Возвращает описание типов справочников
     * @returns Массив объектов с описанием типов справочников
     */
    async getEntityTypes(): Promise<StatusEntityTypesResponseDto> {
        return this.repo.getEntityTypes();
    }
}
