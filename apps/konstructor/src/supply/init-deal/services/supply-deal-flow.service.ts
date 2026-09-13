import { Logger } from '@nestjs/common';
import { BitrixService, IBXCompany, IBXDeal, IBxRpaItem } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    PbxDealCategoryCodeEnum,
    PortalDealServiceStageCodeEnum,
} from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    CLEARED_DEAL_FIELD_CODES,
    INIT_DEAL_RPA_FIELD,
} from '../lib/init-deal-rpa-fields';
import {
    daysUntilContractEnd,
    resolveServiceStageCode,
} from '../lib/service-deal-stage.util';

/** Что Bitrix принимает значением пользовательского поля. */
type BitrixFieldValue = string | number | boolean | string[] | number[];

const isPrimitive = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';

/** Скалярное значение поля RPA — id, номер, дата. null, если поле пустое. */
const toScalar = (value: unknown): string | number | null => {
    if (typeof value === 'string' && value !== '') {
        return value;
    }
    if (typeof value === 'number') {
        return value;
    }
    return null;
};

/**
 * Значение из RPA в форме, пригодной для записи в поле сделки.
 * null — писать нечего (пусто или структура, которую поле не примет).
 */
const toBitrixFieldValue = (value: unknown): BitrixFieldValue | null => {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    if (isPrimitive(value)) {
        return value;
    }
    if (Array.isArray(value)) {
        const items = value.filter(isPrimitive).map(item => String(item));
        return items.length ? items : null;
    }
    return null;
};

/**
 * Ветка «Поставка»: сервисная сделка собирается из RPA и БАЗОВОЙ сделки отдела
 * продаж (в отличие от перезаключения, где источник — смарт «предложение на
 * будущий период»).
 *
 * Сервис намеренно не @Injectable: внутри живёт per-domain инстанс Bitrix,
 * держать его в синглтоне нельзя (CLAUDE.md — race condition).
 */
export class SupplyDealFlowService {
    private readonly logger = new Logger(SupplyDealFlowService.name);

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portalModel: PortalModel,
    ) {}

    /** Значение поля RPA по коду. */
    private rpaValue(rpa: IBxRpaItem, code: string): unknown {
        const key = this.portalModel.getRpaFieldBitrixIdByCode('supply', code);
        return key ? rpa[key] : undefined;
    }

    /**
     * Поля, которые есть только у поставки: контакты, ARM-идентификаторы,
     * менеджер обучения. Ответственный и компания ставятся общим кодом.
     */
    buildSupplyOnlyValues(rpa: IBxRpaItem): Partial<IBXDeal> {
        const values: Partial<IBXDeal> = {};

        const contacts = this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.contacts);
        if (Array.isArray(contacts) && contacts.length) {
            values.CONTACT_IDS = contacts.map(id => String(id));
        }

        const byCode: Array<[string, unknown]> = [
            [
                INIT_DEAL_RPA_FIELD.armComplectId,
                this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.armComplectId),
            ],
            [
                INIT_DEAL_RPA_FIELD.armClientId,
                this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.armClientId),
            ],
            [
                INIT_DEAL_RPA_FIELD.managerEdu,
                this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.managerEdu),
            ],
        ];

        for (const [code, value] of byCode) {
            const bxValue = toBitrixFieldValue(value);
            if (bxValue === null) {
                continue;
            }
            const bitrixId = this.portalModel.getDealFieldBitrixIdByCode(code);
            if (!bitrixId) {
                this.logger.warn(`Поле сделки "${code}" не найдено в pbx`);
                continue;
            }
            values[bitrixId] = bxValue;
        }

        return values;
    }

    /**
     * Текущие договор/счёт/поставка на новой сделке всегда пустые: сервис
     * работает по ним заново, а из базовой сделки они бы приехали чужими.
     */
    buildClearedDocumentValues(): Partial<IBXDeal> {
        const values: Partial<IBXDeal> = {};
        for (const code of CLEARED_DEAL_FIELD_CODES) {
            const bitrixId = this.portalModel.getDealFieldBitrixIdByCode(code);
            if (bitrixId) {
                values[bitrixId] = '';
            }
        }
        return values;
    }

    /**
     * Непустые пользовательские поля базовой сделки — всё, что сервису нужно
     * знать о продаже. Уже собранные значения не перетираем: RPA свежее.
     */
    async buildBaseDealValues(
        baseDealId: number,
        alreadySet: Partial<IBXDeal>,
    ): Promise<Partial<IBXDeal>> {
        const values: Partial<IBXDeal> = {};

        const response = await this.bitrix.deal.get(baseDealId);
        const baseDeal = response?.result as IBXDeal | undefined;
        if (!baseDeal) {
            this.logger.warn(`Базовая сделка ${baseDealId} не прочитана`);
            return values;
        }

        for (const [key, value] of Object.entries(baseDeal)) {
            if (!key.startsWith('UF_CRM_') || key in alreadySet) {
                continue;
            }
            if (this.isEmpty(value)) {
                continue;
            }
            values[key] = value;
        }

        return values;
    }

    private isEmpty(value: unknown): boolean {
        if (value === null || value === undefined || value === false) {
            return true;
        }
        if (value === '' || value === 0 || value === '0') {
            return true;
        }
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        if (typeof value === 'object') {
            return Object.keys(value as Record<string, unknown>).length === 0;
        }
        return false;
    }

    /**
     * STAGE_ID сервисной воронки по остатку срока договора: чем меньше времени
     * до перезаключения, тем «горячее» стадия.
     */
    resolveStageId(rpa: IBxRpaItem): string | null {
        const category = this.portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!category) {
            return null;
        }

        const contractEnd = this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.contractEnd);
        return this.resolveStageIdByContractEnd(
            typeof contractEnd === 'string' ? contractEnd : null,
        );
    }

    /**
     * То же, но по явной дате: облегчённая поставка идёт мимо RPA, дату конца
     * договора менеджер вводит в форме конструктора.
     */
    resolveStageIdByContractEnd(contractEnd: string | null): string | null {
        const category = this.portalModel.getDealCategoryByCode(
            PbxDealCategoryCodeEnum.service_base,
        );
        if (!category) {
            return null;
        }

        const stageCode: PortalDealServiceStageCodeEnum =
            resolveServiceStageCode(daysUntilContractEnd(contractEnd));

        const stage = this.portalModel.getDealStageByCode(
            PbxDealCategoryCodeEnum.service_base,
            stageCode,
        );
        if (!stage) {
            this.logger.warn(
                `Стадия "${stageCode}" не найдена в воронке service_base`,
            );
            return null;
        }

        return `C${category.bitrixId}:${stage.bitrixId}`;
    }

    /**
     * Поставка передаёт клиента в сервис: ответственным у компании и всех её
     * контактов становится менеджер ОРК, у компании обновляется номер в АРМ.
     */
    async updateParticipants(rpa: IBxRpaItem): Promise<void> {
        const managerOs = toScalar(
            this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.managerOs),
        );
        if (!managerOs) {
            this.logger.warn(
                'В RPA не указан менеджер ОРК — ответственных не меняем',
            );
            return;
        }

        await this.assignToServiceManager({
            managerOsId: Number(managerOs),
            companyId: Number(
                toScalar(this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.company)) ?? 0,
            ),
            registrationList: toScalar(
                this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.armClientId),
            ),
            contactIds: this.readContactIds(rpa),
        });
    }

    /**
     * Перевод клиента на менеджера ОРК по явным значениям — общая часть для
     * поставки из RPA и облегчённой поставки из конструктора.
     *
     * `registrationList` — рег-лист компании (номер в АРМ, поле
     * `UF_CRM_USER_CARDNUM`). `null` — оставить текущий.
     */
    async assignToServiceManager(params: {
        managerOsId: number;
        companyId: number;
        registrationList: string | number | null;
        contactIds: number[];
    }): Promise<void> {
        if (params.companyId) {
            const companyFields: Partial<IBXCompany> = {
                ASSIGNED_BY_ID: String(params.managerOsId),
            };
            if (params.registrationList) {
                companyFields.UF_CRM_USER_CARDNUM = String(
                    params.registrationList,
                );
            }
            await this.bitrix.company.update(params.companyId, companyFields);
        }

        for (const contactId of params.contactIds) {
            await this.bitrix.contact.update(contactId, {
                ASSIGNED_BY_ID: params.managerOsId,
            });
        }
    }

    private readContactIds(rpa: IBxRpaItem): number[] {
        const contacts = this.rpaValue(rpa, INIT_DEAL_RPA_FIELD.contacts);
        if (!Array.isArray(contacts)) {
            return [];
        }
        return contacts
            .map(contactId => Number(contactId))
            .filter(contactId => Number.isFinite(contactId) && contactId > 0);
    }
}
