import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { Logger } from '@nestjs/common';
import { ColdPortalDealModel } from './cold-portal-deal.model';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import { SalesBatchGroupBuffer as ColdHookBatchGroupBuffer } from '../../../../shared/batch';
import { IColdCallEventData } from '../entity/cold-call-bx-entity.flow.service';
import { EventEntityModel } from '../entity/event-entity.model';
import { EnumColdCallEntityType } from '../../../dto/cold.dto';
import { dealLinkKey } from '../../../lib/deal-link-fields';
import { ColdOwner, ownerKey } from '../cold-owner.type';
import {
    clearDealAssignedAt,
    setDealAcceptedBy,
} from '../../../../shared/lead-request/deal-work-timer.util';
import { setManagerOp } from '../../../../shared/lead-request/manager-op.util';

export interface IColdDealFlowResult {
    /**
     * Основная: реальный id либо `$result[...]` её создания; null — основной
     * нет и создать её нельзя (стадия «Холодные» не сопоставлена).
     */
    baseDealId: string | null;
    xoDealId: string;
}

/**
 * Основная и ХО-сделки холодного старта.
 *
 * Владелец — компания (как v1) либо клиент без компании (v2, шаг 6): тогда
 * `COMPANY_ID` не пишется, а НОВЫЕ сделки получают контакт и лид входной
 * сделки. ХО-сделка в обоих случаях ссылается на основную через
 * `to_base_sales` — по этой ссылке сборщик связей находит её у клиента без
 * компании (у v1 ссылки нет, связь только через компанию).
 */
export class ColdDealFlowService {
    private readonly logger = new Logger(ColdDealFlowService.name);
    private portlDealModel: ColdPortalDealModel;

    constructor(
        private readonly bitrix: BitrixService,
        private readonly portal: PortalModel,
    ) {
        this.portlDealModel = new ColdPortalDealModel(this.portal);
    }

    public flow(
        data: IColdCallEventData,
        owner: ColdOwner,
        baseDeal: IBXDeal | null,
        buffer: ColdHookBatchGroupBuffer,
    ): IColdDealFlowResult {
        const baseDealId = this.prepareBaseDeal(data, owner, baseDeal, buffer);
        const xoDealId = this.createXoDeal(data, owner, baseDealId, buffer);

        return { baseDealId, xoDealId };
    }

    /**
     * Основная сделка — в «Холодные» и новому ответственному.
     *
     * Стадия на портале не сопоставлена — существующая основная всё равно
     * уходит новому ответственному (без смены воронки и стадии): адресный
     * ХО обязан переназначить работу везде. Новую же основную в такой
     * конфигурации не создаём и ссылку на неё не отдаём — `$result` на
     * команду, которой нет в батче, превратился бы в мусор в полях
     * ХО-сделки, задачи и KPI.
     */
    private prepareBaseDeal(
        data: IColdCallEventData,
        owner: ColdOwner,
        baseDeal: IBXDeal | null,
        buffer: ColdHookBatchGroupBuffer,
    ): string | null {
        const key = ownerKey(owner);
        const { name, deadline, responsibleId, xoCreated } = data;
        const targetBase = this.portlDealModel.getTargetStageBitrixId(
            PbxDealCategoryCodeEnum.sales_base,
        );
        if (!targetBase) {
            this.logger.warn(
                `[deal] owner=${key}: стадия «Холодные» воронки ОП не сопоставлена — ` +
                    (baseDeal
                        ? `основная #${baseDeal.ID} переназначается без смены стадии`
                        : 'новая основная не создаётся'),
            );
            if (!baseDeal) return null;
        }

        const baseDealEntity = new EventEntityModel(
            this.portal,
            baseDeal,
            EnumColdCallEntityType.DEAL,
            name,
            deadline,
            responsibleId,
            xoCreated,
        );
        const fields: Partial<IBXDeal> = {
            ...(targetBase
                ? {
                      CATEGORY_ID: targetBase.categoryId,
                      STAGE_ID: targetBase.stageId,
                  }
                : {}),
            ASSIGNED_BY_ID: responsibleId.toString(),
            ...this.ownerFields(owner, baseDeal === null),
            ...baseDealEntity.getNextValues(),
        };
        this.acceptWork(responsibleId, fields as Record<string, unknown>);

        if (baseDeal) {
            const updateBaseDealKey = `update_base_deal_${baseDeal.ID}`;
            this.logger.log(
                `[DEADLINE][deal][SEND] base deal.update owner=${key} ` +
                    `cmdKey=${updateBaseDealKey} dealId=${baseDeal.ID} ` +
                    `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                    `payload=${JSON.stringify(fields)}`,
            );
            buffer.queue(() =>
                this.bitrix.batch.deal.update(
                    updateBaseDealKey,
                    Number(baseDeal.ID),
                    // Значения уже посчитаны в fields — повторный
                    // getNextValues() здесь и задваивал историю, пока модель
                    // мутировала массив сущности.
                    fields,
                ),
            );
            return String(baseDeal.ID);
        }

        const setBaseDealKey = `new_base_deal_${key}`;
        this.logger.log(
            `[DEADLINE][deal][SEND] base deal.set owner=${key} ` +
                `cmdKey=${setBaseDealKey} ` +
                `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                `payload=${JSON.stringify(fields)}`,
        );
        buffer.queue(() => this.bitrix.batch.deal.set(setBaseDealKey, fields));
        return this.getDealIdByBatchCommandKey(setBaseDealKey);
    }

    private createXoDeal(
        data: IColdCallEventData,
        owner: ColdOwner,
        baseDealId: string | null,
        buffer: ColdHookBatchGroupBuffer,
    ) {
        const key = ownerKey(owner);
        const createColdKey = `new_cold_deal_${key}`;
        const { name, deadline, responsibleId, xoCreated } = data;

        const targetCold = this.portlDealModel.getTargetStageBitrixId(
            PbxDealCategoryCodeEnum.sales_xo,
        );

        if (targetCold) {
            const coldDealEntity = new EventEntityModel(
                this.portal,
                null,
                EnumColdCallEntityType.DEAL,
                name,
                deadline,
                responsibleId,
                xoCreated,
            );
            const coldDealEntityFieldValues = coldDealEntity.getNextValues();
            const coldAddDealData: Partial<IBXDeal> = {
                TITLE: coldDealEntity.getEventName(),
                CATEGORY_ID: targetCold.categoryId,
                STAGE_ID: targetCold.stageId,
                ASSIGNED_BY_ID: responsibleId.toString(),
                ...this.ownerFields(owner, true),
                // Ссылка на основную: реальный id либо $result[new_base_deal_…]
                // того же батча — Bitrix подставляет токен и в UF-поле.
                ...(baseDealId
                    ? {
                          [dealLinkKey(this.portal, 'to_base_sales')]:
                              baseDealId,
                      }
                    : {}),
                ...coldDealEntityFieldValues,
            };
            this.logger.log(
                `[DEADLINE][deal][SEND] cold deal.set owner=${key} ` +
                    `cmdKey=${createColdKey} ` +
                    `deadlineCrm="${deadline.toCrmDateTime()}" (локаль портала) ` +
                    `payload=${JSON.stringify(coldAddDealData)}`,
            );
            buffer.queue(() =>
                this.bitrix.batch.deal.set(createColdKey, coldAddDealData),
            );
        }

        return this.getDealIdByBatchCommandKey(createColdKey);
    }

    /**
     * Адресный ХО = принятие работы (решения владельца 16.09 и 17.09):
     * ожидание подтверждения снимается и «Кто принял» пишется ВСЕГДА, а не
     * только когда таймер был заполнен. Иначе новый хозяин мог получить
     * сделку с чужим таймером, и SLA забирал бы её по чужой просрочке.
     *
     * «Менеджер по продажам Гарант» — тот же сотрудник. EventEntityModel
     * пишет его только у СУЩЕСТВУЮЩЕЙ сделки (у новой модель полей не
     * отдаёт), поэтому ставим явно: у существующей это тот же ключ с тем же
     * сотрудником, у новой — единственная запись.
     * Поля нет в слепке — молча пропускается.
     */
    private acceptWork(
        responsibleId: number | string,
        fields: Record<string, unknown>,
    ): void {
        const userId = Number(responsibleId) || null;
        clearDealAssignedAt(this.portal, fields);
        setDealAcceptedBy(this.portal, fields, userId);
        setManagerOp(this.portal, 'deal', fields, userId);
    }

    /**
     * Привязка сделки к клиенту. Компания пишется всегда (v1 ставит её и на
     * update основной); контакт и лид входной сделки — только на НОВЫЕ
     * сделки клиента без компании: у существующей основной свои связи.
     */
    private ownerFields(owner: ColdOwner, isNew: boolean): Partial<IBXDeal> {
        if (owner.kind === 'company') {
            return { COMPANY_ID: owner.companyId.toString() };
        }
        if (!isNew) return {};
        const fields: Record<string, string> = {};
        if (owner.contactId) fields['CONTACT_ID'] = String(owner.contactId);
        if (owner.leadId) fields['LEAD_ID'] = String(owner.leadId);
        return fields as Partial<IBXDeal>;
    }

    /**
     * Формат строки-ссылки на $result батча. Bitrix подставляет такой токен
     * И когда значение поля = ровно `$result[key]`, И когда это подстрока
     * (например `D_$result[key]` в crm-поле списочного элемента). Кавычки
     * вокруг ключа ломают подстановку в lists.element.add (поле "CRM" возвращает
     * ERROR_ELEMENT_FIELD_VALUE), поэтому используем bare-форму как в legacy PHP.
     */
    private getDealIdByBatchCommandKey(key: string): string {
        return `$result[${key}]`;
    }
}
