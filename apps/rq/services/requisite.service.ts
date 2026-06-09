import { BadRequestException, Injectable } from '@nestjs/common';
import { PBXService } from '@/modules/pbx';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { Address } from '../types/bx-address.type';
import { Bank } from '../types/bx-bank.type';
import {
    TypeIdAddress,
    getTypeIdAddressName,
} from '../types/type-id-address.enum';
import { CustomField } from '../types/bx-custom-field.type';
import { IBitrixResponse } from '@/modules/bitrix/core/interface/bitrix-api-http.intterface';
import { PresetCode } from '../enums/preset-code.enum';
import {
    processCustomFieldResult,
    RawCustomFieldResult,
} from './BxRqService/utils/custom-field.utils';
import { normalizeAddressTypeId } from './BxRqService/utils/address.utils';
import { NameUtil } from '@lib/shared';

@Injectable()
export class RequisiteService {
    constructor(private readonly pbxService: PBXService) {}

    async getRq(companyId: number, domain: string): Promise<BXRequisiteDTO[]> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);

        const presetOrg = PortalModel.getPresetForName(PresetCode.ORG);
        const presetIp = PortalModel.getPresetForName(PresetCode.IP);
        const presetFiz = PortalModel.getPresetForName(PresetCode.FIZ);

        const preset = {
            org: presetOrg?.bitrix_id || 1,
            ip: presetIp?.bitrix_id || 3,
            fiz: presetFiz?.bitrix_id || 5,
        };

        const result = (await bitrix.api.call('crm.requisite.list', {
            filter: { ENTITY_ID: companyId },
        })) as IBitrixResponse<BXRequisiteDTO[]>;
        const resultRqs = result?.result;

        if (resultRqs?.length > 0) {
            const rq: BXRequisiteDTO[] = [];

            for (const requisite of resultRqs) {
                const customFields: CustomField[] = [];
                const rqCommands: Array<{ key: string; value: unknown }> = [];

                // Добавляем команды для получения адресов и банков
                bitrix.api.addCmdBatch(
                    `address_${requisite.ID}`,
                    'crm.address.list',
                    {
                        filter: { ENTITY_ID: requisite.ID },
                    },
                );

                bitrix.api.addCmdBatch(
                    `bankdetail_${requisite.ID}`,
                    'crm.requisite.bankdetail.list',
                    {
                        filter: { ENTITY_ID: requisite.ID },
                    },
                );

                // Обрабатываем пользовательские поля
                for (const [key, value] of Object.entries(requisite)) {
                    if (key.startsWith('UF_')) {
                        const cmd = `field_name_${key}`;
                        bitrix.api.addCmdBatch(
                            cmd,
                            'crm.requisite.userfield.list',
                            {
                                filter: { FIELD_NAME: key },
                            },
                        );
                        rqCommands.push({ key: `rq_${key}`, value });
                        bitrix.api.addCmdBatch(
                            `rq_${key}`,
                            'crm.requisite.userfield.get',
                            {
                                id: `$result[field_name_${key}][0][ID]`,
                            },
                        );
                    }
                }

                const batches = await bitrix.api.callBatchWithConcurrency(1);

                for (const batch of batches) {
                    if (!batch?.result) continue;

                    for (const [resultKey, resultValue] of Object.entries(
                        batch.result,
                    )) {
                        if (resultKey.includes('address')) {
                            const address = resultValue as Partial<Address>[];
                            if (address && address.length > 0) {
                                requisite.address = [];
                                for (const adr of address) {
                                    const addressRu = new Address(adr);
                                    const typeId = Number(addressRu.TYPE_ID);
                                    addressRu.TYPE = getTypeIdAddressName(
                                        typeId as TypeIdAddress,
                                    );
                                    if (
                                        typeId &&
                                        ![
                                            TypeIdAddress.LEGAL,
                                            TypeIdAddress.FACTUAL,
                                        ].includes(typeId)
                                    ) {
                                        continue;
                                    }
                                    requisite.address.push(addressRu);
                                }
                            }
                            continue;
                        }

                        if (resultKey.includes('bankdetail')) {
                            const banks = resultValue as Partial<Bank>[];
                            if (banks && banks.length > 0) {
                                requisite.bank = [];
                                for (const bank of banks) {
                                    const addBank = new Bank(bank);
                                    requisite.bank.push(addBank);
                                }
                            }
                            continue;
                        }

                        for (const cmd of rqCommands) {
                            if (cmd.key === resultKey) {
                                const customFieldObj = processCustomFieldResult(
                                    resultValue as RawCustomFieldResult,
                                    cmd.value,
                                );
                                if (
                                    !customFields.find(
                                        cf => cf.ID === customFieldObj.ID,
                                    )
                                ) {
                                    customFields.push(customFieldObj);
                                }
                                break;
                            }
                        }
                    }
                }

                requisite.customFields = customFields;

                const bxRq = new BXRequisiteDTO(requisite);

                // Обработка customFields
                if (bxRq.customFields) {
                    for (const custom of bxRq.customFields) {
                        const customXmlId = custom.XML_ID?.trim() || '';
                        if (!customXmlId || !custom.value) {
                            continue;
                        }
                        if (customXmlId === 'position_case') {
                            bxRq.RQ_POSITION_CASE = custom.value;
                        } else if (customXmlId === 'position') {
                            bxRq.RQ_POSITION = custom.value;
                        } else if (customXmlId === 'based') {
                            bxRq.RQ_BASED = custom.value;
                        } else if (customXmlId === 'based_case') {
                            bxRq.RQ_BASED_CASE = custom.value;
                        } else if (customXmlId === 'director_case') {
                            bxRq.RQ_DIRECTOR_CASE = custom.value;
                        } else if (customXmlId === 'base_other') {
                            bxRq.RQ_BASE_OTHER = custom.value;
                        }
                    }
                }

                if (!bxRq.NAME) {
                    bxRq.NAME =
                        `${bxRq.RQ_LAST_NAME || ''} ${bxRq.RQ_FIRST_NAME || ''} ${bxRq.RQ_SECOND_NAME || ''}`.trim();
                }

                if (!bxRq.RQ_BASED_CASE?.trim()) {
                    // TODO: Implement decline_word function if needed
                    // bxRq.RQ_BASED_CASE = declineWord(bxRq.RQ_BASED);
                }
                console.log('bxRq RQ_POSITION_CASE', bxRq.RQ_POSITION_CASE);
                console.log('bxRq RQ_POSITION', bxRq.RQ_POSITION);
                if (preset) {
                    if (bxRq.PRESET_ID === preset.org) {
                        if (
                            bxRq.RQ_DIRECTOR &&
                            !bxRq.RQ_DIRECTOR_CASE?.trim()
                        ) {
                            const caseValue = NameUtil.declineWord(
                                bxRq.RQ_DIRECTOR,
                            );
                            if (caseValue) {
                                bxRq.RQ_DIRECTOR_CASE = caseValue;
                            }
                        }

                        // if (
                        //     bxRq.RQ_POSITION &&
                        //     !bxRq.RQ_POSITION_CASE?.trim()
                        // ) {

                        //     const caseValue = WordUtil.declineWord(
                        //         bxRq.RQ_POSITION,
                        //     );
                        //     console.log('RQ_POSITION_CASE', caseValue);
                        //     if (caseValue) {
                        //         bxRq.RQ_POSITION_CASE = caseValue;
                        //     }
                        // }

                        if (
                            bxRq.RQ_COMPANY_NAME &&
                            !bxRq.RQ_COMPANY_NAME.trim()
                        ) {
                            bxRq.RQ_COMPANY_NAME = bxRq.RQ_COMPANY_FULL_NAME;
                        }
                    }
                    if (bxRq.PRESET_ID === preset.fiz) {
                        if (!bxRq.RQ_NAME) {
                            try {
                                bxRq.RQ_NAME =
                                    (bxRq.RQ_LAST_NAME || '') +
                                    (bxRq.RQ_FIRST_NAME || '') +
                                    (bxRq.RQ_SECOND_NAME || '');
                            } catch {
                                // Ignore
                            }
                        }
                    }
                } else {
                    if (!bxRq.RQ_DIRECTOR_CASE) {
                        // TODO: Implement decline_word function
                        // bxRq.RQ_DIRECTOR_CASE = `${declineWord(bxRq.RQ_LAST_NAME)} ${declineWord(bxRq.RQ_FIRST_NAME)} ${declineWord(bxRq.RQ_SECOND_NAME)}`;
                    }
                }

                rq.push(bxRq);
            }

            // Добавляем недостающие пресеты
            if (preset) {
                try {
                    if (!rq.some(item => item.PRESET_ID === preset.org)) {
                        rq.push(
                            new BXRequisiteDTO({
                                ID: -1,
                                ENTITY_ID: companyId,
                                PRESET_ID: 1,
                            }),
                        );
                    }
                    if (!rq.some(item => item.PRESET_ID === preset.ip)) {
                        rq.push(
                            new BXRequisiteDTO({
                                ID: -1,
                                ENTITY_ID: companyId,
                                PRESET_ID: 3,
                            }),
                        );
                    }
                    if (!rq.some(item => item.PRESET_ID === preset.fiz)) {
                        rq.push(
                            new BXRequisiteDTO({
                                ID: -1,
                                ENTITY_ID: companyId,
                                PRESET_ID: 5,
                            }),
                        );
                    }
                } catch {
                    // Ignore
                }
            }

            // Добавляем недостающие адреса и банки
            for (const requisite of rq) {
                // Если нет адреса "Юридический адрес"
                try {
                    if (
                        !requisite.address?.some(
                            addr => addr.TYPE === 'Юридический адрес',
                        )
                    ) {
                        requisite.address = requisite.address || [];
                        requisite.address.push(
                            new Address({
                                TYPE_ID: TypeIdAddress.LEGAL,
                                TYPE: getTypeIdAddressName(TypeIdAddress.LEGAL),
                            }),
                        );
                    }
                } catch {
                    if (!requisite.address) {
                        requisite.address = [];
                    }
                    requisite.address.push(
                        new Address({
                            TYPE_ID: TypeIdAddress.LEGAL,
                            TYPE: getTypeIdAddressName(TypeIdAddress.LEGAL),
                        }),
                    );
                }

                // Если нет адреса "Фактический адрес"
                try {
                    if (
                        !requisite.address?.some(
                            addr => addr.TYPE === 'Фактический адрес',
                        )
                    ) {
                        requisite.address = requisite.address || [];
                        requisite.address.push(
                            new Address({
                                TYPE_ID: TypeIdAddress.FACTUAL,
                                TYPE: getTypeIdAddressName(
                                    TypeIdAddress.FACTUAL,
                                ),
                            }),
                        );
                    }
                } catch {
                    if (!requisite.address) {
                        requisite.address = [];
                    }
                    requisite.address.push(
                        new Address({
                            TYPE_ID: TypeIdAddress.FACTUAL,
                            TYPE: getTypeIdAddressName(TypeIdAddress.FACTUAL),
                        }),
                    );
                }

                // Если нет банка
                try {
                    if (!requisite.bank?.some(b => b.ID)) {
                        requisite.bank = requisite.bank || [];
                        requisite.bank.push(new Bank({ ID: -1, ENTITY_ID: 4 }));
                    }
                } catch {
                    requisite.bank = [];
                    requisite.bank.push(new Bank({ ID: -1, ENTITY_ID: 4 }));
                }
            }

            return rq;
        }

        // Если реквизитов нет, создаем простой реквизит и удаляем его
        try {
            if (!result?.result?.[0]) {
                await this.createSimpleRq(companyId, domain);
                const rqs = await this.getRq(companyId, domain);
                if (rqs.length > 0) {
                    await this.deleteRq(rqs[0].ID, domain);
                    rqs[0].ID = -1;
                    for (const rq of rqs) {
                        if (rq.PRESET_ID === 1) {
                            rq.PRESET_ID = preset.org;
                        } else if (rq.PRESET_ID === 3) {
                            rq.PRESET_ID = preset.ip;
                        } else if (rq.PRESET_ID === 5) {
                            rq.PRESET_ID = preset.fiz;
                        }
                    }
                }
                return rqs;
            }
        } catch {
            // Ignore
        }

        return [];
    }

    async createRq(bxRqs: BXRequisiteDTO, domain: string): Promise<unknown> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);

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

        const updateRqs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(bxRqs)) {
            if (value !== null && value !== undefined && value !== '') {
                updateRqs[key] = value;
            }
        }

        if (bxRqs.customFields) {
            for (const customField of bxRqs.customFields) {
                if (customField.value) {
                    updateRqs[customField.FIELD_NAME] = customField.value;
                }
            }
        }

        const result = (await bitrix.api.call('crm.requisite.add', {
            fields: updateRqs,
        })) as IBitrixResponse<unknown>;
        return result.result;
    }

    async updateRq(
        bxRqs: BXRequisiteDTO,
        rqId: number,
        domain: string,
    ): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        const updateRqs: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(bxRqs)) {
            const cleanValue: unknown = value == null ? '' : value;
            updateRqs[key] = cleanValue;
        }

        if (bxRqs.customFields) {
            for (const customField of bxRqs.customFields) {
                const cleanValue =
                    customField.value == null || customField.value == undefined
                        ? ''
                        : customField.value;
                updateRqs[customField.FIELD_NAME] = cleanValue;
            }
        }

        const result = await bitrix.api.call('crm.requisite.update', {
            id: rqId,
            fields: updateRqs,
        });

        // TODO: Send telegram message if needed
        // await telegramBot.sendMessageAdmin(
        //     `task complited **update_rq**\nrq_id:${rqId}\ndomain:${domain}`,
        // );

        return result;
    }

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

    async updateAddress(domain: string, bxAddress: Address): Promise<boolean> {
        const { bitrix } = await this.pbxService.init(domain);

        bxAddress.TYPE = getTypeIdAddressName(
            bxAddress.TYPE_ID as TypeIdAddress,
        );
        const typeIdValue = normalizeAddressTypeId(bxAddress.TYPE_ID);

        const updateAddress: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(bxAddress)) {
            if (value !== null && value !== undefined && value !== '') {
                updateAddress[key] = value;
            }
        }
        updateAddress.TYPE_ID = typeIdValue;

        // Получаем список адресов
        const listAddress = (await bitrix.api.call('crm.address.list', {
            filter: { ENTITY_ID: bxAddress.ENTITY_ID },
        })) as IBitrixResponse<Partial<Address>[]>;

        const addressCompany: Address[] = [];
        try {
            if (listAddress?.result?.[0]) {
                for (const adr of listAddress.result) {
                    addressCompany.push(new Address(adr));
                }
            }
        } catch (e) {
            console.error(`error: ${e}`);
        }

        if (addressCompany.length === 0) {
            const result = (await bitrix.api.call('crm.address.add', {
                fields: updateAddress,
            })) as { error?: string };
            return !result?.error;
        } else {
            for (const adr of addressCompany) {
                const adrTypeId = normalizeAddressTypeId(adr.TYPE_ID);
                if (adrTypeId === typeIdValue) {
                    const result = (await bitrix.api.call(
                        'crm.address.update',
                        {
                            fields: updateAddress,
                        },
                    )) as { error?: string };
                    return !result?.error;
                }
            }
            const result = (await bitrix.api.call('crm.address.add', {
                fields: updateAddress,
            })) as { error?: string };
            return !result?.error;
        }
    }

    async updateBank(domain: string, bxBank: Bank): Promise<number> {
        console.log('updateBank bxBank', bxBank);
        const { bitrix } = await this.pbxService.init(domain);

        if (bxBank.ID === -1 || bxBank.ID === null || bxBank.ID === undefined) {
            bxBank.ID = null;
            bxBank.NAME = bxBank.RQ_BANK_NAME;
        }

        const updateBank: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(bxBank)) {
            if (value !== null && value !== undefined) {
                updateBank[key] = value;
            }
        }

        let bxId = Number(bxBank.ID);
        if (!bxId) {
            const result = (await bitrix.api.call(
                'crm.requisite.bankdetail.add',
                {
                    fields: updateBank,
                },
            )) as { result?: unknown; error?: string };
            if (result?.error) {
                throw new BadRequestException(result.error);
            }
            bxId = Number(result?.result);
        } else {
            const result = (await bitrix.api.call(
                'crm.requisite.bankdetail.update',
                {
                    id: bxBank.ID,
                    fields: updateBank,
                },
            )) as { error?: string };
            if (result?.error) {
                throw new BadRequestException(result.error);
            }
        }
        return bxId;
    }

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

        const fields: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(rq)) {
            if (value !== null && value !== undefined && value !== '') {
                fields[key] = value;
            }
        }

        return await bitrix.api.call('crm.requisite.add', {
            fields: fields,
        });
    }

    private async deleteRq(rqId: number, domain: string): Promise<any> {
        const { bitrix } = await this.pbxService.init(domain);

        return await bitrix.api.call('crm.requisite.delete', {
            id: rqId,
        });
    }
}
