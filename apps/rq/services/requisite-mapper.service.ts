import { Injectable } from '@nestjs/common';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { ERQDTO, ERQItem, ERQObject } from '../dto/erq-item.dto';
import { ERQField } from '../dto/erq-field.dto';
import { ERQAddress, ERQAddressItem } from '../dto/erq-address.dto';
import { ERQBank, ERQBankItem } from '../dto/erq-bank.dto';
import { CodesField, Names } from '../dto/codes-field';
import { Address } from '../types/bx-address.type';
import { Bank } from '../types/bx-bank.type';
import { PresetCode } from '../enums/preset-code.enum';
import { AddressFieldName } from '../enums/address-field-name.enum';
import { AddressFieldCode } from '../enums/address-field-code.enum';
import { BankFieldName } from '../enums/bank-field-name.enum';
import { BankFieldCode } from '../enums/bank-field-code.enum';
import { TypeIdAddress } from '../types/type-id-address.enum';
import { RQ_TYPE } from '../enums/rq-type.enum';
import { normalizeAddressTypeId } from './BxRqService/utils/address.utils';
import { PBXService } from '@lib/pbx';

@Injectable()
export class RequisiteMapperService {
    constructor(private readonly pbxService: PBXService) {}

    async mapBxRequisitesToErqDto(
        bxRqs: BXRequisiteDTO[],
        companyId: number,
        domain: string,
    ): Promise<ERQDTO> {
        const { PortalModel } = await this.pbxService.init(domain);

        const codes = this.getCodesFieldMap();
        const eventRqOrg: ERQItem[] = [];
        const eventRqIp: ERQItem[] = [];
        const eventRqFiz: ERQItem[] = [];

        for (const bxRq of bxRqs) {
            const eventRequisiteDto = this.mapBxRequisiteToErqFields(
                bxRq,
                codes,
            );
            const address = this.mapBxAddressToErqAddress(
                bxRq.address,
                companyId,
            );
            const bank = this.mapBxBankToErqBank(bxRq.bank);

            const presetOrg = PortalModel.getPresetForName(PresetCode.ORG);
            const presetIp = PortalModel.getPresetForName(PresetCode.IP);
            const presetFiz = PortalModel.getPresetForName(PresetCode.FIZ);
            const type = this.getRqType(
                Number(bxRq.PRESET_ID),
                presetOrg?.bitrix_id || 0,
                presetIp?.bitrix_id || 0,
                presetFiz?.bitrix_id || 0,
            );

            const erqItem = new ERQItem({
                bx_id: bxRq.ID,
                fields: eventRequisiteDto,
                address: address,
                bank: bank,
                preset_id: Number(bxRq.PRESET_ID),
                type,
            });

            if (presetOrg && bxRq.PRESET_ID === presetOrg.bitrix_id) {
                eventRqOrg.push(erqItem);
            } else if (presetIp && bxRq.PRESET_ID === presetIp.bitrix_id) {
                eventRqIp.push(erqItem);
            } else if (presetFiz && bxRq.PRESET_ID === presetFiz.bitrix_id) {
                eventRqFiz.push(erqItem);
            }
        }

        const current = this.getCurrentRequisite(
            eventRqOrg,
            eventRqFiz,
            eventRqIp,
        );
        // const defaultItem = this.createDefaultItem(current);

        const result = new ERQDTO({
            org: new ERQObject({
                items: eventRqOrg,
                default: eventRqOrg.find(item => item.bx_id === -1) || null,
            }),
            fiz: new ERQObject({
                items: eventRqFiz,
                default: eventRqFiz.find(item => item.bx_id === -1) || null,
            }),
            ip: new ERQObject({
                items: eventRqIp,
                default: eventRqIp.find(item => item.bx_id === -1) || null,
            }),
            current: current,
        });

        return result;
    }

    private getRqType(
        presetId: number,
        presetOrgBitrixId: number,
        presetIpBitrixId: number,
        presetFizBitrixId: number,
    ): RQ_TYPE {
        if (Number(presetId) === Number(presetOrgBitrixId)) {
            return RQ_TYPE.ORGANIZATION;
        } else if (Number(presetId) === Number(presetIpBitrixId)) {
            return RQ_TYPE.IP;
        } else if (Number(presetId) === Number(presetFizBitrixId)) {
            return RQ_TYPE.FIZ;
        }
        return RQ_TYPE.ORGANIZATION;
    }
    private getCodesFieldMap(): Record<string, Names> {
        const codes: Record<string, Names> = {};
        const codesFieldKeys = Object.keys(CodesField);
        for (const name of codesFieldKeys) {
            if (name === 'constructor' || name === 'prototype') {
                continue;
            }
            const fieldValue = CodesField[name] as Names;
            if (fieldValue && fieldValue.code) {
                codes[name] = fieldValue;
            }
        }
        return codes;
    }

    private mapBxRequisiteToErqFields(
        bxRq: BXRequisiteDTO,
        codes: Record<string, Names>,
    ): ERQField[] {
        const eventRequisiteDto: ERQField[] = [];

        for (const codeName of Object.keys(codes)) {
            const code = codes[codeName];
            let value = bxRq[codeName] as string | number | null;
            if (!value) {
                value = '';
            }

            // Пропускаем address и bank - они обрабатываются отдельно
            if (code.code.includes('address') || code.code.includes('bank')) {
                continue;
            }
            const field = new ERQField({
                type: code.type,
                name: code.name,
                value: value,
                code: code.code,
                includes: code.includes,
                order: code.order,
            });

            eventRequisiteDto.push(field);
        }

        return eventRequisiteDto;
    }

    private mapBxAddressToErqAddress(
        addresses: Address[] | null | undefined,
        companyId: number,
    ): ERQAddress {
        const addressFieldsItems: ERQAddressItem[] = [];

        if (addresses) {
            for (const adr of addresses) {
                if (
                    Number(adr.ANCHOR_ID) !== Number(companyId) &&
                    Number(adr.ANCHOR_ID) !== -1
                ) {
                    continue;
                }

                const addressFields: ERQField[] = [];

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.POSTAL_CODE,
                        value: adr.POSTAL_CODE || '',
                        code: AddressFieldCode.POSTAL_CODE,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.COUNTRY,
                        value: adr.COUNTRY || '',
                        code: AddressFieldCode.COUNTRY,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.PROVINCE,
                        value: adr.PROVINCE || '',
                        code: AddressFieldCode.PROVINCE,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.REGION,
                        value: adr.REGION || '',
                        code: AddressFieldCode.REGION,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.CITY,
                        value: adr.CITY || '',
                        code: AddressFieldCode.CITY,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.ADDRESS_1,
                        value: adr.ADDRESS_1 || '',
                        code: AddressFieldCode.ADDRESS_1,
                    }),
                );

                addressFields.push(
                    new ERQField({
                        type: 'string',
                        name: AddressFieldName.ADDRESS_2,
                        value: adr.ADDRESS_2 || '',
                        code: AddressFieldCode.ADDRESS_2,
                    }),
                );

                const typeIdValue = normalizeAddressTypeId(adr.TYPE_ID);

                addressFieldsItems.push({
                    type_id: typeIdValue,
                    anchor_id: adr.ANCHOR_ID || -1,
                    name_type: adr.TYPE || '',
                    fields: [...addressFields],
                } as ERQAddressItem);
            }
        }

        return new ERQAddress({
            items: addressFieldsItems,
            current:
                addressFieldsItems.length > 0 ? addressFieldsItems[0] : null,
        });
    }

    private mapBxBankToErqBank(banks: Bank[] | null | undefined): ERQBank {
        const bankItems: ERQBankItem[] = [];

        if (banks) {
            for (const bankValue of banks) {
                const bankFields: ERQField[] = [];
                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.BANK_NAME,
                        value: bankValue.RQ_BANK_NAME || '',
                        code: BankFieldCode.BANK_NAME,
                    }),
                );

                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.BANK_ADDRESS,
                        value: bankValue.RQ_BANK_ADDR || '',
                        code: BankFieldCode.BANK_ADDRESS,
                    }),
                );

                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.BIK,
                        value: bankValue.RQ_BIK || '',
                        code: BankFieldCode.BIK,
                    }),
                );

                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.PC,
                        value: bankValue.RQ_ACC_NUM || '',
                        code: BankFieldCode.PC,
                    }),
                );

                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.KC,
                        value: bankValue.RQ_COR_ACC_NUM || '',
                        code: BankFieldCode.KC,
                    }),
                );

                bankFields.push(
                    new ERQField({
                        type: 'string',
                        name: BankFieldName.COMMENTS,
                        value: bankValue.COMMENTS || '',
                        code: BankFieldCode.COMMENTS,
                    }),
                );

                bankItems.push(
                    new ERQBankItem({
                        id: bankValue.ID || -1,
                        fields: [...bankFields],
                    }),
                );
            }
        }

        return new ERQBank({
            items:
                bankItems.length > 0 ? [bankItems[bankItems.length - 1]] : null,
            current:
                bankItems.length > 0 ? bankItems[bankItems.length - 1] : null,
        });
    }

    private getCurrentRequisite(
        eventRqOrg: ERQItem[],
        eventRqFiz: ERQItem[],
        eventRqIp: ERQItem[],
    ): ERQItem | null {
        if (eventRqOrg.length > 0 && eventRqOrg[0]?.bx_id !== -1) {
            return eventRqOrg[0];
        } else if (eventRqFiz.length > 0 && eventRqFiz[0]?.bx_id !== -1) {
            return eventRqFiz[0];
        } else if (eventRqIp.length > 0 && eventRqIp[0]?.bx_id !== -1) {
            return eventRqIp[0];
        }
        return null;
    }

    private createDefaultItem(current: ERQItem | null): ERQItem | null {
        if (!current) {
            return null;
        }

        const defaultItem = this.deepCopy(current);
        for (const defaultField of defaultItem.fields) {
            defaultField.value = '';
        }

        if (defaultItem.address) {
            if (defaultItem.address.current) {
                for (const defaultField of defaultItem.address.current.fields) {
                    defaultField.value = '';
                }
            }
        }

        if (defaultItem.bank?.current) {
            for (const defaultField of defaultItem.bank.current.fields) {
                defaultField.value = '';
            }
        }

        if (defaultItem.address) {
            defaultItem.address.items = defaultItem.address.items.filter(
                addr =>
                    (addr.type_id as TypeIdAddress) === TypeIdAddress.LEGAL ||
                    (addr.type_id as TypeIdAddress) === TypeIdAddress.FACTUAL,
            );
            for (const aItem of defaultItem.address.items) {
                aItem.anchor_id = -1;
                for (const fItem of aItem.fields) {
                    fItem.value = '';
                }
            }
        }

        if (defaultItem.address?.current) {
            defaultItem.address.current.anchor_id = -1;
        }

        if (defaultItem.bank) {
            defaultItem.bank.items = [];
            if (defaultItem.bank.current) {
                defaultItem.bank.current.id = -1;
            }
        }

        defaultItem.bx_id = -1;

        return defaultItem;
    }

    private deepCopy<T>(obj: T): T {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj.getTime()) as unknown as T;
        }

        if (Array.isArray(obj)) {
            return obj.map((item: unknown) =>
                this.deepCopy(item),
            ) as unknown as T;
        }

        const copy: Record<string, unknown> = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                copy[key] = this.deepCopy(
                    (obj as Record<string, unknown>)[key],
                );
            }
        }
        return copy as T;
    }
}
