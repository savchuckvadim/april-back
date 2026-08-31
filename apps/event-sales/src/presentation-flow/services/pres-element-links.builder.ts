import {
    PRESENTATION_FIELD_DEF_BY_CODE,
    PresentationSmartFieldCode,
} from '@lib/portal-lib/pbx/pbx-presentation-smart';
import {
    buildCrmLinkValue,
    CrmLinkPrefix,
} from '@lib/portal-lib/pbx/const-smart-registry';
import {
    BxRow,
    PresentationFlowRun,
} from '../types/presentation-flow-run.type';
import { presSetUf } from './pres-element-fields.builder';

/**
 * ВСЕ СВЯЗИ элемента презентации с сущностями клиента — в одном месте
 * (зеркало zpr-element-links.builder).
 *
 * Ремонтируешь «не привязалась к сделке/компании/лиду» / «пустой Клиент» /
 * «нет вкладки в карточке» — идти сюда: у элемента ТРИ независимых контура
 * связи, и каждый отвечает за своё:
 *
 *  1. НАШИ crm-поля (PRES_BASE_DEAL и т.д., {@link applyLinks}) — связь для
 *     нашего же кода: по ним lookup находит элемент клиента.
 *  2. РОДИТЕЛИ (`parentId{entityTypeId}`, {@link applyParents}) — вкладка
 *     дочерних элементов и штатный фильтр «презентации этой сделки»
 *     строятся Битриксом ТОЛЬКО по системному родителю.
 *  3. КЛИЕНТ (`companyId`/`contactIds`, {@link applyClient}) — системный
 *     блок «Клиент» смарт-процесса (isClientEnabled='Y' у установщика):
 *     штатное отображение клиента, телефония и письма из элемента
 *     (замечание владельца 31.08: блок оставался пустым).
 */
export class PresElementLinksBuilder {
    constructor(private readonly run: PresentationFlowRun) {}

    /**
     * Связи элемента с сущностями клиента (контур 1 — наши crm-поля).
     *
     * Формат значения считает {@link buildCrmLinkValue} по настройкам поля
     * из реестра: у презентаций все эти поля ОДИНОЧНЫЕ и однотипные,
     * поэтому в них уезжает голый id. Раньше здесь безусловно писался
     * `['D_25359']` — массив с префиксом, — и Битрикс молча не сохранял
     * ни одну связь (тот же баг, что и у ЗПР, инцидент 31.08).
     */
    applyLinks(fields: BxRow): void {
        const { job } = this.run;
        this.setCrmLink(fields, 'PRES_BASE_DEAL', 'D', job.baseDealId);
        this.setCrmLink(fields, 'PRES_DEAL', 'D', job.presDealId);
        // Связь с ТМЦ-сделкой прямо в элементе: сегодня её резолвят
        // обходом через pres-сделку (UF_CRM_TO_PRESENTATION_SALES), и
        // после отказа от pres-сделок этот путь исчезнет.
        this.setCrmLink(fields, 'PRES_TMC_DEAL', 'D', job.tmcDealId);
        this.setCrmLink(fields, 'PRES_COMPANY', 'CO', job.companyId);
        if (job.leadId) {
            this.setCrmLink(fields, 'PRES_LEAD', 'L', job.leadId);
            // Лид среди привязок = клиент пришёл заявкой/лидогеном.
            presSetUf(this.run.info, fields, 'PRES_IS_OUR_REQUEST', 'Y');
        }
        this.setCrmLink(fields, 'PRES_CONTACT', 'C', job.contactId);
    }

    /** Родители элемента (контур 2 — вкладка и фильтр в карточке). */
    applyParents(fields: BxRow): void {
        const { job } = this.run;
        if (job.baseDealId) fields['parentId2'] = job.baseDealId;
        if (job.companyId) fields['parentId4'] = job.companyId;
        if (job.leadId) fields['parentId1'] = job.leadId;
        if (job.contactId) fields['parentId3'] = job.contactId;
    }

    /** Системный блок «Клиент» (контур 3 — телефония/письма/отображение). */
    applyClient(fields: BxRow): void {
        const { job } = this.run;
        if (job.companyId) fields['companyId'] = job.companyId;
        // contactIds — множественное поле даже при одном контакте.
        if (job.contactId) fields['contactIds'] = [job.contactId];
    }

    /** Одна crm-связь в формате, который ждёт именно это поле. */
    private setCrmLink(
        fields: BxRow,
        code: PresentationSmartFieldCode,
        prefix: CrmLinkPrefix,
        id: number | null | undefined,
    ): void {
        if (!id) return;
        const value = buildCrmLinkValue(
            PRESENTATION_FIELD_DEF_BY_CODE[code],
            prefix,
            id,
        );
        presSetUf(this.run.info, fields, code, value);
    }
}
