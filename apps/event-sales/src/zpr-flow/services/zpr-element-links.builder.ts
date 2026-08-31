import {
    ZPR_FIELD_DEF_BY_CODE,
    ZprSmartFieldCode,
} from '@lib/portal-lib/pbx/pbx-zpr-smart';
import {
    buildCrmLinkValue,
    CrmLinkPrefix,
} from '@lib/portal-lib/pbx/const-smart-registry';
import { BxRow, ZprFlowRun } from '../types/zpr-flow-run.type';
import { zprSetUf } from './zpr-element-fields.builder';

/**
 * ВСЕ СВЯЗИ элемента ЗПР с сущностями клиента — в одном месте.
 *
 * Ремонтируешь «не привязался к сделке/компании/лиду» / «пустой Клиент» /
 * «нет вкладки в карточке» — идти сюда: у элемента ТРИ независимых контура
 * связи, и каждый отвечает за своё:
 *
 *  1. НАШИ crm-поля (ZPR_BASE_DEAL и т.д., {@link applyLinks}) — связь для
 *     нашего же кода: по ним lookup находит элемент клиента.
 *  2. РОДИТЕЛИ (`parentId{entityTypeId}`, {@link applyParents}) — Битрикс
 *     показывает дочерние элементы в карточке и фильтрует их ТОЛЬКО по
 *     системному родителю; без него вкладка ЗПР в сделке пуста
 *     (замечание владельца 26.08).
 *  3. КЛИЕНТ (`companyId`/`contactIds`, {@link applyClient}) — системный
 *     блок «Клиент» смарт-процесса (isClientEnabled='Y' у установщика):
 *     штатное отображение клиента, телефония и письма из элемента. Это НЕ
 *     родитель и НЕ наше поле — третий, отдельный механизм (замечание
 *     владельца 31.08: блок оставался пустым).
 */
export class ZprElementLinksBuilder {
    constructor(private readonly run: ZprFlowRun) {}

    /**
     * Связи элемента с сущностями клиента (контур 1 — наши crm-поля).
     *
     * Формат значения считает {@link buildCrmLinkValue} по настройкам поля
     * из реестра: у ЗПР все эти поля ОДИНОЧНЫЕ и однотипные, поэтому в них
     * уезжает голый id. Раньше здесь безусловно писался `['D_25359']` —
     * массив с префиксом, — и Битрикс молча не сохранял ни одну связь
     * (инцидент 31.08: пустые «Основная сделка/Компания/Лид»).
     */
    applyLinks(fields: BxRow): void {
        const { job } = this.run;
        this.setCrmLink(fields, 'ZPR_BASE_DEAL', 'D', job.baseDealId);
        this.setCrmLink(fields, 'ZPR_PRES_DEAL', 'D', job.presDealId);
        this.setCrmLink(fields, 'ZPR_COMPANY', 'CO', job.companyId);
        this.setCrmLink(fields, 'ZPR_LEAD', 'L', job.leadId);
        this.setCrmLink(fields, 'ZPR_CONTACT', 'C', job.contactId);
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
        code: ZprSmartFieldCode,
        prefix: CrmLinkPrefix,
        id: number | null | undefined,
    ): void {
        if (!id) return;
        const value = buildCrmLinkValue(
            ZPR_FIELD_DEF_BY_CODE[code],
            prefix,
            id,
        );
        zprSetUf(this.run.info, fields, code, value);
    }
}
