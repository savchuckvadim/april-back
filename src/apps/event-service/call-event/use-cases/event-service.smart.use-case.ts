// import { Injectable } from '@nestjs/common';
// import { PortalService } from 'src/modules/portal/portal.service';
// import { BXContactService } from 'src/modules/bitrix/bx-contact.service';
// import { BXSmartService } from 'src/modules/bitrix/bx-smart.service';
// import { BXCompanyService } from 'src/modules/bitrix/bx-company.service';
// import { BXTaskService } from 'src/modules/bitrix/bx-task.service';
// import { BXListService } from 'src/modules/bitrix/bx-list.service';
// import { CallingEventDto } from '../dto/calling-event.dto';
// import { IPSmart } from 'src/modules/portal/interfaces/portal.interface';
// import { PortalModel } from 'src/modules/portal/services/portal.model';
// @Injectable()
// export class EventSmartReportService {
//     private domain: string;
//     private companyId: number;
//     private dealId: number;
//     private taskCompany: any[]; // Placeholder for BXTaskDTO[]
//     private contacts: any[]; // Placeholder for BXContactDTO[]
//     private portal: PortalModel;
//     constructor(
//         private readonly portalService: PortalService,
//         private readonly bxContactService: BXContactService,
//         private readonly bxSmartService: BXSmartService,
//         private readonly bxCompanyService: BXCompanyService,
//         private readonly bxTaskService: BXTaskService,
//         private readonly bxListService: BXListService,
//     ) { }

//     async newEvent(callingEvent: CallingEventDto) {
//         this.domain = callingEvent.domain;
//         this.companyId = callingEvent.bx.companyId as number;
//         this.dealId = callingEvent.bx.dealId as number;
//         this.portal = await this.portalService.getModelByDomain(this.domain);

//         const contacts = await this.bxContactService.getContactsByCompanyId(this.companyId);
//         const pSmart = this.portal.getSmartByCode('service_month');

//         const company = await this.bxCompanyService.getCompanyById(this.companyId);
//         const taskCompany = await this.bxTaskService.getTaskByCompanyId(this.companyId);

//         const pListOrkHistory = this.portal.getListByCode('ork_history');
//         const listOrkHistoryFilter = {
//             [this.portal.getIdByCodeFieldList(pListOrkHistory, 'crm').bitrixCamelId]: [`CO_${this.companyId}`],
//         };
//         const listOrkHistorySelect = portal.getListFieldsSelectAll(pListOrkHistory);
//         const listOrkHistory = await this.bxListService.getElementsList(
//             listOrkHistoryFilter,
//             'ork_history',
//             listOrkHistorySelect,
//         );

//         const now = new Date();
//         const year = now.getFullYear();
//         const month = now.getMonth() + 1;
//         const [firstDate, thirtiethDate] = this.getFirstLastDayOfMonth(year, month);

//         const getSmarts = [];
//         for (const contact of contacts) {
//             contact.UF_CRM_ORK_CALL_FREQUENCY = this.calculatePlannedCommunications(contact.UF_CRM_ORK_CALL_FREQUENCY);
//             contact.UF_CRM_ORK_NEEDS = this.calculateDegreeNeeds(contact.UF_CRM_ORK_NEEDS);

//             getSmarts.push({
//                 entityTypeId: pSmart.entityTypeId,
//                 filter: {
//                     [`ufCrm${pSmart.bitrixId}SmrsCrmContact`]: [contact.ID],
//                     '>=createdTime': firstDate,
//                     '<=createdTime': thirtiethDate,
//                 },
//             });

//             this.bxSmartService.addCmdBatch(`get_smart_contact_${contact.ID}`, 'crm.item.list', {
//                 entityTypeId: pSmart.entityTypeId,
//                 filter: {
//                     [`ufCrm${pSmart.bitrixId}SmrsCrmContact`]: [contact.ID],
//                     '>=createdTime': firstDate,
//                     '<=createdTime': thirtiethDate,
//                 },
//             });
//         }

//         const dealFields = await this.jobInDeal(this.bxDealService, pSmart);

//         this.bxSmartService.addCmdBatch(`get_smart_company_${this.companyId}`, 'crm.item.list', {
//             entityTypeId: pSmart.entityTypeId,
//             filter: {
//                 [`ufCrm${pSmart.bitrixId}SmrsCrmCompany`]: this.companyId,
//                 '>=createdTime': firstDate,
//                 '<=createdTime': thirtiethDate,
//             },
//         });

//         const smarts = await this.bxSmartService.getSmartsBatch();

//         if (typeof smarts === 'string') {
//             return smarts;
//         }

//         // Placeholder for creating new list elements
//         const fieldsElement = {};

//         // CRM
//         const crm = portal.getSmartFieldByCode(pSmart, 'crm');
//         fieldsElement[crm.bitrixId] = [`CO_${this.companyId}`];

//         // Company
//         const fCompany = portal.getSmartFieldByCode(pSmart, 'crm_company');
//         fieldsElement[fCompany.bitrixId] = this.companyId;

//         // Contact
//         const fContact = portal.getSmartFieldByCode(pSmart, 'crm_contact');
//         // Placeholder for contact logic

//         // Client Type
//         const fTypeClient = portal.getSmartFieldByCode(pSmart, 'type_client');
//         // Placeholder for client type logic

//         // Position
//         const fPosition = portal.getSmartFieldByCode(pSmart, 'position');
//         // Placeholder for position logic

//         // Phone
//         const fPhone = portal.getSmartFieldByCode(pSmart, 'phone');
//         // Placeholder for phone logic

//         // Email
//         const fEmail = portal.getSmartFieldByCode(pSmart, 'email');
//         // Placeholder for email logic

//         // Responsible
//         const fResponsible = portal.getSmartFieldByCode(pSmart, 'responsible');
//         fieldsElement[fResponsible.bitrixId] = callingEvent.departament.currentUser.ID;

//         // Count First Education
//         const fCountFirstEdu = portal.getSmartFieldByCode(pSmart, 'count_first_edu');
//         // Placeholder for count first education logic

//         // Responsible First Education
//         const fResponsibleFirstEdu = portal.getSmartFieldByCode(pSmart, 'responsible_first_edu');
//         // Placeholder for responsible first education logic

//         // Count Education
//         const fEduCount = portal.getSmartFieldByCode(pSmart, 'count_edu');
//         // Placeholder for count education logic

//         // Responsible Education
//         const fResponsibleEdu = portal.getSmartFieldByCode(pSmart, 'responsible_edu');
//         // Placeholder for responsible education logic

//         // Date Last Education
//         const fDateLastEdu = portal.getSmartFieldByCode(pSmart, 'date_last_edu');
//         // Placeholder for date last education logic

//         // Date Next Education
//         const fDateNextEdu = portal.getSmartFieldByCode(pSmart, 'date_next_edu');
//         // Placeholder for date next education logic

//         // Count Presentation
//         const fPresCount = portal.getSmartFieldByCode(pSmart, 'count_presentation');
//         // Placeholder for count presentation logic

//         // Responsible Presentation
//         const fResponsiblePresentation = portal.getSmartFieldByCode(pSmart, 'responsible_presentation');
//         // Placeholder for responsible presentation logic

//         // Count Communication Fact
//         const fCountCommunicationFact = portal.getSmartFieldByCode(pSmart, 'count_communication_fact');
//         // Placeholder for count communication fact logic

//         // Count Communication Incoming
//         const fCountCommunicationIncoming = portal.getSmartFieldByCode(pSmart, 'count_communication_incoming');
//         // Placeholder for count communication incoming logic

//         // Count Communication Outgoing
//         const fCountCommunicationOutgoing = portal.getSmartFieldByCode(pSmart, 'count_communication_outgoing');
//         // Placeholder for count communication outgoing logic

//         // Count Signal
//         const fCountSignal = portal.getSmartFieldByCode(pSmart, 'count_signal');
//         // Placeholder for count signal logic

//         // Count Success Signal
//         const fCountSuccessSignal = portal.getSmartFieldByCode(pSmart, 'count_success_signal');
//         // Placeholder for count success signal logic

//         // Count Call
//         const fCountCall = portal.getSmartFieldByCode(pSmart, 'count_call');
//         // Placeholder for count call logic

//         // Date Last Call
//         const fDateLastCall = portal.getSmartFieldByCode(pSmart, 'date_last_call');
//         // Placeholder for date last call logic

//         // Date Next Call
//         const fDateNextCall = portal.getSmartFieldByCode(pSmart, 'date_next_call');
//         // Placeholder for date next call logic

//         // Count Face
//         const fCountFace = portal.getSmartFieldByCode(pSmart, 'count_face');
//         // Placeholder for count face logic

//         // Count Communication Plan
//         const fCountCommunicationPlan = portal.getSmartFieldByCode(pSmart, 'count_communication_plan');
//         // Placeholder for count communication plan logic

//         // Degree Need
//         const fDegreeNeed = portal.getSmartFieldByCode(pSmart, 'degree_need');
//         // Placeholder for degree need logic

//         const clientsField: any[] = [];

//         let countCommunicationPlan = 0;
//         for (const contact of this.contacts) {
//             countCommunicationPlan += contact.UF_CRM_ORK_CALL_FREQUENCY || 0;
//             const client = { bxId: contact.ID, fields: {} };
//             clientsField.push(client);
//         }

//         const client = { bxId: company.ID, fields: { countCommunicationPlan } };
//         clientsField.push(client);

//         for (const element of listOrkHistory) {
//             const client = this.findFieldList(element, pListOrkHistory);
//             const existingClient = clientsField.find(c => c.bxId === client.bxId);
//             if (!existingClient) {
//                 clientsField.push(client);
//             } else {
//                 existingClient.fields.countCommunicationFact += client.fields.countCommunicationFact;
//                 existingClient.fields.countCommunicationIncoming += client.fields.countCommunicationIncoming;
//                 existingClient.fields.countCommunicationOutgoing += client.fields.countCommunicationOutgoing;
//                 existingClient.fields.countPresentation += client.fields.countPresentation;
//                 existingClient.fields.countEdu += client.fields.countEdu;
//                 existingClient.fields.countFirstEdu += client.fields.countFirstEdu;
//                 existingClient.fields.countSignal += client.fields.countSignal;
//                 existingClient.fields.countSuccessSignal += client.fields.countSuccessSignal;
//                 existingClient.fields.countCall += client.fields.countCall;
//                 existingClient.fields.countFace += client.fields.countFace;

//                 existingClient.fields.dateLastEdu = client.fields.dateLastEdu;
//                 existingClient.fields.dateNextEdu = client.fields.dateNextEdu;

//                 existingClient.fields.responsibleFirstEdu = client.fields.responsibleFirstEdu;
//                 if (client.fields.responsibleEdu.length) {
//                     existingClient.fields.responsibleEdu.push(...client.fields.responsibleEdu);
//                 }
//                 if (client.fields.responsiblePresentation.length) {
//                     existingClient.fields.responsiblePresentation.push(...client.fields.responsiblePresentation);
//                 }

//                 existingClient.fields.dateLastCall = client.fields.dateLastCall;
//                 existingClient.fields.dateNextCall = client.fields.dateNextCall;

//                 existingClient.fields.typeClient = client.fields.typeClient;
//                 existingClient.fields.position = client.fields.position;
//                 existingClient.fields.phone = client.fields.phone;
//                 existingClient.fields.email = client.fields.email;
//             }
//         }

//         for (const client of clientsField) {
//             let title = '';
//             let assignedById = null;
//             let contactId = null;
//             let clientId = null;
//             let clientType = '';

//             for (const contact of this.contacts) {
//                 if (contact.ID === client.bxId) {
//                     title = `Контакт: ${contact.NAME}`;
//                     assignedById = contact.ASSIGNED_BY_ID;
//                     contactId = contact.ID;
//                     clientId = contact.ID;
//                     clientType = 'contact';

//                     fieldsElement[fTypeClient.bitrixId] = contact.TYPE_ID;
//                     fieldsElement[fPosition.bitrixId] = contact.POST;
//                     fieldsElement[fPhone.bitrixId] = contact.PHONE;
//                     fieldsElement[fEmail.bitrixId] = contact.EMAIL;
//                     fieldsElement[fCountCommunicationPlan.bitrixId] = contact.UF_CRM_ORK_CALL_FREQUENCY;
//                     fieldsElement[fDegreeNeed.bitrixId] = contact.UF_CRM_ORK_NEEDS;

//                     client.fields.countCommunicationPlan = contact.UF_CRM_ORK_CALL_FREQUENCY || 0;
//                     client.fields.degreeNeed = contact.UF_CRM_ORK_NEEDS;
//                 }
//             }

//             if (!title) {
//                 title = `Компания: ${company.TITLE}`;
//                 assignedById = company.ASSIGNED_BY_ID;
//                 contactId = this.contacts.map(contact => `C_${contact.ID}`);
//                 fieldsElement[crm.bitrixId].push(contactId);
//                 clientId = company.ID;
//                 clientType = 'company';
//                 if (this.contacts.length) {
//                     client.fields.countCommunicationPlan /= this.contacts.length;
//                 }

//                 for (const cFContact of clientsField) {
//                     if (cFContact.bxId === client.bxId) continue;

//                     client.fields.countCommunicationFact += cFContact.fields.countCommunicationFact;
//                     client.fields.countCommunicationIncoming += cFContact.fields.countCommunicationIncoming;
//                     client.fields.countCommunicationOutgoing += cFContact.fields.countCommunicationOutgoing;
//                     client.fields.countPresentation += cFContact.fields.countPresentation;
//                     client.fields.countEdu += cFContact.fields.countEdu;
//                     client.fields.countFirstEdu += cFContact.fields.countFirstEdu;
//                     client.fields.countSignal += cFContact.fields.countSignal;
//                     client.fields.countSuccessSignal += cFContact.fields.countSuccessSignal;
//                     client.fields.countCall += cFContact.fields.countCall;
//                     client.fields.countFace += cFContact.fields.countFace;

//                     client.fields.dateLastEdu = this.compareDates(client.fields.dateLastEdu, cFContact.fields.dateLastEdu, true);
//                     client.fields.dateNextEdu = this.calcDateCallNext('обучение');

//                     const cFItemsFirstEdu = new Set(cFContact.fields.responsibleFirstEdu);
//                     client.fields.responsibleFirstEdu.push(...Array.from(cFItemsFirstEdu).filter(item => !client.fields.responsibleFirstEdu.includes(item)));

//                     const cFItemsEdu = new Set(cFContact.fields.responsibleEdu);
//                     client.fields.responsibleEdu.push(...Array.from(cFItemsEdu).filter(item => !client.fields.responsibleEdu.includes(item)));

//                     const cFItemsPresentation = new Set(cFContact.fields.responsiblePresentation);
//                     client.fields.responsiblePresentation.push(...Array.from(cFItemsPresentation).filter(item => !client.fields.responsiblePresentation.includes(item)));

//                     client.fields.dateLastCall = this.compareDates(client.fields.dateLastCall, cFContact.fields.dateLastCall, true);
//                     client.fields.dateNextCall = this.calcDateCallNext();

//                     const totalNeed = this.contacts.reduce((sum, contact) => sum + contact.UF_CRM_ORK_NEEDS, 0);
//                     // Additional logic will be translated in subsequent steps
//                 }
//             }

//             const params = {
//                 entityTypeId: pSmart.entityTypeId,
//                 fields: {
//                     title,
//                     assignedById,
//                     contactId,
//                     [fContact.bitrixId]: contactId,
//                 },
//             };

//             fieldsElement[fCountCommunicationFact.bitrixId] = client.fields.countCommunicationFact;
//             fieldsElement[fCountCommunicationIncoming.bitrixId] = client.fields.countCommunicationIncoming;
//             fieldsElement[fCountCommunicationOutgoing.bitrixId] = client.fields.countCommunicationOutgoing;

//             fieldsElement[fPresCount.bitrixId] = client.fields.countPresentation;
//             fieldsElement[fCountFirstEdu.bitrixId] = client.fields.countFirstEdu;
//             fieldsElement[fEduCount.bitrixId] = client.fields.countEdu;
//             fieldsElement[fCountSignal.bitrixId] = client.fields.countSignal;
//             fieldsElement[fCountSuccessSignal.bitrixId] = client.fields.countSuccessSignal;
//             fieldsElement[fCountCall.bitrixId] = client.fields.countCall;
//             fieldsElement[fCountFace.bitrixId] = client.fields.countFace;

//             fieldsElement[fCountCommunicationPlan.bitrixId] = client.fields.countCommunicationPlan;

//             fieldsElement[fDateLastCall.bitrixId] = client.fields.dateLastCall;

//             fieldsElement[fDateNextCall.bitrixId] = client.bxId === this.companyId ? this.calcDateCallNext() : this.calcDateCallNext('', client.bxId);

//             fieldsElement[fDateLastEdu.bitrixId] = client.fields.dateLastEdu;

//             fieldsElement[fDateNextEdu.bitrixId] = client.bxId === this.companyId ? this.calcDateCallNext('обучение') : this.calcDateCallNext('обучение', client.bxId);

//             fieldsElement[fResponsibleEdu.bitrixId] = client.fields.responsibleEdu;
//             fieldsElement[fResponsibleFirstEdu.bitrixId] = client.fields.responsibleFirstEdu;
//             fieldsElement[fResponsiblePresentation.bitrixId] = client.fields.responsiblePresentation;

//             fieldsElement[fDegreeNeed.bitrixId] = `${client.fields.degreeNeed} %`;

//             if (client.bxId === company.ID) {
//                 Object.assign(params.fields, dealFields);
//             }

//             Object.assign(params.fields, fieldsElement);

//             if (smarts.length) {
//                 for (const smart of smarts) {
//                     if (title === smart.title) {
//                         params['id'] = smart.id;
//                         break;
//                     }
//                 }
//                 if (!params['id']) {
//                     this.bxSmartService.addCmdBatch(`add_element_${clientType}_${clientId}`, 'crm.item.add', params);
//                 } else {
//                     this.bxSmartService.addCmdBatch(`update_element_${clientType}_${smart.id}`, 'crm.item.update', params);
//                 }
//             } else {
//                 this.bxSmartService.addCmdBatch(`add_element_${clientType}_${clientId}`, 'crm.item.add', params);
//             }
//         }

//         const res = await this.bxSmartService.callBatch();
//         return res;
//     }

//     private getFirstLastDayOfMonth(year: number, month: number): [Date, Date] {
//         const firstDay = new Date(year, month - 1, 1);
//         const lastDay = new Date(year, month, 0);
//         return [firstDay, lastDay];
//     }

//     private calculatePlannedCommunications(value: any): any {
//         // Placeholder for calculation logic
//         return value;
//     }

//     private calculateDegreeNeeds(value: any): any {
//         // Placeholder for calculation logic
//         return value;
//     }

//     private async jobInDeal(bxDealService: any, pSmart: any): Promise<any> {
//         const fieldDealFilter = {
//             COMPANY_ID: this.companyId,
//             CATEGORY_ID: this.portal.getDealCategoryByCode('service_base').bitrixId,
//         };
//         const selectDeal = this.portal.getDealFieldsSelectAll('service_base');
//         const deal = await bxDealService.getDealByFields(fieldDealFilter, selectDeal);

//         if (!deal.length) {
//             return {};
//         }
//         const dealData = deal[0];

//         const fields: any = {};
//         fields[this.portal.getSmartFieldByCode(pSmart, 'date_last_call').bitrixId] = dealData.UF_CRM_CALL_LAST_DATE;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'date_next_call').bitrixId] = dealData.UF_CRM_CALL_NEXT_DATE;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'date_last_edu').bitrixId] = dealData.UF_CRM_ORK_LAST_EDU_DATE;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'date_next_edu').bitrixId] = dealData.UF_CRM_ORK_NEXT_EDU_DATE;

//         const dealConcurent = dealData.UF_CRM_OP_CONCURENTS;
//         let dealConcurentItem = '';
//         if (dealConcurent) {
//             const concurentItem = this.portal.getDealFieldItemByBitrixID(parseInt(dealConcurent));
//             dealConcurentItem = concurentItem ? concurentItem.name : '';
//         }
//         fields[this.portal.getSmartFieldByCode(pSmart, 'concurent').bitrixId] = dealConcurentItem;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'supply_date').bitrixId] = dealData.UF_CRM_SUPPLY_DATE;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'contract_start').bitrixId] = dealData.UF_CRM_CONTRACT_START;
//         fields[this.portal.getSmartFieldByCode(pSmart, 'contract_end').bitrixId] = dealData.UF_CRM_CONTRACT_END;

//         const productRowDeal = await this.productRowDeal(bxDealService);
//         fields[this.portal.getSmartFieldByCode(pSmart, 'complect_name').bitrixId] = productRowDeal;

//         const delKeys = [];
//         for (const [key, value] of Object.entries(fields)) {
//             if (value === null) {
//                 delKeys.push(key);
//             }
//             const keysDate = ['date', 'contractstart', 'contractend'];
//             if (keysDate.some(dateValue => key.toLowerCase().includes(dateValue))) {
//                 if (value) {
//                     const date = new Date(value);
//                     fields[key] = date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
//                 }
//             }
//         }

//         for (const key of delKeys) {
//             delete fields[key];
//         }

//         return fields;
//     }

//     async productRowDeal(bxDealService: any): Promise<any[]> {
//         const productRowDeal = await bxDealService.getProductRows(this.dealId);

//         return productRowDeal.map(row => row.PRODUCT_NAME);
//     }

//     private compareDates(dateLast: string, dateNext: string, reverse: boolean = false): string {
//         const dateFormat = 'DD.MM.YYYY'; // Placeholder for actual date format
//         let date1: Date;
//         let date2: Date;

//         try {
//             date1 = new Date(dateLast);
//         } catch {
//             return reverse ? dateNext : dateLast;
//         }

//         try {
//             date2 = new Date(dateNext);
//         } catch {
//             return dateLast;
//         }

//         if (!reverse) {
//             return date1 > date2 ? dateLast : dateNext;
//         }

//         return date1 < date2 ? dateNext : dateLast;
//     }

//     private findFieldList(element: any, pListOrkHistory: any): any {
//         // Placeholder for find field list logic
//         const clientField: any = {};

//         // Example of field retrieval
//         const fieldOrkCrmCompany = this.portal.getIdByCodeFieldList(pListOrkHistory, 'ork_crm_company');
//         const fieldOrkCrmContact = this.portal.getIdByCodeFieldList(pListOrkHistory, 'ork_crm_contact');

//         // Placeholder for additional field logic

//         return clientField;
//     }

//     private calcDateCallNext(title: string = '', cont: any = null): any {
//         // Placeholder for calculate date call next logic
//         return new Date();
//     }
// } 