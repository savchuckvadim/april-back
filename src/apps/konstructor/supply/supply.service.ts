import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

@Injectable()
export class SupplyService {
    async initSupply(request: Request): Promise<number> {
        // Placeholder for setBxField function
        const setBxField = async (fieldCode: string, value: any) => {
            try {
                // Simulate getting bitrixId
                const bitrixId = 'simulatedBitrixId';
                const bxFields = {};
                bxFields[`UF_RPA_${'simulatedRpaId'}_${bitrixId}`] = value;
            } catch (e) {
                // Simulate sending error message
                console.error(
                    `setBxField: ${e}\nfield: ${fieldCode}\nvalue: ${value}`,
                );
            }
        };

        // Placeholder for getContractSpecificationState function
        const getContractSpecificationState = (
            contractSpecificationState: any,
        ) => {
            try {
                contractSpecificationState = JSON.parse(
                    contractSpecificationState,
                );
            } catch {
                // Handle error
            }

            // Simulate processing contractSpecificationState
            return contractSpecificationState;
        };

        // Placeholder for getContractProviderState function
        const getContractProviderState = (contractProviderState: any) => {
            try {
                contractProviderState = JSON.parse(contractProviderState);
            } catch {
                // Handle error
            }

            // Simulate processing contractProviderState
            return contractProviderState;
        };

        try {
            const data = await request.body;
            const supplyReports = JSON.parse(data.supplyReport || '[]');
            const dataSupply = JSON.parse(data.supply || '{}');
            const domain = JSON.parse(data.domain || '{}');
            const document = JSON.parse(data.document || '{}');
            const bxCompanyItems = JSON.parse(data.bxCompanyItems || '{}');
            const bxrq = JSON.parse(data.bxrq || '{}');
            const dataBxDealItems = JSON.parse(data.bxDealItems || '[]');
            const dealId = JSON.parse(data.dealId || 'null');
            const eventRpaID = parseInt(data.rpa_id, 10) || null;
            const companyId = JSON.parse(data.companyId || 'null');
            const dataContract = JSON.parse(data.contract || '{}');
            const dataContractType = dataContract.contract?.title;
            const dataContractCoefficient = dataContract.contract?.coefficient;

            if (!dataContractType) {
                console.error('data_contractType == None');
            }

            const bxContacts = JSON.parse(data.bxContacts || '[]');
            const contacts = bxContacts
                .map(contact => {
                    try {
                        return { ...contact.contact };
                    } catch (e) {
                        console.error(`Error contact: ${contact}`);
                        return null;
                    }
                })
                .filter(contact => contact !== null);

            const dataComplects = JSON.parse(data.complect || '[]');
            const complect = dataComplects
                .map(complect => {
                    try {
                        return { ...complect };
                    } catch (e) {
                        console.error(e);
                        return null;
                    }
                })
                .filter(complect => complect !== null);

            const dataRows = JSON.parse(data.rows || '[]');
            const rows = dataRows.map(row => ({ ...row }));

            const contractType = JSON.parse(data.contractType || 'null');
            const contractSpecificationState = getContractSpecificationState(
                data.contractSpecificationState,
            );
            const contractProviderState = getContractProviderState(
                data.contractProviderState,
            );

            const dataTotals = JSON.parse(data.total || '[]');
            const total = dataTotals.map(total => ({ ...total }));

            const dataRegions = JSON.parse(data.regions || '{}');
            const regions = { ...dataRegions };

            if (!supplyReports.length) {
                throw new HttpException(
                    'supplyReports not found',
                    HttpStatus.BAD_REQUEST,
                );
            }
            if (!domain) {
                throw new HttpException(
                    'domain not found',
                    HttpStatus.BAD_REQUEST,
                );
            }

            const supply: any[] = [];

            dataBxDealItems.forEach(dealItem => {
                if (dealItem.current) {
                    if (['datetime', 'date'].includes(dealItem.field.type)) {
                        const dateFormat = '%Y-%m-%dT%H:%M:%S%z';
                        try {
                            const dateObj = new Date(dealItem.current);
                            dealItem.current = dateObj
                                .toISOString()
                                .split('T')[0];
                        } catch {
                            // Handle date parsing error
                        }
                    }
                    supply.push({
                        bitrixd: dealItem.field.bitrixId,
                        type: dealItem.field.type,
                        name: dealItem.field.name,
                        value:
                            dealItem.field.type === 'enumeration'
                                ? {
                                      id: 'simulatedId',
                                      name: 'simulatedName',
                                      title: 'simulatedTitle',
                                      code: 'simulatedCode',
                                  }
                                : dealItem.current,
                        code: dealItem.field.code,
                        group: dealItem.field.parent_type,
                    });
                }
            });

            // Process op_companys
            const opCompanys: any[] = [];
            let opSourceClientName = '';
            Object.keys(bxCompanyItems).forEach(field => {
                try {
                    const opCompany = { ...bxCompanyItems[field] };
                    opCompanys.push(opCompany);
                    if (opCompany.bitrixId.includes('SOURCE_SELECT')) {
                        opSourceClientName = opCompany.current.name;
                    }
                } catch (e) {
                    console.error(`ERROR: bxCompanyItems\n\n${field}`);
                }
            });

            // Simulate external service interactions
            const portal = await this.getPortal(domain);
            const rpa = this.getRpaByCode(portal, 'supply');

            const bxCompany = this.getBxCompany(domain, portal.accessKey);
            const bxDeal = this.getBxDeal(domain, portal.accessKey);

            const company = await bxCompany.getCompanyByFieldValue(
                'ID',
                companyId,
            );
            const baseDeal = await bxDeal.getDeal(dealId);

            const updateFields: any[] = [];

            supply.forEach(su => {
                rpa.bitrixfields.forEach(pField => {
                    const xx = this.findNameFieldManager(pField.code);

                    if (xx) {
                        const names = this.getFieldNames();
                        if (!names) return;

                        try {
                            const manager = this.getManager(xx.value);
                            if (!manager.user_id) {
                                if (xx === 'MANAGER_OP') {
                                    manager.user_id =
                                        baseDeal.UF_CRM_MANAGER_OP;
                                } else if (xx === 'MANAGER_TMC') {
                                    manager.user_id =
                                        baseDeal.UF_CRM_MANAGER_TMC;
                                }
                            }
                            const newField = {
                                bitrixId: pField.bitrixId,
                                type: manager.field.type,
                                name: manager.field.title,
                                value: `${manager.user_id}`,
                                code: pField.code,
                                group: su.group,
                            };
                            updateFields.push(newField);
                        } catch {
                            console.error('Manager not found');
                        }
                    }

                    if (pField.code === su.code) {
                        su.bitrixId = pField.bitrixId;
                        if (pField.items.length > 0) {
                            pField.items.forEach(pItem => {
                                if (su.value && pItem.code === su.value.code) {
                                    su.value.id = pItem.bitrixId;
                                }
                            });
                        }
                        updateFields.push(su);
                    }
                });
            });

            // File operations
            let currentContract = null;
            let currentInvoice = null;

            for (const suField of supply) {
                if (
                    suField.code === 'current_contract' &&
                    suField.value?.downloadUrl
                ) {
                    currentContract = await this.downloadFile(
                        domain,
                        suField.value.downloadUrl,
                    );
                }
                if (
                    suField.code === 'current_invoice' &&
                    suField.value?.downloadUrl
                ) {
                    currentInvoice = await this.downloadFile(
                        domain,
                        suField.value.downloadUrl,
                    );
                }
            }

            if (!currentContract) {
                const fileCurrentContract = data.file_current_contract;
                if (fileCurrentContract) {
                    currentContract =
                        await this.processUploadedFile(fileCurrentContract);
                }
            }

            if (!currentInvoice) {
                const fileCurrentInvoice = data.file_current_invoice;
                if (fileCurrentInvoice) {
                    currentInvoice =
                        await this.processUploadedFile(fileCurrentInvoice);
                }
            }

            // Update timelines and complete remaining business logic
            const bxRpa = this.getBxRpa(portal.accessKey, domain);
            const bxFields = this.prepareBxFields(updateFields, rpa);

            rpa.title = company.TITLE;
            await this.setBxField('rpa_crm_base_deal', dealId);

            const contactIds = contacts.map(contact => contact.ID);
            await this.setBxField('rpa_crm_contacts', contactIds);

            const bxLead = this.getBxLead(domain, portal.accessKey);
            const leads = await bxLead.getLeadsByCompanyId(companyId);
            if (leads.length > 0) {
                const leadIds = leads.map(lead => lead.ID);
                await this.setBxField('rpa_supply_lids', leadIds);
            }

            await this.setBxField('rpa_crm_company', companyId);
            await this.setBxField('contract_type', dataContractType);

            const fieldInn = bxrq.fields.find(field => field.code === 'inn');
            await this.setBxField('company_rq_inn', fieldInn.value);

            let fieldAddress = '';
            for (const adrItems of bxrq.address.items) {
                if (adrItems.type_id === 1) {
                    for (const field of adrItems.fields) {
                        if (field.value) {
                            fieldAddress += fieldAddress
                                ? `, ${field.value}`
                                : field.value;
                        }
                    }
                }
            }

            if (!fieldAddress) {
                console.error('No address found in bxrq.address.current');
            } else {
                await this.setBxField('service_address', fieldAddress);
            }

            let email = '';
            for (const bxDealItem of dataBxDealItems) {
                if (bxDealItem.field.code === 'garant_client_email') {
                    email = bxDealItem.current;
                }
            }

            if (!email) {
                for (const item of contractSpecificationState.items) {
                    if (item.name.includes('Email для интернет')) {
                        email = item.value;
                    }
                }
            }

            await this.setBxField('service_email_complect', email);
            await this.setBxField(
                'manager_tmc',
                baseDeal.UF_CRM_LAST_PRES_PLAN_RESPONSIBLE,
            );

            let idRpa = eventRpaID && eventRpaID > 0 ? eventRpaID : null;

            if (idRpa) {
                await bxRpa.updateSupplyRpa(bxFields, rpa, idRpa);
                console.log(`UPDATE RPA: ${idRpa}`);
            } else {
                const result = await bxRpa.createSupplyRpa(bxFields, rpa);
                idRpa = result[0].result[0].item.id;
            }

            await bxDeal.addTimeline(
                `Заявка на поставку`,
                dealId,
                idRpa,
                domain,
                rpa.bitrixId,
            );

            // Continue with the rest of the logic...
        } catch {
            throw new HttpException('Error form data', HttpStatus.BAD_REQUEST);
        }

        return 0; // Placeholder return value
    }

    async initDeal(request: Request): Promise<any> {
        const body = await request.body;
        const data = this.parseDataRobot(body);
        const portal = await this.getPortal(data.auth.domain);

        if (data.document_id['0'] === 'rpa') {
            const ids = data.document_id['2'].split(':');
            data.document_id = { rpa_id: ids[1], type_id: ids[0] };
        }

        const bxDeal = this.getBxDeal(data.auth.domain, portal.accessKey);
        const bxRpa = this.getBxRpa(data.auth.domain, portal.accessKey);

        const rpa = await bxRpa.getRpa(
            data.document_id.type_id,
            data.document_id.rpa_id,
        );
        const pRpaSupple = this.getRpaByCode(portal, 'supply');

        const dealFields = this.collectDealFields(pRpaSupple, rpa);
        const initDealFields = this.transformRpaFieldsToDealFields(
            portal,
            dealFields,
        );

        const dealCategoryId = this.getDealCategoryByCode(
            portal,
            'service_base',
        );
        const rpaCrmBaseDeal = initDealFields[`UF_CRM_RPA_CRM_BASE_DEAL`];

        const fieldFile = await this.prepareFieldFile(rpa);
        const baseDealFieldsValue =
            await bxDeal.getDealFieldsValue(rpaCrmBaseDeal);

        Object.assign(initDealFields, {
            COMPANY_ID: rpa.RPA_CRM_COMPANY,
            CONTACT_IDS: rpa.RPA_CRM_CONTACTS,
            UF_CRM_RPA_ARM_COMPLECT_ID: rpa.RPA_ARM_COMPLECT_ID,
            UF_CRM_RPA_ARM_CLIENT_ID: rpa.RPA_ARM_CLIENT_ID,
            ASSIGNED_BY_ID: rpa.MANAGER_OS,
            UF_CRM_MANAGER_EDU: rpa.MANAGER_EDU,
            ...baseDealFieldsValue,
        });

        const stageCode = this.calculateStageCode(rpa.CONTRACT_END);
        initDealFields['UF_CRM_CURRENT_CONTRACT'] = '';
        initDealFields['UF_CRM_CURRENT_INVOICE'] = '';
        initDealFields['UF_CRM_CURRENT_SUPPLY'] = '';

        const deal = await bxDeal.initNewElement(
            initDealFields,
            dealCategoryId.bitrixId,
            stageCode,
        );
        const dealId = deal.result[0];

        await bxDeal.updateDeal(dealId, initDealFields);
        await bxDeal.updateDeal(dealId, fieldFile);

        this.copyProductRowsFromBaseDeal(rpa.RPA_CRM_BASE_DEAL, bxDeal, dealId);
        this.updateCompanyAndContacts(portal, rpa, data.auth.domain);

        await this.addTimelineToDealAndRpa(
            bxDeal,
            bxRpa,
            data,
            dealId,
            pRpaSupple,
        );
        await this.initOrkTasks(portal, data.auth.domain, rpa, dealId);

        await this.notifyDealCreation(dealId, data.auth.domain);

        return portal;
    }

    private async updateFileRpa(
        document: string,
        idRpa: number,
        bxRpa: any,
        rpa: any,
        currentContract: any,
        currentInvoice: any,
    ): Promise<void> {
        const decodedUrl = decodeURIComponent(document);
        const fileName = decodedUrl.split('/').pop();
        const response = await axios.get(document);
        const dataJson = response.data;

        const bxFields = {
            [`UF_RPA_${rpa.bitrixId}_CURRENT_SUPPLY`]: {
                n0: dataJson.filename,
                n1: dataJson.file_base64,
            },
        };

        if (currentContract) {
            bxFields[`UF_RPA_${rpa.bitrixId}_CURRENT_CONTRACT`] = {
                n0: currentContract.filename,
                n1: currentContract.file_base64,
            };
        }

        if (currentInvoice) {
            bxFields[`UF_RPA_${rpa.bitrixId}_CURRENT_INVOICE`] = {
                n0: currentInvoice.filename,
                n1: currentInvoice.file_base64,
            };
        }

        await bxRpa.updateSupplyRpa(bxFields, rpa, idRpa);
    }

    // Placeholder methods for external service interactions
    private async getPortal(domain: string): Promise<any> {
        // Simulate fetching portal
        return { accessKey: 'simulatedAccessKey' };
    }

    private getRpaByCode(portal: any, code: string): any {
        // Simulate fetching RPA by code
        return { bitrixfields: [] };
    }

    private getBxCompany(domain: string, accessKey: string): any {
        // Simulate BxCompany service
        return {
            getCompanyByFieldValue: async (field: string, value: any) => ({}),
        };
    }

    private getBxDeal(domain: string, accessKey: string): any {
        // Simulate BxDeal service
        return {
            getDeal: async (dealId: any) => ({
                UF_CRM_MANAGER_OP: null,
                UF_CRM_MANAGER_TMC: null,
            }),
            addTimeline: async (
                title: string,
                dealId: any,
                idRpa: number,
                domain: string,
                bitrixId: string,
            ) => {},
        };
    }

    private findNameFieldManager(code: string): any {
        // Simulate finding name field manager
        return null;
    }

    private getFieldNames(): string[] {
        // Simulate getting field names
        return [];
    }

    private getManager(value: string): any {
        // Simulate getting manager
        return { user_id: null, field: { type: '', title: '' } };
    }

    private async downloadFile(
        domain: string,
        downloadUrl: string,
    ): Promise<any> {
        try {
            const url = `https://${domain}${downloadUrl}`;
            const response = await axios.post(
                url,
                {},
                { responseType: 'arraybuffer' },
            );
            const contentDisposition = response.headers['content-disposition'];
            let filename = 'downloaded_file';

            if (contentDisposition) {
                const filenameMatch =
                    contentDisposition.match(/filename="(.+?)"/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            const filePath = path.join(__dirname, filename);
            fs.writeFileSync(filePath, response.data);

            const fileContent = fs.readFileSync(filePath);
            const fileBase64 = Buffer.from(fileContent).toString('base64');

            return { filename, fileBase64 };
        } catch (error) {
            console.error('Error downloading file:', error);
            return null;
        }
    }

    private async processUploadedFile(file: any): Promise<any> {
        try {
            const fileContent = await file.buffer();
            const fileBase64 = Buffer.from(fileContent).toString('base64');
            return { filename: file.originalname, fileBase64 };
        } catch (error) {
            console.error('Error processing uploaded file:', error);
            return null;
        }
    }

    // Placeholder methods for additional operations
    private getBxRpa(accessKey: string, domain: string): any {
        // Simulate BxRpa service
        return {
            updateSupplyRpa: async (bxFields: any, rpa: any, id: number) => {},
            createSupplyRpa: async (bxFields: any, rpa: any) => [
                { result: [{ item: { id: 1 } }] },
            ],
        };
    }

    private prepareBxFields(updateFields: any[], rpa: any): any {
        // Simulate preparing bxFields
        return {};
    }

    private async setBxField(fieldCode: string, value: any): Promise<void> {
        // Simulate setting bxField
        console.log(`Set field ${fieldCode} with value ${value}`);
    }

    private getBxLead(domain: string, accessKey: string): any {
        // Simulate BxLead service
        return {
            getLeadsByCompanyId: async (companyId: any) => [],
        };
    }

    private parseDataRobot(body: any): any {
        // Simulate parsing data robot
        return {};
    }

    private collectDealFields(pRpaSupple: any, rpa: any): any {
        // Simulate collecting deal fields
        return {};
    }

    private transformRpaFieldsToDealFields(portal: any, dealFields: any): any {
        // Simulate transforming RPA fields to deal fields
        return {};
    }

    private getDealCategoryByCode(portal: any, code: string): any {
        // Simulate getting deal category by code
        return { bitrixId: 1 };
    }

    private calculateStageCode(contractEnd: string): string {
        // Simulate calculating stage code
        return 'stage_code';
    }

    private async prepareFieldFile(rpa: any): Promise<any> {
        // Simulate preparing field file
        return {};
    }

    private async copyProductRowsFromBaseDeal(
        baseDealId: number,
        bxDeal: any,
        dealServiceId: number,
    ): Promise<void> {
        const productRows = await bxDeal.getProductRows(baseDealId);
        productRows.forEach(row => {
            row.OWNER_ID = dealServiceId;
        });
        await bxDeal.setProductRows(dealServiceId, productRows);
    }

    private async updateCompanyAndContacts(
        portal: any,
        rpa: any,
        domain: string,
    ): Promise<void> {
        // Simulate updating company and contacts
    }

    private async addTimelineToDealAndRpa(
        bxDeal: any,
        bxRpa: any,
        data: any,
        dealId: number,
        pRpaSupple: any,
    ): Promise<void> {
        // Simulate adding timeline to deal and RPA
    }

    private async initOrkTasks(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<void> {
        // Simulate initializing ORK tasks
    }

    private async notifyDealCreation(
        dealId: number,
        domain: string,
    ): Promise<void> {
        // Simulate notifying deal creation
        console.log(`Created Deal: ${dealId}`);
    }

    async initTaskAccountant(request: Request): Promise<number> {
        const body = await request.body;
        const data = this.parseDataRobot(body);
        const portal = await this.getPortal(data.auth.domain);
        const bxRpa = this.getBxRpa(data.auth.domain, portal.accessKey);

        const rpa = await bxRpa.getRpa(
            data.document_id.type_id,
            data.document_id.rpa_id,
        );
        const bxTask = this.getBxTask(data.auth.domain, portal.accessKey);

        const dateFormat = '%Y-%m-%dT%H:%M:%S%z';

        rpa.CONTRACT_START = this.formatDate(rpa.CONTRACT_START, dateFormat);
        const firstPayDay = this.formatDate(rpa.FIRST_PAY_DATE, dateFormat);
        rpa.CONTRACT_END = this.formatDate(rpa.CONTRACT_END, dateFormat);

        const supplyDate = this.formatDate(rpa.SUPPLY_DATE, dateFormat, true);

        const field = {
            TITLE: rpa.NAME,
            DESCRIPTION: `Действие договора с ${rpa.CONTRACT_START} до ${rpa.CONTRACT_END}\nДата поставки: ${supplyDate}\nДата первой оплаты: ${firstPayDay}\n\nссылка на RPA: <a href="https://${data.auth.domain}/rpa/item/${data.document_id.type_id}/${data.document_id.rpa_id}/">Заявка на поставку</a>`,
            DEADLINE: rpa.SUPPLY_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`],
            RESPONSIBLE_ID: this.findResponsibleId(rpa),
        };

        const task = await bxTask.create(field);
        const textTimelineRpa = `<a href='https://${data.auth.domain}/company/personal/user/${task.responsibleId}/tasks/task/view/${task.id}/'>Задача для бухгалтера</a>`;
        await bxRpa.addTimeline(
            textTimelineRpa,
            data.document_id.type_id,
            data.document_id.rpa_id,
        );

        return task.id;
    }

    async initTaskManagerOrkFirstEducation(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<number> {
        const bxTask = this.getBxTask(domain, portal.accessKey);

        rpa.SUPPLY_DATE = this.adjustSupplyDate(rpa.SUPPLY_DATE);

        const field = {
            TITLE: `Первичное обучение: ${rpa.name}`,
            DESCRIPTION: `Описание ситуации: ${rpa.SITUATION_COMMENTS}\n\nКомментарий к заявке Руководитель: \n${rpa.RPA_OWNER_COMMENT.join('\n')}\n\nКомментарий к заявке РОП: \n${rpa.RPA_TMC_COMMENT.join('\n')}\n\n`,
            DEADLINE: rpa.CLIENT_CALL_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`, `D_${dealServiceId}`],
            RESPONSIBLE_ID: rpa.MANAGER_OS,
        };

        const task = await bxTask.create(field);
        return task.id;
    }

    async initTaskManagerOrkSupply(
        portal: any,
        domain: string,
        rpa: any,
        dealServiceId: number,
    ): Promise<number> {
        const bxTask = this.getBxTask(domain, portal.accessKey);

        rpa.SUPPLY_DATE = this.adjustSupplyDate(rpa.SUPPLY_DATE);

        const field = {
            TITLE: rpa.name,
            DESCRIPTION: `Описание ситуации: ${rpa.SITUATION_COMMENTS}\n\nКомментарий к заявке Руководитель: \n${rpa.RPA_OWNER_COMMENT.join('\n')}\n\nКомментарий к заявке РОП: \n${rpa.RPA_TMC_COMMENT.join('\n')}\n\n`,
            DEADLINE: rpa.SUPPLY_DATE,
            UF_CRM_TASK: [`CO_${rpa.RPA_CRM_COMPANY}`, `D_${dealServiceId}`],
            RESPONSIBLE_ID: rpa.MANAGER_OS,
        };

        const task = await bxTask.create(field);
        return task.id;
    }

    // Helper methods
    private formatDate(
        dateStr: string,
        format: string,
        adjustTime: boolean = false,
    ): string {
        const dateObj = new Date(dateStr);
        if (adjustTime) {
            dateObj.setHours(8, 0, 0, 0);
        }
        return dateObj.toISOString().split('T')[0];
    }

    private adjustSupplyDate(supplyDate: string): string {
        const dateObj = new Date(supplyDate);
        if (dateObj.getHours() === 0) {
            dateObj.setHours(11);
        }
        return dateObj.toISOString().split('T')[0];
    }

    private findResponsibleId(rpa: any): number {
        for (const user of rpa.users) {
            if (
                user.workPosition &&
                user.workPosition.toLowerCase().includes('бухгалтер')
            ) {
                return user.id;
            }
        }
        return rpa.updatedBy;
    }

    private getBxTask(domain: string, accessKey: string): any {
        // Simulate BxTask service
        return {
            create: async (field: any) => ({
                id: 1,
                responsibleId: field.RESPONSIBLE_ID,
            }),
        };
    }

    async getFileInField(url: string): Promise<[string, string]> {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const contentDisposition = response.headers['content-disposition'];
        let filename = 'downloaded_file';

        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(
                /filename\*=(.+?)(;|$)/,
            );
            if (filenameMatch) {
                const encodedString = filenameMatch[1].split("''")[1];
                filename = decodeURIComponent(encodedString);
            }
        }

        const fileBase64 = Buffer.from(response.data).toString('base64');
        return [filename, fileBase64];
    }
}
