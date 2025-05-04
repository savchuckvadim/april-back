import { Injectable, Logger } from '@nestjs/common';
import { IPortal, IPBXList, IField, IFieldItem, IRPA, ICategory, EDepartamentGroup, IPDepartment } from '../interfaces/portal.interface';
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

    getDepartamentIdByPortal(portal: IPortal, departament: EDepartamentGroup): IPDepartment | undefined {
        //@ts-ignore
        return portal.departament?.group === departament ? portal.departament : 0
    }

    getDepartamentIdByCode(departament: EDepartamentGroup): IPDepartment | undefined {

        return this.portal.departament?.group === departament ? this.portal.departament : undefined
    }


    getListByCode(code: string): IPBXList | undefined {
        let result = this.portal.lists?.find(list => list.type === code)
        if (!result) {
            result = this.portal.bitrixLists?.find(list => list.type === code)
        }
        return result;
    }

    getIdByCodeFieldList(list: IPBXList, code: string): IField | undefined {
        return list.bitrixfields?.find(field =>
            field.code.split(`${list.group}_${list.type}_`)[1] === code
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

    getDealCategoryByCode( code: string): ICategory | undefined {
        return this.portal.deal?.categories.find(category => category.code === code);
    }

    getDealFieldByCode( code: string): IField | undefined {
        return this.portal.deal?.bitrixfields.find(field => field.code === code);
    }

    getDealFieldItemByCode(code: string): IFieldItem | undefined {
        for (const field of this.portal.deal?.bitrixfields || []) {
            const item = field.items.find(item => item.code === code);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldItemByBitrixID(bitrixId: number): IFieldItem | undefined {
        for (const field of this.portal.deal?.bitrixfields || []) {
            const item = field.items.find(item => item.bitrixId === bitrixId);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldsSelectAll(): string[] {
        return this.portal.deal?.bitrixfields.map(field => field.bitrixId.toString()) || [];
    }

    getBitrixIdByIdFieldItemList(items: IFieldItem[], value: number): string | undefined {
        return items.find(item => item.bitrixId === value)?.code;
    }

    getRpaByCode( code: string): IRPA | undefined {
        return this.portal.rpas?.find(rpa => rpa.code === code);
    }

    getRpaById( id: number): IRPA | undefined {
        return this.portal.rpas?.find(rpa => rpa.bitrixId === id);
    }

    getRpaFieldByCode(rpa: IRPA, code: string): IField | undefined {
        return rpa.bitrixfields.find(field => field.code === code);
    }

    getHook(): string {

        return `${this.portal.domain}/hook?access_key=${this.portal.C_REST_CLIENT_SECRET}`;
    }

    getStageByCode(stageCode: string): string | undefined {
        for (const category of this.portal.deal?.categories || []) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getStageRpaByCode( rpaCode: string, stageCode: string): string | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        if (!rpa) return undefined;

        for (const category of rpa.categories) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getCompanyFieldByCode(code: string): IField | undefined {
        return this.portal.company?.bitrixfields.find(field => field.code === code);
    }

    getPresetForName(code: string) {
        return this.portal.bx_rq?.find(preset => preset.code === code);
    }

    getSmartByCode(code: string) {
        return this.portal.smarts?.find(smart => smart.name === code);
    }

    getSmartFieldByCode(smart: any, code: string): IField | undefined {
        const field = smart.fields.find((field: IField) => field.code === code);
        if (field?.bitrixId && field.bitrixId[0].toUpperCase() === field.bitrixId[0]) {
            field.bitrixId = field.bitrixId[0].toLowerCase() + field.bitrixId.slice(1);
        }
        return field;
    }

    getContactField( fieldCode: string): IField | undefined {
        return this.portal.contact?.bitrixfields.find(field => field.code === fieldCode);
    }

    getContactValueItem(value: number, fieldCode: string): string | undefined {
        const field = this.getContactField(fieldCode);
        if (!field) return undefined;

        return field.items.find(item => item.bitrixId === value)?.code;
    }
} 