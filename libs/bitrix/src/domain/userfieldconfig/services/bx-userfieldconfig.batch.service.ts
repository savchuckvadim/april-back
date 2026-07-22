import { BitrixBaseApi } from '@/modules/bitrix/core';
import { UserFieldConfigRepository } from '../repository/userfieldconfig.repository';
import {
    UserFieldConfigAddDto,
    UserFieldConfigDeleteDto,
    UserFieldConfigGetDto,
    UserFieldConfigListDto,
    UserFieldConfigUpdateDto,
} from '../dto/userfieldconfig.dto';

/**
 * Batch-обёртки `userfieldconfig.*` (накопление команд в инстансе bitrix).
 *
 * ⚠️ Для смарт-процессов `entityId = CRM_{id из crm.type.list}` — НЕ
 * `entityTypeId`! На неверный id Bitrix отвечает «Вы не можете просматривать
 * настройки пользовательских полей» — той же фразой, что при нехватке прав
 * (боевой инцидент 2026-07-21). Подробности — jsdoc BxUserFieldConfigService.
 */
export class BxUserFieldConfigBatchService {
    private repo: UserFieldConfigRepository;

    clone(api: BitrixBaseApi): BxUserFieldConfigBatchService {
        const instance = new BxUserFieldConfigBatchService();
        instance.init(api);
        return instance;
    }

    init(api: BitrixBaseApi) {
        this.repo = new UserFieldConfigRepository(api);
    }

    getBtch(btchCommand: string, dto: UserFieldConfigGetDto) {
        return this.repo.getBtch(btchCommand, dto);
    }

    /** ⚠️ `field.entityId = CRM_{id из crm.type.list}`, НЕ entityTypeId — см. jsdoc класса. */
    addBtch(btchCommand: string, dto: UserFieldConfigAddDto) {
        return this.repo.addBtch(btchCommand, dto);
    }

    updateBtch(btchCommand: string, dto: UserFieldConfigUpdateDto) {
        return this.repo.updateBtch(btchCommand, dto);
    }

    deleteBtch(btchCommand: string, dto: UserFieldConfigDeleteDto) {
        return this.repo.deleteBtch(btchCommand, dto);
    }

    /** ⚠️ `filter.entityId = CRM_{id из crm.type.list}`, НЕ entityTypeId — см. jsdoc класса. */
    listBtch(btchCommand: string, dto: UserFieldConfigListDto) {
        return this.repo.listBtch(btchCommand, dto);
    }
}
