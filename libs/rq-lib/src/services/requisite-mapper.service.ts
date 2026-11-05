import { Injectable } from '@nestjs/common';
import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
import { ERQDTO, ERQItem, ERQObject } from '../dto/erq-item.dto';
import { ERQField } from '../dto/erq-field.dto';
import { ERQAddress, ERQAddressItem } from '../dto/erq-address.dto';
import { ERQBank, ERQBankItem } from '../dto/erq-bank.dto';
import { CodesField, Names } from '../dto/codes-field';
import { Address } from '../types/bx-address.type';
import { Bank } from '../types/bx-bank.type';
import { AddressFieldName } from '../enums/address-field-name.enum';
import { AddressFieldCode } from '../enums/address-field-code.enum';
import { BankFieldName } from '../enums/bank-field-name.enum';
import { BankFieldCode } from '../enums/bank-field-code.enum';
import { RQ_TYPE } from '../enums/rq-type.enum';
import { normalizeAddressTypeId } from './BxRqService/utils/address.utils';
import { addMissingAddresses } from './BxRqService/utils/address.utils';
import { addMissingBank } from './BxRqService/utils/bank.utils';
import {
    createTemplateRequisite,
    TEMPLATE_RQ_ID,
} from './BxRqService/utils/requisite.utils';
import { PBXService } from '@lib/pbx';
import {
    presetKindOf,
    RqPresetKind,
    RqPresetService,
    RqPresetSet,
} from './rq-preset.service';

const RQ_TYPE_BY_KIND: Record<RqPresetKind, RQ_TYPE> = {
    org: RQ_TYPE.ORGANIZATION,
    ip: RQ_TYPE.IP,
    fiz: RQ_TYPE.FIZ,
};

interface KindGroup {
    items: ERQItem[];
    template: ERQItem | null;
}

/**
 * Реквизиты Bitrix → ответ `get_rq`: по типам клиента, в каждой группе
 * реальные реквизиты и заготовка `default` (bx_id -1) для нового.
 */
@Injectable()
export class RequisiteMapperService {
    constructor(
        private readonly pbxService: PBXService,
        private readonly presetService: RqPresetService,
    ) {}

    async mapBxRequisitesToErqDto(
        bxRqs: BXRequisiteDTO[],
        companyId: number,
        domain: string,
    ): Promise<ERQDTO> {
        const { bitrix, PortalModel } = await this.pbxService.init(domain);
        const presets = await this.presetService.resolve(bitrix, PortalModel);
        const codes = this.getCodesFieldMap();

        const groups: Record<RqPresetKind, KindGroup> = {
            org: { items: [], template: null },
            ip: { items: [], template: null },
            fiz: { items: [], template: null },
        };

        for (const bxRq of bxRqs) {
            // реквизит с чужим пресетом конструктору не нужен
            const kind = presetKindOf(presets, bxRq.PRESET_ID);
            if (!kind) continue;
            const item = this.toItem(bxRq, kind, companyId, codes);
            if (Number(bxRq.ID) === TEMPLATE_RQ_ID) {
                groups[kind].template = item;
            } else {
                groups[kind].items.push(item);
            }
        }

        const toObject = (kind: RqPresetKind): ERQObject => {
            const group = groups[kind];
            const template =
                group.template ??
                this.toItem(
                    this.emptyTemplate(companyId, presets, kind),
                    kind,
                    companyId,
                    codes,
                );
            // Альфацентр и легаси-хуки узнают «пусто» по items[0].bx_id === -1
            return new ERQObject({
                items: group.items.length > 0 ? group.items : [template],
                default: template,
            });
        };

        return new ERQDTO({
            org: toObject('org'),
            fiz: toObject('fiz'),
            ip: toObject('ip'),
            current: groups.org.items[0] ?? groups.fiz.items[0] ?? groups.ip.items[0] ?? null,
        });
    }

    private toItem(
        bxRq: BXRequisiteDTO,
        kind: RqPresetKind,
        companyId: number,
        codes: Record<string, Names>,
    ): ERQItem {
        return new ERQItem({
            bx_id: bxRq.ID,
            fields: this.mapBxRequisiteToErqFields(bxRq, codes),
            address: this.mapBxAddressToErqAddress(bxRq.address, companyId),
            bank: this.mapBxBankToErqBank(bxRq.bank),
            preset_id: Number(bxRq.PRESET_ID),
            type: RQ_TYPE_BY_KIND[kind],
        });
    }

    /** Заготовка, если список пришёл без неё: пустые поля, адреса и банк. */
    private emptyTemplate(
        companyId: number,
        presets: RqPresetSet,
        kind: RqPresetKind,
    ): BXRequisiteDTO {
        const template = createTemplateRequisite(companyId, presets[kind]);
        addMissingAddresses(template, companyId, TEMPLATE_RQ_ID);
        addMissingBank(template);
        return template;
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
                        // REST отдаёт id строкой; фронт сравнивает числа
                        id: Number(bankValue.ID) || -1,
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
}
