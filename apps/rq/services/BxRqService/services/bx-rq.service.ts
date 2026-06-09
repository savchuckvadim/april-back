import { Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { BXRequisiteDTO } from '@/apps/rq/types/bx-requisite-dto.type';
import { Address } from '@/apps/rq/types/bx-address.type';
import { Bank } from '@/apps/rq/types/bx-bank.type';
import { IBitrixResponse } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PresetCode } from '@/apps/rq/enums/preset-code.enum';
import { BxRqAddressService } from './bx-rq-address.service';
import { BxRqBankService } from './bx-rq-bank.service';
import { BxRqCustomFieldService } from './bx-rq-custom-field.service';
import { getPresetConfig } from '../utils/preset.utils';
import {
    applyCustomFieldsToRequisite,
    setRequisiteNameIfEmpty,
    processOrganizationRequisite,
    processPhysicalPersonRequisite,
    processRequisiteWithoutPreset,
    addMissingPresets,
    updatePresetIds,
    filterRequisiteFields,
    mergeCustomFields,
} from '../utils/requisite.utils';
import { PresetConfig } from '../consts/preset.consts';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';

/**
 * Основной сервис для работы с реквизитами Bitrix24
 */
@Injectable()
export class BxRqService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly addressService: BxRqAddressService,
        private readonly bankService: BxRqBankService,
        private readonly customFieldService: BxRqCustomFieldService,
    ) {}

    /**
     * Получает все реквизиты компании
     */
    async getRq(companyId: number, domain: string): Promise<BXRequisiteDTO[]> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);

        const preset = getPresetConfig(PortalModel);

        const result = (await bitrix.api.call('crm.requisite.list', {
            filter: { ENTITY_ID: companyId },
        })) as IBitrixResponse<BXRequisiteDTO[]>;

        const resultRqs = result?.result;

        if (resultRqs?.length > 0) {
            return this.processRequisites(resultRqs, companyId, bitrix, preset);
        }

        // Если реквизитов нет, создаем простой реквизит и удаляем его
        return this.handleEmptyRequisites(companyId, domain, preset);
    }

    /**
     * Обрабатывает список реквизитов
     */
    private async processRequisites(
        resultRqs: BXRequisiteDTO[],
        companyId: number,
        bitrix: BitrixService,
        preset: PresetConfig,
    ): Promise<BXRequisiteDTO[]> {
        const rq: BXRequisiteDTO[] = [];

        for (const requisite of resultRqs) {
            const processedRequisite = await this.processSingleRequisite(
                requisite,
                bitrix,
                preset,
            );
            rq.push(processedRequisite);
        }

        addMissingPresets(rq, companyId, preset);

        // Добавляем недостающие адреса и банки
        for (const requisite of rq) {
            const anchorId = Number(companyId) || -1;

            const entityId = Number(requisite?.ID) || -1;

            this.addressService.ensureRequiredAddresses(
                requisite,

                anchorId,

                entityId,
            );
            this.bankService.ensureRequiredBank(requisite);
        }

        return rq;
    }

    /**
     * Обрабатывает один реквизит
     */
    private async processSingleRequisite(
        requisite: BXRequisiteDTO,
        bitrix: BitrixService,
        preset: PresetConfig,
    ): Promise<BXRequisiteDTO> {
        // Добавляем batch команды для получения адресов, банков и custom fields
        this.addressService.addAddressBatchCommand(bitrix, requisite.ID);
        this.bankService.addBankBatchCommand(bitrix, requisite.ID);
        const rqCommands = this.customFieldService.addCustomFieldsBatchCommands(
            bitrix,
            requisite,
        );

        // Выполняем batch запросы
        const batches = await bitrix.api.callBatchWithConcurrency(5);

        // Обрабатываем результаты
        const addresses =
            this.addressService.processAddressesFromBatch(batches);
        const banks = this.bankService.processBanksFromBatch(batches);
        const customFields =
            this.customFieldService.processCustomFieldsFromBatch(
                batches,
                rqCommands,
            );

        // Применяем результаты к реквизиту
        requisite.address = addresses;
        requisite.bank = banks;
        requisite.customFields = customFields;

        const bxRq = new BXRequisiteDTO(requisite);

        // Обрабатываем customFields
        applyCustomFieldsToRequisite(bxRq);

        // Устанавливаем имя, если отсутствует
        setRequisiteNameIfEmpty(bxRq);

        // Обрабатываем в зависимости от типа пресета
        if (preset) {
            processOrganizationRequisite(bxRq, preset);
            processPhysicalPersonRequisite(bxRq, preset);
        } else {
            processRequisiteWithoutPreset(bxRq);
        }

        return bxRq;
    }

    /**
     * Обрабатывает случай, когда реквизитов нет
     */
    private async handleEmptyRequisites(
        companyId: number,
        domain: string,
        preset: PresetConfig,
    ): Promise<BXRequisiteDTO[]> {
        try {
            if (!(await this.hasRequisites(companyId, domain))) {
                await this.createSimpleRq(companyId, domain);
                const rqs = await this.getRq(companyId, domain);
                if (rqs.length > 0) {
                    await this.deleteRq(rqs[0].ID, domain);
                    rqs[0].ID = -1;
                    rqs[0].ENTITY_TYPE_ID = 4;
                    rqs[0].ENTITY_ID = companyId;
                    updatePresetIds(rqs, preset);
                }
                return rqs;
            }
        } catch {
            // Ignore
        }

        return [];
    }

    /**
     * Проверяет наличие реквизитов
     */
    private async hasRequisites(
        companyId: number,
        domain: string,
    ): Promise<boolean> {
        const { bitrix } = await this.pbxService.init(domain);
        const result = (await bitrix.api.call('crm.requisite.list', {
            filter: { ENTITY_ID: companyId },
        })) as IBitrixResponse<BXRequisiteDTO[]>;
        return !!result?.result?.[0];
    }

    /**
     * Создает реквизит
     */
    async createRq(bxRqs: BXRequisiteDTO, domain: string): Promise<unknown> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);

        this.applyPresetToRequisite(bxRqs, PortalModel);

        const fields = this.prepareRequisiteFields(bxRqs);

        return await bitrix.api.call('crm.requisite.add', {
            fields: fields,
        });
    }

    /**
     * Обновляет реквизит
     */
    async updateRq(
        bxRqs: BXRequisiteDTO,
        rqId: number,
        domain: string,
    ): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        const fields = this.prepareRequisiteFields(bxRqs);

        const result = await bitrix.api.call('crm.requisite.update', {
            id: rqId,
            fields: fields,
        });

        return result;
    }

    /**
     * Устанавливает выбранный реквизит для компании
     */
    async setSelectedRq(
        entityId: number,
        requisiteId: number,
        bankDetailId: number,
        domain: string,
    ): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        return await bitrix.api.call(
            'crm.requisite.settings.setSelectedEntityRequisite',
            {
                entityTypeId: 4,
                entityId: entityId,
                requisiteId: requisiteId,
                bankDetailId: bankDetailId,
            },
        );
    }

    /**
     * Обновляет адрес
     */
    async updateAddress(domain: string, address: Address): Promise<boolean> {
        const { bitrix } = await this.pbxService.init(domain);
        return this.addressService.updateAddress(bitrix, address);
    }

    /**
     * Обновляет банк
     */
    async updateBank(
        domain: string,
        bank: Bank,
    ): Promise<boolean | { bx_id: unknown }> {
        const { bitrix } = await this.pbxService.init(domain);
        return this.bankService.updateBank(bitrix, bank);
    }

    /**
     * Применяет пресет к реквизиту
     */
    private applyPresetToRequisite(
        bxRqs: BXRequisiteDTO,
        PortalModel: PortalModel,
    ): void {
        const presetOrg = PortalModel.getPresetForName(PresetCode.ORG);
        const presetIp = PortalModel.getPresetForName(PresetCode.IP);
        const presetFiz = PortalModel.getPresetForName(PresetCode.FIZ);

        if (bxRqs.NAME === 'Организация' && presetOrg) {
            bxRqs.NAME = presetOrg.name;
            bxRqs.PRESET_ID = presetOrg.bitrix_id;
        } else if (bxRqs.NAME === 'ИП' && presetIp) {
            bxRqs.NAME = presetIp.name;
            bxRqs.PRESET_ID = presetIp.bitrix_id;
        } else if (bxRqs.NAME === 'Физ. лицо' && presetFiz) {
            bxRqs.NAME = presetFiz.name;
            bxRqs.PRESET_ID = presetFiz.bitrix_id;
        }
    }

    /**
     * Подготавливает поля реквизита для отправки в Bitrix24
     */
    private prepareRequisiteFields(bxRqs: BXRequisiteDTO): Record<string, any> {
        const fields = filterRequisiteFields(bxRqs);
        return mergeCustomFields(fields, bxRqs.customFields ?? undefined);
    }

    /**
     * Создает простой реквизит
     */
    private async createSimpleRq(
        companyId: number,
        domain: string,
    ): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        const rq = new BXRequisiteDTO({
            ID: -1,
            ENTITY_ID: companyId,
            ENTITY_TYPE_ID: 4,
            PRESET_ID: 1,
            NAME: 'Организация',
        });

        const fields = filterRequisiteFields(rq);

        return await bitrix.api.call('crm.requisite.add', {
            fields: fields,
        });
    }

    /**
     * Удаляет реквизит
     */
    private async deleteRq(rqId: number, domain: string): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        return await bitrix.api.call('crm.requisite.delete', {
            id: rqId,
        });
    }
}
