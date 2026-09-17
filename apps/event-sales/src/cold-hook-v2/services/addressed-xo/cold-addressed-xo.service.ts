import { Logger } from '@nestjs/common';
import { BitrixService, IBXDeal } from '@/modules/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { LeadRequestAcceptService } from '../../../lead-request/services/lead-request-accept.service';
import { IBatchGroupBuffer } from '../../../shared/batch';
import { CrmRelationsReassignService } from '../../../shared/crm-relations';
import { dealLeadIds } from '../../lib/deal-link-fields';
import {
    ColdLeadRequestV2Service,
    ColdOpenLead,
} from '../lead-request/cold-lead-request.service';
import { ColdRelations } from '../relations/cold-relations.types';
import { ColdTarget } from '../target/cold-target.types';

/** Что адресный ХО переназначит у клиента — итог фазы чтения. */
export interface ColdAddressedXoPlan {
    /** Открытые лиды входной и сохранённой основной сделок. */
    leads: ColdOpenLead[];
    /** Контакты основной/входной сделок, открытых лидов и компании. */
    contactIds: number[];
}

/** Уступили чужой работе — переназначать нечего. */
export const EMPTY_ADDRESSED_XO_PLAN: ColdAddressedXoPlan = {
    leads: [],
    contactIds: [],
};

/**
 * Независимых команд в одной группе буфера. Группа ≤ 50 — жёсткий предел
 * буфера; у клиента с десятками контактов одна группа его бы пробила.
 */
const INDEPENDENT_GROUP_SIZE = 10;

/**
 * «Адресный ХО везде» (решение владельца 17.09): ХО на сотрудника — это
 * принятая заявка, и новый ответственный ставится на все ПОВЕРХНОСТНЫЕ
 * связи работы: сделка → лид → контакт, сделка → компания → контакт.
 *
 * Сама основная сделка (стадия «Холодные», ответственный, принятие) и
 * компания пишутся в use-case; здесь — лиды и контакты:
 *  - лиды: входной сделки (сборщик связей) и сохранённой основной — в том
 *    числе при входе-компании, где входной сделки нет;
 *  - контакты: сохранённой основной и входной сделок, открытых лидов и
 *    компании. Закрытые лиды не трогаем — их контакты доходят только через
 *    сделку и компанию.
 *
 * Вызывается ТОЛЬКО в режиме `proceed`: уступив чужой работе (force=N),
 * ничего не меняем. Не injectable: портал и bitrix привязаны к домену.
 */
export class ColdAddressedXoV2Service {
    private readonly logger = new Logger(ColdAddressedXoV2Service.name);
    private readonly leadRequests: ColdLeadRequestV2Service;
    private readonly relations: CrmRelationsReassignService;

    constructor(
        private readonly portal: PortalModel,
        bitrix: BitrixService,
        accept: LeadRequestAcceptService,
    ) {
        this.leadRequests = new ColdLeadRequestV2Service(
            portal,
            bitrix,
            accept,
        );
        this.relations = new CrmRelationsReassignService(bitrix);
    }

    /**
     * Фаза чтения. Внутри — отправка batch (контакты), поэтому звать строго
     * до создания буфера записи: `bitrix.api` держит одну карту команд.
     */
    async load(
        target: ColdTarget,
        relations: ColdRelations,
        preservedBaseDeal: IBXDeal | null,
    ): Promise<ColdAddressedXoPlan> {
        const leadIds = uniqueIds([
            ...relations.leadIds,
            ...dealLeadIds(this.portal, preservedBaseDeal),
        ]);
        const leads = await this.leadRequests.loadOpen(leadIds);
        const contactIds = await this.relations.collectContactIds({
            dealIds: uniqueIds([
                Number(preservedBaseDeal?.ID),
                Number(target.entryDeal?.ID),
            ]),
            leadIds: leads.map(lead => lead.leadId),
            companyIds: target.companyId ? [target.companyId] : [],
        });
        this.logger.log(
            `[addressed-xo] hook=${target.hookKey}: leads=${leads.length} ` +
                `(ждут подтверждения ${leads.filter(lead => lead.waiting).length}) ` +
                `contacts=${contactIds.length}`,
        );
        return { leads, contactIds };
    }

    /**
     * Фаза записи: лиды и контакты — новому ответственному. Команды
     * независимы и уходят своими небольшими группами ПОСЛЕ группы создания
     * работы: в цепочку `$result[...]` сделок и задачи они не вклиниваются.
     */
    async queue(
        hookKey: string,
        plan: ColdAddressedXoPlan,
        responsibleId: number,
        names: Record<number, string>,
        buffer: IBatchGroupBuffer,
    ): Promise<void> {
        for (const leads of chunks(plan.leads)) {
            this.leadRequests.queue(
                hookKey,
                leads,
                responsibleId,
                names,
                buffer,
            );
            await buffer.endGroup();
        }
        for (const contactIds of chunks(plan.contactIds)) {
            this.relations.queueContactsResponsible(
                buffer,
                contactIds,
                responsibleId,
                `xo2_${hookKey}`,
            );
            await buffer.endGroup();
        }
    }

    /** Прежние ответственные лидов — для имён в истории и таймлайне. */
    static responsibleIds(plan: ColdAddressedXoPlan): number[] {
        return ColdLeadRequestV2Service.responsibleIds(plan.leads);
    }
}

const uniqueIds = (ids: number[]): number[] => [
    ...new Set(ids.filter(id => Number.isInteger(id) && id > 0)),
];

const chunks = <T>(items: T[]): T[][] => {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += INDEPENDENT_GROUP_SIZE) {
        result.push(items.slice(i, i + INDEPENDENT_GROUP_SIZE));
    }
    return result;
};
