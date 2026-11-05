import { BadRequestException, Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BitrixOwnerTypeId } from '@/modules/bitrix/domain/enums/bitrix-constants.enum';
import { ERQItem } from '../dto/erq-item.dto';
import { ERQField } from '../dto/erq-field.dto';
import { ERQAddressItem } from '../dto/erq-address.dto';
import { ERQBankItem } from '../dto/erq-bank.dto';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { Address } from '../types/bx-address.type';
import { Bank } from '../types/bx-bank.type';
import { CodesField, Names } from '../dto/codes-field';
import { AddressFieldCode } from '../enums/address-field-code.enum';
import { BankFieldCode } from '../enums/bank-field-code.enum';
import { TypeIdAddress } from '../types/type-id-address.enum';
import { ErrorMessage } from '../enums/error-message.enum';
import { RQ_TYPE } from '../enums/rq-type.enum';
import { BxRqService, BxRqCustomFieldService } from './BxRqService';
import {
    createTemplateRequisite,
    TEMPLATE_RQ_ID,
} from './BxRqService/utils/requisite.utils';
import { mutateCustomFieldXmlIdByName } from '../shared/';
import {
    presetKindOf,
    RqPresetKind,
    RqPresetService,
} from './rq-preset.service';

const RQ_TYPE_BY_KIND: Record<RqPresetKind, RQ_TYPE> = {
    org: RQ_TYPE.ORGANIZATION,
    ip: RQ_TYPE.IP,
    fiz: RQ_TYPE.FIZ,
};

/** Запрос на создание: bx_id не передан или -1. */
export const isNewRequisite = (rqId: number | null | undefined): boolean =>
    rqId == null || Number(rqId) === TEMPLATE_RQ_ID;

@Injectable()
export class RequisiteUpdateService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly bxRqService: BxRqService,
        private readonly presetService: RqPresetService,
        private readonly customFieldService: BxRqCustomFieldService,
    ) {}

    /**
     * Создать (bx_id -1) или обновить реквизит. Новый собирается из заготовки
     * пресета, который задан в запросе: заготовка первого типа в списке
     * раньше делала из любого нового реквизита организацию.
     */
    async updateRequisite(
        erqItem: ERQItem,
        rqId: number | undefined,
        bxRqs: BXRequisiteDTO[],
        companyId: number,
        domain: string,
        presetId: number | undefined,
    ): Promise<ERQItem> {
        if (!erqItem) {
            throw new BadRequestException(ErrorMessage.NOT_FULL_DATA);
        }
        const { bitrix, PortalModel } = await this.pbxService.init(domain);
        const presets = await this.presetService.resolve(bitrix, PortalModel);
        const codeToAttribute = this.getCodeToAttributeMap();

        if (isNewRequisite(rqId)) {
            const kind = presetKindOf(presets, presetId ?? erqItem.preset_id);
            if (!kind) {
                throw new BadRequestException(ErrorMessage.PRESET_REQUIRED);
            }
            const template = createTemplateRequisite(companyId, presets[kind]);
            // у заготовки нет UF_-ключей: должность, основание и падежи
            // пишутся через каталог пользовательских полей портала
            template.customFields = await this.customFieldService.loadCatalog(bitrix);
            this.applyFields(template, erqItem.fields, codeToAttribute);

            const bxId = await this.bxRqService.createRq(template, domain);
            return new ERQItem({
                bx_id: bxId,
                fields: erqItem.fields,
                address: erqItem.address,
                bank: erqItem.bank,
                preset_id: presets[kind].id,
                type: RQ_TYPE_BY_KIND[kind],
            });
        }

        const target = bxRqs.find(rq => Number(rq.ID) === Number(rqId));
        if (!target) {
            throw new BadRequestException(ErrorMessage.REQUISITE_NOT_FOUND);
        }
        this.applyFields(target, erqItem.fields, codeToAttribute);
        await this.bxRqService.updateRq(target, Number(rqId), domain);

        const kind = presetKindOf(presets, target.PRESET_ID);
        return new ERQItem({
            ...erqItem,
            bx_id: Number(rqId),
            preset_id: target.PRESET_ID,
            type: kind ? RQ_TYPE_BY_KIND[kind] : erqItem.type,
        });
    }

    /** Значения полей формы → атрибуты реквизита и пользовательские поля по XML_ID. */
    private applyFields(
        target: BXRequisiteDTO,
        fields: ERQField[],
        codeToAttribute: Record<string, string>,
    ): void {
        const record = target as unknown as Record<string, unknown>;
        for (const field of fields) {
            const attribute = codeToAttribute[field.code];
            if (attribute) {
                record[attribute] = field.value;
            }
            for (const customField of target.customFields ?? []) {
                mutateCustomFieldXmlIdByName(customField);
                if ((customField.XML_ID?.trim() || '') === field.code) {
                    customField.value = field.value as string | null;
                }
            }
        }
    }

    async updateAddress(
        addressItem: ERQAddressItem,
        rqId: number,
        companyId: number,
        domain: string,
    ): Promise<boolean> {
        if (!addressItem) {
            throw new BadRequestException('Address item is required');
        }

        const bxAddress = new Address({
            TYPE_ID: addressItem.type_id as TypeIdAddress,
            ENTITY_TYPE_ID: BitrixOwnerTypeId.REQUISITE as number,
            ENTITY_ID: rqId,
            ANCHOR_TYPE_ID: BitrixOwnerTypeId.COMPANY as number,
            ANCHOR_ID: companyId,
        });

        if (!addressItem.fields || !Array.isArray(addressItem.fields)) {
            throw new BadRequestException('Address fields are required');
        }

        for (const field of addressItem.fields) {
            const code = field.code as AddressFieldCode;
            if (code === AddressFieldCode.ADDRESS_1) {
                bxAddress.ADDRESS_1 = field.value as string;
            } else if (code === AddressFieldCode.ADDRESS_2) {
                bxAddress.ADDRESS_2 = field.value as string;
            } else if (code === AddressFieldCode.PROVINCE) {
                bxAddress.PROVINCE = field.value as string;
            } else if (code === AddressFieldCode.CITY) {
                bxAddress.CITY = field.value as string;
            } else if (code === AddressFieldCode.REGION) {
                bxAddress.REGION = field.value as string;
            } else if (code === AddressFieldCode.COUNTRY) {
                bxAddress.COUNTRY = field.value as string;
            } else if (code === AddressFieldCode.POSTAL_CODE) {
                bxAddress.POSTAL_CODE = field.value as string;
            }
        }

        return await this.bxRqService.updateAddress(domain, bxAddress);
    }

    async updateBank(
        bankItem: ERQBankItem,
        rqId: number,
        domain: string,
    ): Promise<number> {
        const bxBank = new Bank({
            ID: bankItem.id,
            ENTITY_ID: rqId,
        });

        for (const field of bankItem.fields) {
            const code = field.code as BankFieldCode;
            if (code === BankFieldCode.KC) {
                bxBank.RQ_COR_ACC_NUM = field.value as string;
            } else if (code === BankFieldCode.PC) {
                bxBank.RQ_ACC_NUM = field.value as string;
            } else if (code === BankFieldCode.BIK) {
                bxBank.RQ_BIK = field.value as string;
            } else if (code === BankFieldCode.BANK_ADDRESS) {
                bxBank.RQ_BANK_ADDR = field.value as string;
            } else if (code === BankFieldCode.BANK_NAME) {
                bxBank.RQ_BANK_NAME = field.value as string;
            } else if (code === BankFieldCode.COMMENTS) {
                bxBank.COMMENTS = field.value as string;
            }
        }

        return await this.bxRqService.updateBank(domain, bxBank);
    }

    private getCodeToAttributeMap(): Record<string, string> {
        const codeToAttributeMap: Record<string, string> = {};
        const codesFieldKeys = Object.keys(CodesField);
        for (const fieldName of codesFieldKeys) {
            if (fieldName === 'constructor' || fieldName === 'prototype') {
                continue;
            }
            const fieldValue = (CodesField as unknown as Record<string, Names>)[
                fieldName
            ];
            if (
                fieldValue &&
                fieldValue.code &&
                typeof fieldValue.code === 'string'
            ) {
                codeToAttributeMap[fieldValue.code] = fieldName;
            }
        }
        return codeToAttributeMap;
    }
}
