import { BadRequestException, Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixService } from '@/modules/bitrix/bitrix.service';
import { BXRequisiteDTO } from '@lib/rq-lib/types/bx-requisite-dto.type';
import { Address } from '@lib/rq-lib/types/bx-address.type';
import { Bank } from '@lib/rq-lib/types/bx-bank.type';
import { IBitrixResponse } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { ErrorMessage } from '@lib/rq-lib/enums/error-message.enum';
import { BxRqAddressService } from './bx-rq-address.service';
import { BxRqBankService } from './bx-rq-bank.service';
import { BxRqCustomFieldService } from './bx-rq-custom-field.service';
import {
    applyCustomFieldsToRequisite,
    setRequisiteNameIfEmpty,
    processOrganizationRequisite,
    processPhysicalPersonRequisite,
    addTemplates,
    filterRequisiteFields,
    mergeCustomFields,
} from '../utils/requisite.utils';
import { PresetConfig } from '../consts/preset.consts';
import { presetConfigOf, RqPresetService } from '../../rq-preset.service';

interface BxRequisiteMutationResponse {
    result?: unknown;
    error?: string;
    error_description?: string;
}

/**
 * Реквизиты компании в Bitrix24: чтение с адресами, банками и
 * пользовательскими полями, создание и обновление.
 */
@Injectable()
export class BxRqService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly addressService: BxRqAddressService,
        private readonly bankService: BxRqBankService,
        private readonly customFieldService: BxRqCustomFieldService,
        private readonly presetService: RqPresetService,
    ) {}

    /**
     * Реквизиты компании плюс заготовка (-1) на каждый тип клиента. Чтение
     * ничего не пишет в Bitrix: раньше ради шаблона создавался и удалялся
     * реквизит с пресетом 1, которого на портале может не быть.
     */
    async getRq(companyId: number, domain: string): Promise<BXRequisiteDTO[]> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);
        const presets = await this.presetService.resolve(bitrix, PortalModel);
        const config = presetConfigOf(presets);

        const result = (await bitrix.api.call('crm.requisite.list', {
            filter: { ENTITY_ID: companyId },
            start: -1,
        })) as IBitrixResponse<BXRequisiteDTO[]>;
        const rows = Array.isArray(result?.result) ? result.result : [];

        const rq: BXRequisiteDTO[] = [];
        for (const requisite of rows) {
            rq.push(await this.processSingleRequisite(requisite, bitrix, config));
        }
        addTemplates(rq, companyId, presets);

        for (const requisite of rq) {
            this.addressService.ensureRequiredAddresses(
                requisite,
                Number(companyId) || -1,
                Number(requisite.ID) || -1,
            );
            this.bankService.ensureRequiredBank(requisite);
        }

        return rq;
    }

    /**
     * Один реквизит: адреса, банки и пользовательские поля одним batch.
     */
    private async processSingleRequisite(
        requisite: BXRequisiteDTO,
        bitrix: BitrixService,
        preset: PresetConfig,
    ): Promise<BXRequisiteDTO> {
        this.addressService.addAddressBatchCommand(bitrix, requisite.ID);
        this.bankService.addBankBatchCommand(bitrix, requisite.ID);
        const rqCommands = this.customFieldService.addCustomFieldsBatchCommands(
            bitrix,
            requisite,
        );

        const batches = await bitrix.api.callBatchWithConcurrency(5);

        requisite.address = this.addressService.processAddressesFromBatch(batches);
        requisite.bank = this.bankService.processBanksFromBatch(batches);
        requisite.customFields = this.customFieldService.processCustomFieldsFromBatch(
            batches,
            rqCommands,
        );

        const bxRq = new BXRequisiteDTO(requisite);
        applyCustomFieldsToRequisite(bxRq);
        setRequisiteNameIfEmpty(bxRq);
        processOrganizationRequisite(bxRq, preset);
        processPhysicalPersonRequisite(bxRq, preset);

        return bxRq;
    }

    /**
     * Создать реквизит; вернёт его id в Bitrix. Пресет и имя уже в заготовке.
     */
    async createRq(bxRqs: BXRequisiteDTO, domain: string): Promise<number> {
        const { bitrix } = await this.pbxService.init(domain);

        const fields = this.prepareRequisiteFields(bxRqs);
        const result = (await bitrix.api.call('crm.requisite.add', {
            fields,
        })) as BxRequisiteMutationResponse;
        if (result?.error) {
            throw new BadRequestException(
                result.error_description || result.error,
            );
        }
        const bxId = Number(result?.result);
        if (!bxId) {
            throw new BadRequestException(ErrorMessage.REQUISITE_NOT_CREATED);
        }
        return bxId;
    }

    /**
     * Обновить реквизит.
     */
    async updateRq(
        bxRqs: BXRequisiteDTO,
        rqId: number,
        domain: string,
    ): Promise<void> {
        const { bitrix } = await this.pbxService.init(domain);

        const fields = this.prepareRequisiteFields(bxRqs);
        const result = (await bitrix.api.call('crm.requisite.update', {
            id: rqId,
            fields,
        })) as BxRequisiteMutationResponse;
        if (result?.error) {
            throw new BadRequestException(
                result.error_description || result.error,
            );
        }
    }

    async updateAddress(domain: string, address: Address): Promise<boolean> {
        const { bitrix } = await this.pbxService.init(domain);
        return this.addressService.updateAddress(bitrix, address);
    }

    /** Создать или обновить банк; вернёт id банка. */
    async updateBank(domain: string, bank: Bank): Promise<number> {
        const { bitrix } = await this.pbxService.init(domain);
        return this.bankService.updateBank(bitrix, bank);
    }

    /**
     * Поля записи: служебные ключи заготовки (ID -1, адреса, банки, список
     * пользовательских полей) в Bitrix не уходят.
     */
    private prepareRequisiteFields(bxRqs: BXRequisiteDTO): Record<string, unknown> {
        const fields = filterRequisiteFields(bxRqs);
        for (const key of ['ID', 'address', 'bank', 'customFields']) {
            delete fields[key];
        }
        return mergeCustomFields(fields, bxRqs.customFields ?? undefined);
    }
}
