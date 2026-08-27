import { Logger } from '@nestjs/common';
import {
    IPortal,
    IPBXList,
    IField,
    IFieldItem,
    IRPA,
    IPCategory,
    EDepartamentGroup,
    IPDepartment,
    IPPortalMeasure,
    PMeasureCode,
    IFieldCode,
    IPDeal,
    IStage,
    IPSmart,
    IPCallingTasksGroup,
} from '../interfaces/portal.interface';
import { TelegramService } from '@lib/telegram/telegram.service';
import {
    CategoryToStageMap,
    PbxDealCategoryCodeEnum,
} from './types/deals/portal.deal.type';
import { SmartType } from './types/smart/smart.type';
import { ETimeZone, resolveTimezoneByDomain } from '@/shared/lib/date';

// @Injectable()
export type PbxEntityType = 'company' | 'lead' | 'deal' | 'contact';
export class PortalModel {
    private readonly logger = new Logger(PortalModel.name);

    constructor(
        private readonly portal: IPortal,
        private readonly telegramService: TelegramService,
    ) {}

    getPortal(): IPortal {
        return this.portal;
    }

    /**
     * Есть ли в слепке портала хоть одно UF-поле сущности.
     *
     * Нужен для детекта ПРОТУХШЕГО слепка: поля устанавливают на портал уже
     * после того, как слепок закэширован (TTL 10 ч), и до истечения TTL все
     * потребители считают их «неустановленными» — записи молча теряются.
     * Пустая секция при заведомо установленных полях = сигнал перечитать.
     */
    hasEntityFields(entityType: PbxEntityType): boolean {
        if (entityType === 'company') {
            return (this.portal.company?.bitrixfields?.length ?? 0) > 0;
        }
        if (entityType === 'lead') {
            return (this.portal.lead?.bitrixfields?.length ?? 0) > 0;
        }
        if (entityType === 'deal') {
            return (this.portal.deals?.[0]?.bitrixfields?.length ?? 0) > 0;
        }
        return (this.portal.contact?.bitrixfields?.length ?? 0) > 0;
    }
    getHook(): string {
        return `${this.portal.domain}/hook?access_key=${this.portal.C_REST_CLIENT_SECRET}`;
    }

    /**
     * IANA-таймзона клиентского портала. Определяется по domain
     * (см. resolveTimezoneByDomain). Дефолт — Europe/Moscow.
     *
     * Используется date-утилами из @/shared/lib/date для конвертации входных
     * дат hook/фронта в форматы полей Bitrix (task DEADLINE / CRM datetime / строки).
     */
    getTimezone(): ETimeZone {
        return resolveTimezoneByDomain(this.portal.domain);
    }

    getDepartamentIdByPortal(
        portal: IPortal,
        departament: EDepartamentGroup,
    ): IPDepartment | undefined {
        return portal.departament?.group === departament
            ? portal.departament
            : undefined;
    }

    getDepartamentIdByCode(
        departament: EDepartamentGroup,
    ): IPDepartment | undefined {
        return this.portal.departament?.group === departament
            ? this.portal.departament
            : undefined;
    }

    getListByCode(
        code:
            | 'sales_kpi'
            | 'sales_history'
            // Ключ строится как `${group}_${type}`: у списка презентаций это
            // 'sales_presentation'. Короткое 'presentation' в сигнатуре было
            // ловушкой — тип разрешал значение, которое НИКОГДА не находилось.
            | 'sales_presentation'
            | 'service_ork_history',
    ): IPBXList | undefined {
        let result = this.portal.lists?.find(
            list => `${list.group}_${list.type}` === code,
        );
        if (!result) {
            result = this.portal.bitrixLists?.find(
                list => `${list.group}_${list.type}` === code,
            );
        }
        return result;
    }

    getIdByCodeFieldList(list: IPBXList, code: string): IField | undefined {
        return list.bitrixfields?.find(
            field => field.code === `${list.group}_${list.type}_${code}`,
        );
    }

    getListFieldsSelectAll(list: IPBXList): string[] {
        return list.bitrixfields?.map(field => field.bitrixCamelId || '') || [];
    }

    async getIdByValueFieldItemList(
        items: IFieldItem[],
        code: string,
    ): Promise<IFieldItem | undefined> {
        const item = items.find(item => item.code === code);
        if (!item) {
            await this.telegramService.sendMessageAdminError(
                `get_id_by_value_field_item_list\n Поле: ${code} не найдено\nDomain: последний`,
            );
        }
        return item;
    }
    getEntityFieldByCode(
        entityType: PbxEntityType,
        code: string,
    ): IField | undefined {
        if (entityType === 'company') {
            return this.portal.company?.bitrixfields.find(
                field => field.code === code,
            );
        }
        if (entityType === 'lead') {
            return this.portal.lead?.bitrixfields.find(
                field => field.code === code,
            );
        }
        if (entityType === 'deal') {
            return this.portal.deals?.[0]?.bitrixfields.find(
                field => field.code === code,
            );
        }
        if (entityType === 'contact') {
            return this.portal.contact?.bitrixfields.find(
                field => field.code === code,
            );
        }
        return undefined;
    }

    getDeal(): IPDeal {
        return this.portal.deals[0];
    }

    // === Стадии лида ===
    //
    // ВАЖНО: STATUS_ID лида — ПЛОСКАЯ строка ('NEW', 'PBX_COMPANY_WORK'),
    // в отличие от сделок, где стадия собирается как `C{categoryId}:{stageId}`.
    // Код, скопированный из deal-резолверов, молча сломает лид.

    getLeadCategories(): IPCategory[] {
        return this.portal.lead?.categories ?? [];
    }

    getLeadCategoryByGroup(group: string): IPCategory | undefined {
        return this.getLeadCategories().find(
            category => category.group === group,
        );
    }

    /** Стадия лида по pbx-коду (например 'lead_company_work'). */
    getLeadStageByCode(code: string): IStage | undefined {
        for (const category of this.getLeadCategories()) {
            const stage = category.stages.find(st => st.code === code);
            if (stage) return stage;
        }
        return undefined;
    }

    /** STATUS_ID Битрикса по pbx-коду стадии лида (плоский, без C{n}:). */
    getLeadStatusIdByCode(code: string): string | undefined {
        return this.getLeadStageByCode(code)?.bitrixId || undefined;
    }

    /** Обратный резолв: pbx-код стадии лида по STATUS_ID Битрикса. */
    getLeadStageCodeByStatusId(statusId: string): string | undefined {
        if (!statusId) return undefined;
        for (const category of this.getLeadCategories()) {
            const stage = category.stages.find(st => st.bitrixId === statusId);
            if (stage) return stage.code;
        }
        return undefined;
    }

    getDealCategories(): IPCategory[] {
        return this.portal.deals[0].categories;
    }
    getDealCategoryByCode(
        code: PbxDealCategoryCodeEnum,
    ): IPCategory | undefined {
        return this.portal.deals[0].categories.find(
            category => category.code === (code as string),
        );
    }
    getDealStageByCode<
        C extends keyof CategoryToStageMap,
        S extends CategoryToStageMap[C],
    >(categoryCode: C, stageCode: S): IStage | undefined {
        const category = this.getDealCategoryByCode(categoryCode);
        return category?.stages.find(st => st.code === stageCode);
    }
    getDealFields(): IField[] {
        return this.portal.deals[0].bitrixfields || [];
    }
    getDealFieldByCode(code: IFieldCode): IField | undefined {
        return this.portal.deals[0].bitrixfields.find(
            field => field.code === code,
        );
    }
    getDealFieldBitrixIdByCode(code: IFieldCode): string {
        const field = this.portal.deals[0].bitrixfields.find(
            field => field.code === code,
        );
        if (!field) return '';
        return this.getFieldBitrixId(field);
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
        return (
            this.portal.deals[0].bitrixfields.map(field =>
                field.bitrixId.toString(),
            ) || []
        );
    }
    getCompanyFields(): IField[] {
        return this.portal.company?.bitrixfields || [];
    }

    getCompanyFieldByCode(code: string): IField | undefined {
        return this.portal.company?.bitrixfields.find(
            field => field.code === code,
        );
    }

    getContactFields(): IField[] {
        return this.portal.contact?.bitrixfields || [];
    }
    getContactField(fieldCode: string): IField | undefined {
        return this.portal.contact?.bitrixfields.find(
            field => field.code === fieldCode,
        );
    }
    getContactFieldBitrixId(fieldCode: string): string {
        const field = this.portal.contact?.bitrixfields.find(
            field => field.code === fieldCode,
        );
        if (!field) return '';
        const result = this.getFieldBitrixId(field);
        return result;
    }

    getContactValueItem(value: number, fieldCode: string): string | undefined {
        const field = this.getContactField(fieldCode);
        if (!field) return undefined;

        return field.items.find(item => item.bitrixId === value)?.code;
    }

    getBitrixIdByIdFieldItemList(
        items: IFieldItem[],
        value: number,
    ): string | undefined {
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

    getRpaFieldBitrixIdByCode(
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents -- 'supply' в союзе оставлен как подсказка автокомплита
        rpaCode: 'supply' | string,
        code: string,
    ): string | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        const field = this.getRpaFieldByCode(rpaCode, code);
        if (!field || !rpa) return undefined;

        return this.getRpaFieldBitrixId(rpa.bitrixId, field);
    }

    getRpaFieldBitrixId(rpaTypeId: number, field: IField | undefined): string {
        if (!field) {
            throw new Error('Field not found');
        }
        // В pbx у части порталов bitrixId лежит уже с префиксом
        // (UF_RPA_1_RPA_CRM_BASE_DEAL). Без этой проверки получаем
        // UF_RPA_1_UF_RPA_1_... и 400 «Unknown field definition» от rpa.item.*
        if (String(field.bitrixId).startsWith('UF_RPA_')) {
            return String(field.bitrixId);
        }
        return `UF_RPA_${rpaTypeId}_${field.bitrixId}`;
    }

    getStageByCode(stageCode: string): string | undefined {
        for (const category of this.portal.deals[0].categories || []) {
            const stage = category.stages.find(
                stage => stage.code === stageCode,
            );
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getStageRpaByCode(rpaCode: string, stageCode: string): string | undefined {
        const rpa = this.getRpaByCode(rpaCode);
        if (!rpa) return undefined;

        for (const category of rpa.categories) {
            const stage = category.stages.find(
                stage => stage.code === stageCode,
            );
            if (stage) return stage.bitrixId;
        }
        return undefined;
    }

    getPresetForName(code: string) {
        return this.portal.bx_rq?.find(preset => preset.code === code);
    }

    getSmartByType(type: SmartType) {
        return this.portal.smarts?.find(smart => smart.type === type);
    }

    getSmartFieldByCode(smart: IPSmart, code: string): IField | undefined {
        const field = smart.fields.find(f => f.code === code);
        if (
            field?.bitrixId &&
            field.bitrixId[0].toUpperCase() === field.bitrixId[0]
        ) {
            field.bitrixId =
                field.bitrixId[0].toLowerCase() + field.bitrixId.slice(1);
        }
        return field;
    }

    getMeasures(): IPPortalMeasure[] {
        return this.portal.measures;
    }
    getMeasureByCode(code: PMeasureCode): IPPortalMeasure {
        return this.portal.measures.find(
            measure => measure.measure.code === code,
        ) as IPPortalMeasure;
    }

    /**
     * Полное имя UF_CRM-поля. `bitrixId` в БД портала неоднороден:
     * konstructor-строки хранят полное имя («UF_CRM_1684144993»), остальные —
     * суффикс («CONTRACT_TYPE», «1687967605») — не наклеиваем префикс дважды.
     */
    getFieldBitrixId(field: IField): string {
        const raw = String(field.bitrixId ?? '');
        return raw.startsWith('UF_CRM_') ? raw : `UF_CRM_${raw}`;
    }

    getFieldItemByCode(
        field: IField,
        itemCode: string,
    ): IFieldItem | undefined {
        return field.items.find(item => item.code === itemCode);
    }

    /**
     * Рабочая группа звонков из PortalDB (таблица callings → IPortal):
     * типизированная замена доменных хардкодов getServiceTaskGroupId.
     * undefined — группа не установлена (ставится каноном pbx-install,
     * PbxGroupInstallUseCase).
     */
    getCallingGroupByCode = (
        group: IPCallingTasksGroup['group'],
    ): IPCallingTasksGroup | undefined => {
        return this.portal.callingGroups?.find(item => item.group === group);
    };

    getSalesTaskGroupId = (): number => {
        let result = 41;
        if (this.portal) {
            if (this.portal.bitrixCallingTasksGroup) {
                result = this.portal.bitrixCallingTasksGroup.bitrixId;
            }
        }
        return result;
    };

    getServiceTaskGroupId = (): number => {
        const domain = this.portal.domain;
        if (domain.includes('dev')) {
            return 15;
        }
        if (domain.includes('gsr')) {
            return 45;
        }
        if (domain.includes('april')) {
            return 34;
        }
        return 41;
    };

    getServiceSignalTaskGroupId = (): number => {
        const domain = this.portal.domain;
        if (domain.includes('dev')) {
            return 17;
        }
        if (domain.includes('gsr')) {
            return 9;
        }
        if (domain.includes('april')) {
            return 34;
        }
        return 41;
    };
}
