import { Injectable, Logger } from '@nestjs/common';
import { IPortal, IPBXList, IField, IFieldItem, IRPA, ICategory, EDepartamentGroup, IPDepartment, IPPortalMeasure, PMeasureCode, IFieldCode, IDeal } from '../interfaces/portal.interface';
import { TelegramService } from '../../telegram/telegram.service';
import { waitForDebugger } from 'inspector';

// @Injectable()
export class PortalModel {
    private readonly logger = new Logger(PortalModel.name);

    constructor(
        private readonly portal: IPortal,
        private readonly telegramService: TelegramService

    ) { }

    getPortal(): IPortal {
        return this.portal;
    }
    getHook(): string {

        return `${this.portal.domain}/hook?access_key=${this.portal.C_REST_CLIENT_SECRET}`;
    }


    getDepartamentIdByPortal(portal: IPortal, departament: EDepartamentGroup): IPDepartment | undefined {
        //@ts-ignore
        return portal.departament?.group === departament ? portal.departament : 0
    }

    getDepartamentIdByCode(departament: EDepartamentGroup): IPDepartment | undefined {

        return this.portal.departament?.group === departament ? this.portal.departament : undefined
    }


    getListByCode(code: 'sales_kpi' | 'sales_history' | 'presentation' | 'ork_history'): IPBXList | undefined {
        let result = this.portal.lists?.find(list => `${list.group}_${list.type}` === code)
        if (!result) {
            result = this.portal.bitrixLists?.find(list => `${list.group}_${list.type}` === code)
        }
        return result;
    }

    getIdByCodeFieldList(list: IPBXList, code: string): IField | undefined {
        return list.bitrixfields?.find(field =>
            field.code === `${list.group}_${list.type}_${code}`
        );
    }

    getListFieldsSelectAll(list: IPBXList): string[] {
        return list.bitrixfields?.map(field => field.bitrixCamelId || '') || [];
    }

    async getIdByValueFieldItemList(items: IFieldItem[], code: string): Promise<IFieldItem | undefined> {
        const item = items.find(item => item.code === code);
        if (!item) {
            await this.telegramService.sendMessageAdminError(
                `get_id_by_value_field_item_list\n Поле: ${code} не найдено\nDomain: последний`
            );
        }
        return item;
    }
    getDeal(): IDeal {
        return this.portal.deals[0];
    }

    getDealCategories(): any {
        return this.portal.deals[0].categories;
    }
    getDealCategoryByCode(code: 'service_base' | 'tmc_base' | 'sales_base' | 'sales_presentation'): ICategory | undefined {
        return this.portal.deals[0].categories.find(category => category.code === code);
    }
    getDealFields(): IField[] {
        return this.portal.deals[0].bitrixfields || [];
    }
    getDealFieldByCode(code: IFieldCode): IField | undefined {
        return this.portal.deals[0].bitrixfields.find(field => field.code === code);
    }
    getDealFieldBitrixIdByCode(code: IFieldCode): string {
        const field = this.portal.deals[0].bitrixfields.find(field => field.code === code)
        return `UF_CRM_${field?.bitrixId}` || '';
    }
    getDealFieldItemByCode(code: string): IFieldItem | undefined {
        for (const field of this.portal.deals[0].bitrixfields || []) {
            const item = field.items.find(item => item.code === code);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldItemByBitrixID(bitrixId: number): IFieldItem | undefined {
        for (const field of this.portal.deals[0].bitrixfields || []) {
            const item = field.items.find(item => item.bitrixId === bitrixId);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldsSelectAll(): string[] {
        return this.portal.deals[0].bitrixfields.map(field => field.bitrixId.toString()) || [];
    }
    getCompanyFields(): IField[] {
        return this.portal.company?.bitrixfields || [];
    }

    getCompanyFieldByCode(code: string): IField | undefined {
        return this.portal.company?.bitrixfields.find(field => field.code === code);
    }

    getContactFields(): IField[] {
        return this.portal.contact?.bitrixfields || [];
    }
    getContactField(fieldCode: string): IField | undefined {
        return this.portal.contact?.bitrixfields.find(field => field.code === fieldCode);
    }
    getContactFieldBitrixId(fieldCode: string): string {
        const field = this.portal.contact?.bitrixfields.find(field => field.code === fieldCode)
        if (!field) return '';
        const result = this.getFieldBitrixId(field)
        return result;
    }

    getContactValueItem(value: number, fieldCode: string): string | undefined {
        const field = this.getContactField(fieldCode);
        if (!field) return undefined;

        return field.items.find(item => item.bitrixId === value)?.code;
    }

    getBitrixIdByIdFieldItemList(items: IFieldItem[], value: number): string | undefined {
        return items.find(item => item.bitrixId === value)?.code;
    }

    getRpaByCode(code: string): IRPA | undefined {
        return this.portal.rpas?.find(rpa => rpa.code === code);
    }

    getRpaById(id: number): IRPA | undefined {
        return this.portal.rpas?.find(rpa => rpa.bitrixId === id);
    }

    getRpaFieldByCode(rpaCode: string, code: string): IField | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        if (!rpa) return undefined;
        return rpa.bitrixfields.find(field => field.code === code);
    }

    getRpaFieldBitrixIdByCode(rpaCode: 'supply' | string, code: string): string | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        const field = this.getRpaFieldByCode(rpaCode, code);
        if (!field || !rpa) return undefined;

        return this.getRpaFieldBitrixId(rpa.bitrixId, field);
    }

    getRpaFieldBitrixId(rpaTypeId: number, field: IField | undefined): string {
        if (!field) {
            throw new Error('Field not found')
        }
        return `UF_RPA_${rpaTypeId}_${field.bitrixId}`
    }

 

    getStageByCode(stageCode: string): string | undefined {
        for (const category of this.portal.deals[0].categories || []) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getStageRpaByCode(rpaCode: string, stageCode: string): string | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        if (!rpa) return undefined;

        for (const category of rpa.categories) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }



    getPresetForName(code: string) {
        return this.portal.bx_rq?.find(preset => preset.code === code);
    }

    getSmartByType(type: 'service_offer' | 'service_month' | 'presentation') {
        return this.portal.smarts?.find(smart => smart.type === type);
    }

    getSmartFieldByCode(smart: any, code: string): IField | undefined {
        const field = smart.fields.find((field: IField) => field.code === code);
        if (field?.bitrixId && field.bitrixId[0].toUpperCase() === field.bitrixId[0]) {
            field.bitrixId = field.bitrixId[0].toLowerCase() + field.bitrixId.slice(1);
        }
        return field;
    }


    getMeasures(): IPPortalMeasure[] {
        return this.portal.measures;
    }
    getMeasureByCode(code: PMeasureCode): IPPortalMeasure {
        return this.portal.measures.find(measure => measure.measure.code === code) as IPPortalMeasure;
    }



    getFieldBitrixId(field: IField): string {
        return `UF_CRM_${field.bitrixId}`;
    }

    getFieldItemByCode(field: IField, itemCode: string): IFieldItem | undefined {


        return field.items.find(item => item.code === itemCode);
    }
} 