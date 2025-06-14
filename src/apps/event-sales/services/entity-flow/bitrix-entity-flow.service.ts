import { Injectable, Logger } from '@nestjs/common';

// TODO: Create proper BitrixGeneralService implementation
class BitrixGeneralService {
    static async updateEntity(hook: any, entityType: string, entityId: number, fields: any): Promise<void> {
        // Implementation will be added later
    }

    static async updateCompany(hook: any, companyId: number, fields: any): Promise<any> {
        // Implementation will be added later
    }

    static async updateLead(hook: any, leadId: number, fields: any): Promise<any> {
        // Implementation will be added later
    }
}

type FailTypeCode =
    | 'op_prospects_good'
    | 'garant'
    | 'go'
    | 'territory'
    | 'accountant'
    | 'autsorc'
    | 'depend'
    | 'op_prospects_nophone'
    | 'op_prospects_company'
    | 'failure';

type ResultCode =
    | 'op_prospects_good'
    | 'op_prospects_garant'
    | 'op_prospects_go'
    | 'op_prospects_territory'
    | 'op_prospects_acountant'
    | 'op_prospects_autsorc'
    | 'op_prospects_depend'
    | 'op_prospects_nophone'
    | 'op_prospects_company'
    | 'op_prospects_fail'
    | 'op_prospects_nopersp';

interface FailType {
    code: FailTypeCode;
}

const failtypeItems: Array<{
    id: number;
    code: FailTypeCode;
    name: string;
    isActive: boolean;
}> = [
        { id: 0, code: "op_prospects_good", name: "Перспективная", isActive: false },
        { id: 1, code: "op_prospects_good", name: "Нет перспектив", isActive: false },
        { id: 2, code: "garant", name: "Гарант/Запрет", isActive: true },
        { id: 3, code: "go", name: "Покупает ГО", isActive: true },
        { id: 4, code: "territory", name: "Чужая территория", isActive: true },
        { id: 5, code: "accountant", name: "Бухприх", isActive: true },
        { id: 6, code: "autsorc", name: "Аутсорсинг", isActive: true },
        { id: 7, code: "depend", name: "Несамостоятельная организация", isActive: true },
        { id: 8, code: "op_prospects_nophone", name: "Недозвон", isActive: true },
        { id: 9, code: "op_prospects_company", name: "Компания не существует", isActive: true },
        { id: 10, code: "failure", name: "Отказ", isActive: true }
    ];

interface PortalFieldItem {
    id: number;
    code: string;
    name: string;
    isActive: boolean;
    bitrixId: number | null;
}

interface PortalField {
    code: string;
    bitrixId: number | null;
    items?: PortalFieldItem[];
}

interface NoresultReason {
    code: string;
}

interface FailReason {
    code: string;
}

interface EntityFieldsUpdatingContent {
    [key: string]: any;
}

interface ErrorResponse {
    message: string;
    file: string;
    line: number;
    trace: string;
}

interface SuccessResponse {
    result: string;
}

interface PortalCompanyData {
    bitrixfields?: PortalField[];
}

interface CurrentBtxEntity {
    [key: string]: any;
}

interface UpdatedFields {
    [key: string]: any;
}

@Injectable()
export class BitrixEntityFlowService {
    private static readonly logger = new Logger(BitrixEntityFlowService.name);

    constructor() { }

    getWorkstatusFieldItemValue(
        portalField: PortalField,
        workStatus: string,
        planEventType: string,
    ): number | null {
        let resultItemBtxId: number | null = null;
        let resultCode = 'work';

        switch (workStatus) {
            case 'inJob':
                resultCode = 'work';
                if (planEventType === 'hot') {
                    resultCode = 'in_progress';
                } else if (planEventType === 'moneyAwait') {
                    resultCode = 'money_await';
                }
                break;
            case 'setAside':
                resultCode = 'long';
                break;
            case 'fail':
                resultCode = 'op_status_fail';
                break;
            case 'success':
                resultCode = 'op_status_success';
                break;
        }

        if (portalField?.items) {
            const item = portalField.items.find(
                (pitem) => pitem.code === resultCode,
            );
            if (item) {
                resultItemBtxId = item.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getProspectsFieldItemValue(
        portalField: PortalField,
        workStatus: string,
        failType: FailType | null
    ): number | null {
        let resultItemBtxId: number | null = null;
        let resultCode: ResultCode = 'op_prospects_good';

        if (workStatus !== 'inJob' && workStatus !== 'success' && workStatus !== 'setAside') {
            if (failType?.code) {
                const failCode = failType.code;
                switch (failCode) {
                    case 'garant':
                        resultCode = 'op_prospects_garant';
                        break;
                    case 'go':
                        resultCode = 'op_prospects_go';
                        break;
                    case 'territory':
                        resultCode = 'op_prospects_territory';
                        break;
                    case 'accountant':
                        resultCode = 'op_prospects_acountant';
                        break;
                    case 'autsorc':
                        resultCode = 'op_prospects_autsorc';
                        break;
                    case 'depend':
                        resultCode = 'op_prospects_depend';
                        break;
                    case 'op_prospects_nophone':
                        resultCode = 'op_prospects_nophone';
                        break;
                    case 'op_prospects_company':
                        resultCode = 'op_prospects_company';
                        break;
                    case 'failure':
                        resultCode = 'op_prospects_fail';
                        break;
                    default:
                        resultCode = 'op_prospects_nopersp';
                        break;
                }
            } else {
                resultCode = 'op_prospects_nopersp';
            }
        }

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === resultCode
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    public getNoresultReson(
        portalField: PortalField,
        noresultReason: NoresultReason,
        isResult: boolean
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (isResult) {
            return 0;
        }

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === noresultReason.code
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    public getFailReason(
        portalField: PortalField,
        failReason: FailReason,
        failType: FailType
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === failReason.code
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    public static async coldflow(
        portal: any,
        hook: any,
        entityType: string,
        entityId: number,
        eventType: string,
        eventAction: string,
        entityFieldsUpdatingContent: EntityFieldsUpdatingContent
    ): Promise<SuccessResponse | ErrorResponse> {
        const randomNumber = Math.floor(Math.random() * 3) + 1;

        // Simulate sleep
        await new Promise(resolve => setTimeout(resolve, randomNumber * 1000));

        try {
            if (entityType === 'company') {
                await BitrixEntityFlowService.updateCompanyCold(hook, entityId, entityFieldsUpdatingContent);
            } else if (entityType === 'lead') {
                await BitrixEntityFlowService.updateLeadCold(hook, entityId, entityFieldsUpdatingContent);
            } else { // deal
                await BitrixGeneralService.updateEntity(
                    hook,
                    entityType,
                    entityId,
                    entityFieldsUpdatingContent
                );
            }

            return { result: 'success' };
        } catch (error) {
            const errorMessages: ErrorResponse = {
                message: error.message,
                file: error.file,
                line: error.line,
                trace: error.stack
            };

            BitrixEntityFlowService.logger.error('ERROR COLD: Exception caught', errorMessages);
            BitrixEntityFlowService.logger.log('error COLD', { error: error.message });

            return errorMessages;
        }
    }

    public async flow(
        portal: any,
        currentBtxEntity: CurrentBtxEntity,
        portalCompanyData: PortalCompanyData,
        hook: any,
        entityType: string,
        entityId: number,
        planEventType: string,
        eventAction: string,
        createdId: number,
        responsibleId: number,
        deadline: string,
        nowdate: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean,
        workStatus: string,
        resultStatus: string,
        failType: FailType,
        failReason: FailReason,
        noResultReason: NoresultReason,
        currentReportEventType: string,
        currentReportEventName: string,
        currentPlanEventName: string,
        comment: string,
        currentFieldsForUpdate: EntityFieldsUpdatingContent
    ): Promise<SuccessResponse | ErrorResponse> {
        // Random delay between 0.1 and 0.5 seconds
        const randomDelay = Math.floor(Math.random() * 400000) + 100000;
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        try {
            if (portalCompanyData?.bitrixfields) {
                const fields = portalCompanyData.bitrixfields;

                const updatedFields = await this.getReportFields(
                    [],
                    currentBtxEntity,
                    currentFieldsForUpdate,
                    fields,
                    planEventType,
                    createdId,
                    responsibleId,
                    deadline,
                    nowdate,
                    isPresentationDone,
                    isUnplannedPresentation,
                    workStatus,
                    resultStatus,
                    failType,
                    failReason,
                    noResultReason,
                    currentReportEventType,
                    currentReportEventName,
                    currentPlanEventName,
                    comment,
                    entityType
                );

                await BitrixGeneralService.updateEntity(
                    hook,
                    entityType,
                    entityId,
                    updatedFields
                );
            }

            return { result: 'success' };
        } catch (error) {
            const errorMessages: ErrorResponse = {
                message: error.message,
                file: error.file,
                line: error.line,
                trace: error.stack
            };

            BitrixEntityFlowService.logger.error('ERROR FLOW: Exception caught', errorMessages);
            BitrixEntityFlowService.logger.log('error FLOW', { error: error.message });

            return errorMessages;
        }
    }

    public async documentFlowflow(
        currentBtxEntity: CurrentBtxEntity,
        portalData: PortalCompanyData,
        hook: any,
        entityType: string,
        entityId: number,
        responsibleId: number,
        workStatus: string,
        resultStatus: string,
        currentFieldsForUpdate: EntityFieldsUpdatingContent
    ): Promise<SuccessResponse | ErrorResponse> {
        try {
            const userId = `user_${responsibleId}`;
            const updatedFields: UpdatedFields = {};

            if (portalData?.bitrixfields) {
                const portalFields = portalData.bitrixfields;

                for (const pField of portalFields) {
                    if (pField?.code) {
                        const pFieldCode = pField.code;

                        for (const [targetFieldCode, value] of Object.entries(currentFieldsForUpdate)) {
                            if (pFieldCode === targetFieldCode) {
                                switch (pFieldCode) {
                                    case 'manager_op':
                                    case 'op_offer_q':
                                    case 'op_offer_pres_q':
                                    case 'op_offer_date':
                                    case 'op_current_status':
                                    case 'op_invoice_q':
                                    case 'op_invoice_pres_q':
                                    case 'op_invoice_date':
                                    case 'pres_comments':
                                    case 'op_history':
                                    case 'op_mhistory':
                                        updatedFields[`UF_CRM_${pField.bitrixId}`] = value;
                                        break;

                                    case 'op_work_status':
                                        updatedFields[`UF_CRM_${pField.bitrixId}`] = this.getWorkstatusFieldItemValue(
                                            pField,
                                            workStatus,
                                            'document'
                                        );
                                        break;

                                    case 'op_prospects_type':
                                        updatedFields[`UF_CRM_${pField.bitrixId}`] = this.getProspectsFieldItemValue(
                                            pField,
                                            workStatus,
                                            null
                                        );
                                        break;
                                }
                            }
                        }
                    }
                }
            }

            await BitrixGeneralService.updateEntity(
                hook,
                entityType,
                entityId,
                updatedFields
            );

            return { result: 'success' };
        } catch (error) {
            const errorMessages: ErrorResponse = {
                message: error.message,
                file: error.file,
                line: error.line,
                trace: error.stack
            };

            BitrixEntityFlowService.logger.error('ERROR DOCUMENT FLOW: Exception caught', errorMessages);
            BitrixEntityFlowService.logger.log('error DOCUMENT FLOW', { error: error.message });

            return errorMessages;
        }
    }

    private static async updateCompanyCold(hook: any, companyId: number, fields: EntityFieldsUpdatingContent): Promise<any> {
        // UF_CRM_10_1709907744 - дата следующего звонка
        try {
            const result = await BitrixGeneralService.updateCompany(hook, companyId, fields);
            return result;
        } catch (error) {
            BitrixEntityFlowService.logger.error('ERROR updateCompanyCold: Exception caught', {
                error: error.message,
                companyId,
                fields
            });
            throw error;
        }
    }

    private static async updateLeadCold(hook: any, leadId: number, fields: EntityFieldsUpdatingContent): Promise<any> {
        try {
            const result = await BitrixGeneralService.updateLead(hook, leadId, fields);
            return result;
        } catch (error) {
            BitrixEntityFlowService.logger.error('ERROR updateLeadCold: Exception caught', {
                error: error.message,
                leadId,
                fields
            });
            throw error;
        }
    }

    private async getReportFields(
        updatedFields: any[],
        currentBtxEntity: CurrentBtxEntity,
        currentFieldsForUpdate: EntityFieldsUpdatingContent,
        portalFields: PortalField[],
        planEventType: string,
        createdId: number,
        responsibleId: number,
        deadline: string,
        nowdate: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean,
        workStatus: string,
        resultStatus: string,
        failType: FailType,
        failReason: FailReason,
        noResultReason: NoresultReason,
        reportEventType: string,
        currentReportEventName: string,
        currentPlanEventName: string,
        comment: string,
        entityType: string
    ): Promise<any> {
        const userId = `user_${responsibleId}`;
        const isResult = resultStatus === 'result' || resultStatus === 'new';
        const result: { [key: string]: any } = {};

        for (const pField of portalFields) {
            if (!pField?.code) continue;

            const portalFieldCode = pField.code;

            for (const [targetFieldCode, value] of Object.entries(currentFieldsForUpdate)) {
                if (portalFieldCode === targetFieldCode) {
                    switch (portalFieldCode) {
                        case 'manager_op':
                        case 'call_next_date':
                        case 'call_next_name':
                        case 'call_last_date':
                        case 'next_pres_plan_date':
                        case 'last_pres_plan_date':
                        case 'last_pres_done_date':
                        case 'last_pres_plan_responsible':
                        case 'last_pres_done_responsible':
                        case 'pres_count':
                        case 'to_base_sales':
                        case 'op_current_status':
                            result[`UF_CRM_${pField.bitrixId}`] = value;
                            break;

                        case 'pres_comments':
                        case 'op_fail_comments':
                        case 'op_mhistory':
                            result[`UF_CRM_${pField.bitrixId}`] = value;
                            break;

                        case 'op_work_status':
                            result[`UF_CRM_${pField.bitrixId}`] = this.getWorkstatusFieldItemValue(
                                pField,
                                workStatus,
                                planEventType
                            );
                            break;

                        case 'op_prospects_type':
                            result[`UF_CRM_${pField.bitrixId}`] = this.getProspectsFieldItemValue(
                                pField,
                                workStatus,
                                failType
                            );
                            break;

                        case 'op_noresult_reason':
                            result[`UF_CRM_${pField.bitrixId}`] = this.getNoresultReson(
                                pField,
                                { code: noResultReason.code },
                                isResult
                            );
                            break;

                        case 'op_fail_reason':
                            result[`UF_CRM_${pField.bitrixId}`] = this.getFailReason(
                                pField,
                                failReason,
                                failType
                            );
                            break;

                        default:
                            break;
                    }
                }
            }
        }

        if (entityType === 'company') {
            result['ASSIGNED_BY_ID'] = responsibleId;
        }

        return result;
    }

    private getResultstatusFieldItemValue(
        portalField: PortalField,
        resultStatus: string,
        failType: string,
        failReason: FailReason,
        noResultReason: NoresultReason,
        reportEventType: string
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === resultStatus
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getPlanEventTypeFieldItemValue(
        portalField: PortalField,
        planEventType: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === planEventType
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getReportEventTypeFieldItemValue(
        portalField: PortalField,
        reportEventType: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === reportEventType
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getReportEventNameFieldItemValue(
        portalField: PortalField,
        currentReportEventName: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === currentReportEventName
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getPlanEventNameFieldItemValue(
        portalField: PortalField,
        currentPlanEventName: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number | null {
        let resultItemBtxId: number | null = null;

        if (portalField?.items) {
            const matchingItem = portalField.items.find(
                (item) => item.code === currentPlanEventName
            );
            if (matchingItem?.bitrixId) {
                resultItemBtxId = matchingItem.bitrixId;
            }
        }

        return resultItemBtxId;
    }

    private getCommentFieldItemValue(
        portalField: PortalField,
        comment: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): string {
        return comment;
    }

    private getDeadlineFieldItemValue(
        portalField: PortalField,
        deadline: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): string {
        return deadline;
    }

    private getCreatedByFieldItemValue(
        portalField: PortalField,
        createdId: number,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number {
        return createdId;
    }

    private getResponsibleFieldItemValue(
        portalField: PortalField,
        responsibleId: number,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): number {
        return responsibleId;
    }

    private getDateFieldItemValue(
        portalField: PortalField,
        nowdate: string,
        isPresentationDone: boolean,
        isUnplannedPresentation: boolean
    ): string {
        return nowdate;
    }
} 