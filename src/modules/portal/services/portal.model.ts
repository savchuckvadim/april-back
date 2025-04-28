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
    getListByCode(code: string): IPBXList | undefined {
        let result = this.portal.lists?.find(list => list.type === code)
        if(!result) {
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

    getDealCategoryByCode(portal: IPortal, code: string): ICategory | undefined {
        return portal.deal?.categories.find(category => category.code === code);
    }

    getDealFieldByCode(portal: IPortal, code: string): IField | undefined {
        return portal.deal?.bitrixfields.find(field => field.code === code);
    }

    getDealFieldItemByCode(portal: IPortal, code: string): IFieldItem | undefined {
        for (const field of portal.deal?.bitrixfields || []) {
            const item = field.items.find(item => item.code === code);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldItemByBitrixID(portal: IPortal, bitrixId: number): IFieldItem | undefined {
        for (const field of portal.deal?.bitrixfields || []) {
            const item = field.items.find(item => item.bitrixId === bitrixId);
            if (item) return item;
        }
        return undefined;
    }

    getDealFieldsSelectAll(portal: IPortal): string[] {
        return portal.deal?.bitrixfields.map(field => field.bitrixId.toString()) || [];
    }

    getBitrixIdByIdFieldItemList(items: IFieldItem[], value: number): string | undefined {
        return items.find(item => item.bitrixId === value)?.code;
    }

    getRpaByCode(portal: IPortal, code: string): IRPA | undefined {
        return portal.rpas?.find(rpa => rpa.code === code);
    }

    getRpaById(portal: IPortal, id: number): IRPA | undefined {
        return portal.rpas?.find(rpa => rpa.bitrixId === id);
    }

    getRpaFieldByCode(rpa: IRPA, code: string): IField | undefined {
        return rpa.bitrixfields.find(field => field.code === code);
    }

    getHook(): string {

        return `${this.portal.domain}/hook?access_key=${this.portal.C_REST_CLIENT_SECRET }`;
    }

    getStageByCode(portal: IPortal, stageCode: string): string | undefined {
        for (const category of portal.deal?.categories || []) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getStageRpaByCode(portal: IPortal, rpaCode: string, stageCode: string): string | undefined {
        const rpa = this.getRpaByCode(portal, rpaCode);
        if (!rpa) return undefined;

        for (const category of rpa.categories) {
            const stage = category.stages.find(stage => stage.code === stageCode);
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getCompanyFieldByCode(portal: IPortal, code: string): IField | undefined {
        return portal.company?.bitrixfields.find(field => field.code === code);
    }

    getPresetForName(portal: IPortal, code: string) {
        return portal.bx_rq?.find(preset => preset.code === code);
    }

    getSmartByCode(portal: IPortal, code: string) {
        return portal.smarts?.find(smart => smart.name === code);
    }

    getSmartFieldByCode(smart: any, code: string): IField | undefined {
        const field = smart.fields.find((field: IField) => field.code === code);
        if (field?.bitrixId && field.bitrixId[0].toUpperCase() === field.bitrixId[0]) {
            field.bitrixId = field.bitrixId[0].toLowerCase() + field.bitrixId.slice(1);
        }
        return field;
    }

    getContactField(portal: IPortal, fieldCode: string): IField | undefined {
        return portal.contact?.bitrixfields.find(field => field.code === fieldCode);
    }

    getContactValueItem(portal: IPortal, value: number, fieldCode: string): string | undefined {
        const field = this.getContactField(portal, fieldCode);
        if (!field) return undefined;

        return field.items.find(item => item.bitrixId === value)?.code;
    }
} 