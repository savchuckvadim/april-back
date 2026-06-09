// import { Injectable } from '@nestjs/common';
// import { RequisiteService } from './requisite.service';
// import { PBXService } from '@/modules/pbx';
// import { TypeTask } from '../dto/type-task.enum';
// import { ERQDTO } from '../dto/erq-item.dto';
// import { ERQItem } from '../dto/erq-item.dto';
// import { ERQField } from '../dto/erq-field.dto';
// import { ERQAddress, ERQAddressItem } from '../dto/erq-address.dto';
// import { ERQBank, ERQBankItem } from '../dto/erq-bank.dto';
// import { ERQObject } from '../dto/erq-item.dto';
// import { CodesField } from '../dto/codes-field';
// import { BXRequisiteDTO } from '../types/bx-requisite-dto.type';
// import { Address } from '../types/bx-address.type';
// import { Bank } from '../types/bx-bank.type';
// import { TypeIdAddress } from '../types/type-id-address.enum';

// @Injectable()
// export class EventTaskService {
//     constructor(
//         private readonly requisiteService: RequisiteService,
//         private readonly pbxService: PBXService,
//     ) {}

//     async addOnTask(
//         data: Record<string, any>,
//         typeTask: TypeTask,
//     ): Promise<ERQDTO | ERQItem | string | Record<string, any>> {
//         const companyId = data.company_id;
//         const domain = data.domain;
//         const rqId = data.rq_id;
//         const presetId = data.preset_id;

//         if (!companyId || !domain) {
//             return 'Not full data';
//         }

//         let eventRq: ERQItem | undefined;

//         if (data.rq) {
//             const requisite = data.rq;
//             try {
//                 eventRq = new ERQItem(requisite);
//                 eventRq.preset_id = presetId;
//             } catch (e: any) {
//                 // TODO: Send telegram error message if needed
//                 // await TelegramBot().send_message_admin_error(
//                 //     `add_on_task ${String(e)} ${JSON.stringify(requisite)}`,
//                 //     domain,
//                 // );
//             }
//         }

//         if (data.iswait) {
//             const bxRqs: BXRequisiteDTO[] = await this.requisiteService.getRq(
//                 companyId,
//                 domain,
//             );

//             // Словарь для сопоставления кодов с именами атрибутов
//             const codeToAttributeMap: Record<string, string> = {};
//             const codesFieldKeys = Object.keys(CodesField);
//             for (const fieldName of codesFieldKeys) {
//                 if (fieldName === 'constructor' || fieldName === 'prototype') {
//                     continue;
//                 }
//                 const fieldValue = (CodesField as any)[fieldName];
//                 if (fieldValue && fieldValue.code && typeof fieldValue.code === 'string') {
//                     codeToAttributeMap[fieldValue.code] = fieldName;
//                 }
//             }

//             if (typeTask === TypeTask.UPDATE_RQ) {
//                 if (!eventRq) {
//                     return 'Not full data';
//                 }

//                 eventRq.bx_id = rqId;

//                 for (const eventRequisite of eventRq.fields) {
//                     for (const bxRq of bxRqs) {
//                         if (bxRq.ID === Number(rqId)) {
//                             const updateRq = bxRq;

//                             // Получаем имя атрибута из словаря
//                             const attributeName = codeToAttributeMap[eventRequisite.code];
//                             if (attributeName) {
//                                 // Обновляем атрибут объекта bxRq
//                                 (bxRq as any)[attributeName] = eventRequisite.value;
//                             }

//                             if (!bxRq.customFields) {
//                                 continue;
//                             }

//                             for (const customField of bxRq.customFields) {
//                                 const customXmlId = customField.XML_ID?.trim() || '';
//                                 if (customXmlId === eventRequisite.code) {
//                                     customField.value = eventRequisite.value;
//                                 }
//                             }
//                         }
//                     }
//                 }

//                 const updateRq = bxRqs.find((rq) => rq.ID === Number(rqId));

//                 if (rqId === -1) {
//                     if (!updateRq) {
//                         return 'Not full data';
//                     }

//                     updateRq.ENTITY_TYPE_ID = 4;
//                     updateRq.ENTITY_ID = companyId;
//                     updateRq.PRESET_ID = eventRq.preset_id;

//                     if (eventRq.preset_id === 1) {
//                         updateRq.NAME = 'Организация';
//                     } else if (eventRq.preset_id === 3) {
//                         updateRq.NAME = 'ИП';
//                     } else if (eventRq.preset_id === 5) {
//                         updateRq.NAME = 'Физ. лицо';
//                     }

//                     const task = await this.requisiteService.createRq(
//                         updateRq,
//                         domain,
//                         eventRq.preset_id!,
//                     );

//                     if (typeof task === 'string') {
//                         return task;
//                     }

//                     return { bx_id: task?.result?.[0] };
//                 } else {
//                     if (!updateRq) {
//                         return 'Not full data';
//                     }

//                     await this.requisiteService.updateRq(updateRq, rqId, domain);
//                 }

//                 return eventRq;
//             } else if (typeTask === TypeTask.UPDATE_ADDRESS) {
//                 const address = data.address;
//                 const addressItem = new ERQAddressItem(address);
//                 const result = await this.updateAddress(
//                     addressItem,
//                     rqId!,
//                     domain,
//                 );
//                 return result;
//             } else if (typeTask === TypeTask.UPDATE_BANK) {
//                 const bank = data.bank;
//                 const bankItem = new ERQBankItem(bank);
//                 const result = await this.updateBank(bankItem, domain, rqId!);
//                 return result;
//             }

//             // Перегнать из BX RQ DTO в Event DTO
//             const codes: Record<string, any> = {};
//             const codesFieldKeys = Object.keys(CodesField);
//             for (const name of codesFieldKeys) {
//                 if (name === 'constructor' || name === 'prototype') {
//                     continue;
//                 }
//                 const fieldValue = (CodesField as any)[name];
//                 if (fieldValue && fieldValue.code) {
//                     codes[name] = fieldValue;
//                 }
//             }

//             const eventRqOrg: ERQItem[] = [];
//             const eventRqIp: ERQItem[] = [];
//             const eventRqFiz: ERQItem[] = [];

//             if (bxRqs.length > 0) {
//                 const { PortalModel } = await this.pbxService.init(domain);

//                 for (const bxRq of bxRqs) {
//                     const eventRequisiteDto: ERQField[] = [];
//                     let address: ERQAddress;
//                     const addressFieldsItems: ERQAddressItem[] = [];
//                     let addressFields: ERQField[] = [];

//                     const bankItems: ERQBankItem[] = [];
//                     let bankFields: ERQField[] = [];

//                     for (const codeName of Object.keys(codes)) {
//                         const code = codes[codeName];
//                         // Получаем значение атрибута из bxRq
//                         let value = (bxRq as any)[codeName];
//                         if (!value) {
//                             value = '';
//                         }

//                         if (code.code.includes('address')) {
//                             if (bxRq.address) {
//                                 for (const adr of bxRq.address) {
//                                     if (
//                                         adr.ANCHOR_ID !== Number(companyId) &&
//                                         adr.ANCHOR_ID !== -1
//                                     ) {
//                                         continue;
//                                     }

//                                     addressFields = [];
//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Страна',
//                                             value: adr.COUNTRY || '',
//                                             code: 'address_country',
//                                         }),
//                                     );

//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Район',
//                                             value: adr.REGION || '',
//                                             code: 'address_region',
//                                         }),
//                                     );

//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Город',
//                                             value: adr.CITY || '',
//                                             code: 'address_city',
//                                         }),
//                                     );

//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Улица, дом, корпус, строение',
//                                             value: adr.ADDRESS_1 || '',
//                                             code: 'address_1',
//                                         }),
//                                     );

//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Квартира / офис',
//                                             value: adr.ADDRESS_2 || '',
//                                             code: 'address_2',
//                                         }),
//                                     );

//                                     addressFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Почтовый индекс',
//                                             value: adr.POSTAL_CODE || '',
//                                             code: 'address_postal_code',
//                                         }),
//                                     );

//                                     const typeIdValue =
//                                         typeof adr.TYPE_ID === 'number'
//                                             ? adr.TYPE_ID
//                                             : (adr.TYPE_ID as any)?.value ||
//                                               adr.TYPE_ID;

//                                     addressFieldsItems.push(
//                                         new ERQAddressItem({
//                                             type_id: typeIdValue as number,
//                                             anchor_id: adr.ANCHOR_ID || -1,
//                                             name_type: adr.TYPE || '',
//                                             fields: [...addressFields],
//                                         }),
//                                     );
//                                 }
//                             }
//                             continue;
//                         }

//                         if (code.code.includes('bank')) {
//                             if (bxRq.bank) {
//                                 for (const bankValue of bxRq.bank) {
//                                     bankFields = [];
//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Наименование банка',
//                                             value: bankValue.RQ_BANK_NAME || '',
//                                             code: 'bank_name',
//                                         }),
//                                     );

//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Адрес банка',
//                                             value: bankValue.RQ_BANK_ADDR || '',
//                                             code: 'bank_address',
//                                         }),
//                                     );

//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'БИК',
//                                             value: bankValue.RQ_BIK || '',
//                                             code: 'bank_bik',
//                                         }),
//                                     );

//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'р/с',
//                                             value: bankValue.RQ_ACC_NUM || '',
//                                             code: 'bank_pc',
//                                         }),
//                                     );

//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'к/с',
//                                             value: bankValue.RQ_COR_ACC_NUM || '',
//                                             code: 'bank_kc',
//                                         }),
//                                     );

//                                     bankFields.push(
//                                         new ERQField({
//                                             type: 'string',
//                                             name: 'Комментарий',
//                                             value: bankValue.COMMENTS || '',
//                                             code: 'comments',
//                                         }),
//                                     );

//                                     bankItems.push(
//                                         new ERQBankItem({
//                                             id: bankValue.ID || -1,
//                                             fields: [...bankFields],
//                                         }),
//                                     );
//                                 }
//                             }
//                             continue;
//                         }

//                         eventRequisiteDto.push(
//                             new ERQField({
//                                 type: code.type,
//                                 name: code.name,
//                                 value: value,
//                                 code: code.code,
//                                 includes: code.includes.map((inc: any) =>
//                                     typeof inc === 'string' ? inc : inc.value || inc,
//                                 ),
//                                 order: code.order,
//                             }),
//                         );
//                     }

//                     address = new ERQAddress({
//                         items: addressFieldsItems,
//                         current:
//                             addressFieldsItems.length > 0
//                                 ? addressFieldsItems[0]
//                                 : null,
//                     });

//                     const bank = new ERQBank({
//                         items: bankItems.length > 0 ? [bankItems[bankItems.length - 1]] : null,
//                         current: bankItems.length > 0 ? bankItems[bankItems.length - 1] : null,
//                     });

//                     const presetOrg = PortalModel.getPresetForName('preset_org');
//                     const presetIp = PortalModel.getPresetForName('preset_ip');
//                     const presetFiz = PortalModel.getPresetForName('preset_fiz');

//                     if (bxRq.PRESET_ID === presetOrg.bitrixId) {
//                         eventRqOrg.push(
//                             new ERQItem({
//                                 bx_id: bxRq.ID,
//                                 fields: eventRequisiteDto,
//                                 address: address,
//                                 bank: bank,
//                             }),
//                         );
//                     } else if (bxRq.PRESET_ID === presetIp.bitrixId) {
//                         eventRqIp.push(
//                             new ERQItem({
//                                 bx_id: bxRq.ID,
//                                 fields: eventRequisiteDto,
//                                 address: address,
//                                 bank: bank,
//                             }),
//                         );
//                     } else if (bxRq.PRESET_ID === presetFiz.bitrixId) {
//                         eventRqFiz.push(
//                             new ERQItem({
//                                 bx_id: bxRq.ID,
//                                 fields: eventRequisiteDto,
//                                 address: address,
//                                 bank: bank,
//                             }),
//                         );
//                     }
//                 }
//             }

//             let current: ERQItem | null = null;
//             if (eventRqOrg.length > 0) {
//                 current = eventRqOrg[0];
//             } else if (eventRqFiz.length > 0) {
//                 current = eventRqFiz[0];
//             } else if (eventRqIp.length > 0) {
//                 current = eventRqIp[0];
//             }

//             let defaultItem: ERQItem | null = null;
//             if (current) {
//                 defaultItem = this.deepCopy(current);
//                 for (const defaultField of defaultItem.fields) {
//                     defaultField.value = '';
//                 }
//                 if (defaultItem.address) {
//                     if (defaultItem.address.current) {
//                         for (const defaultField of defaultItem.address.current.fields) {
//                             defaultField.value = '';
//                         }
//                     }
//                 }
//                 if (defaultItem.bank?.current) {
//                     for (const defaultField of defaultItem.bank.current.fields) {
//                         defaultField.value = '';
//                     }
//                 }

//                 if (defaultItem.address) {
//                     defaultItem.address.items = defaultItem.address.items.filter(
//                         (addr) => addr.type_id === 6 || addr.type_id === 1,
//                     );
//                     for (const aItem of defaultItem.address.items) {
//                         aItem.anchor_id = -1;
//                         for (const fItem of aItem.fields) {
//                             fItem.value = '';
//                         }
//                     }
//                 }

//                 if (defaultItem.address?.current) {
//                     defaultItem.address.current.anchor_id = -1;
//                 }

//                 if (defaultItem.bank) {
//                     defaultItem.bank.items = [];
//                     if (defaultItem.bank.current) {
//                         defaultItem.bank.current.id = -1;
//                     }
//                 }

//                 defaultItem.bx_id = -1;
//             }

//             const eRq = new ERQDTO({
//                 org: new ERQObject({
//                     items: eventRqOrg,
//                     default: defaultItem,
//                 }),
//                 fiz: new ERQObject({
//                     items: eventRqFiz,
//                     default: defaultItem,
//                 }),
//                 ip: new ERQObject({
//                     items: eventRqIp,
//                     default: defaultItem,
//                 }),
//                 current: current,
//             });

//             await this.requisiteService.setSelectedRq(
//                 companyId,
//                 current?.bx_id || -1,
//                 current?.bank?.current?.id || -1,
//                 domain,
//             );

//             return eRq;
//         }

//         if (typeTask === TypeTask.GET_RQ) {
//             // TODO: Implement queue task if needed
//             // task = await Requisite().add_task_get_qr(
//             //     company_id=companyId,
//             //     domain=domain,
//             // );
//             return 'Task queued';
//         } else if (typeTask === TypeTask.UPDATE_RQ) {
//             return 'Используйте iswait true';
//         } else {
//             // TODO: Send telegram message if needed
//             // await TelegramBot().send_message_portal(
//             //     chat_id=os.getenv("GROUP_CHAT_ID"),
//             //     message=`Неизвестная новая задача: \`\`\`json\ndata: ${JSON.stringify(data)}\`\`\``,
//             // );
//             return 'Error';
//         }
//     }

//     async updateAddress(
//         address: ERQAddressItem,
//         rqId: number,
//         domain: string,
//     ): Promise<any> {
//         const bxAddress = new Address({
//             TYPE_ID: address.type_id as TypeIdAddress,
//             ENTITY_TYPE_ID: 8,
//             ENTITY_ID: rqId,
//         });

//         for (const field of address.fields) {
//             if (field.code === 'address_1') {
//                 bxAddress.ADDRESS_1 = field.value as string;
//             } else if (field.code === 'address_2') {
//                 bxAddress.ADDRESS_2 = field.value as string;
//             } else if (field.code === 'address_city') {
//                 bxAddress.CITY = field.value as string;
//             } else if (field.code === 'address_region') {
//                 bxAddress.REGION = field.value as string;
//             } else if (field.code === 'address_country') {
//                 bxAddress.COUNTRY = field.value as string;
//             } else if (field.code === 'address_postal_code') {
//                 bxAddress.POSTAL_CODE = field.value as string;
//             }
//         }

//         const result = await this.requisiteService.updateAddress(domain, bxAddress);
//         return result;
//     }

//     async updateBank(
//         bank: ERQBankItem,
//         domain: string,
//         rqId: number,
//     ): Promise<any> {
//         const bxBank = new Bank({
//             ID: bank.id,
//             ENTITY_ID: rqId,
//         });

//         for (const field of bank.fields) {
//             if (field.code === 'bank_kc') {
//                 bxBank.RQ_COR_ACC_NUM = field.value as string;
//             } else if (field.code === 'bank_pc') {
//                 bxBank.RQ_ACC_NUM = field.value as string;
//             } else if (field.code === 'bank_bik') {
//                 bxBank.RQ_BIK = field.value as string;
//             } else if (field.code === 'bank_address') {
//                 bxBank.RQ_BANK_ADDR = field.value as string;
//             } else if (field.code === 'bank_name') {
//                 bxBank.RQ_BANK_NAME = field.value as string;
//             } else if (field.code === 'comments') {
//                 bxBank.COMMENTS = field.value as string;
//             }
//         }

//         return await this.requisiteService.updateBank(domain, bxBank);
//     }

//     private deepCopy<T>(obj: T): T {
//         // Deep copy with proper handling of classes
//         if (obj === null || typeof obj !== 'object') {
//             return obj;
//         }

//         if (obj instanceof Date) {
//             return new Date(obj.getTime()) as any;
//         }

//         if (obj instanceof Array) {
//             return obj.map((item) => this.deepCopy(item)) as any;
//         }

//         if (typeof obj === 'object') {
//             const copy: any = {};
//             for (const key in obj) {
//                 if (obj.hasOwnProperty(key)) {
//                     copy[key] = this.deepCopy((obj as any)[key]);
//                 }
//             }
//             return copy;
//         }

//         return obj;
//     }
// }
