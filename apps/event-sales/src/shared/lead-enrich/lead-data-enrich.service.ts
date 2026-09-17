import { Logger } from '@nestjs/common';
import {
    extractInnFromTitle,
    isValidInn,
    normalizeInnList,
    uniq,
} from '@lib/portal-lib/pbx-duplicate';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    crmCardUrl,
    timelineBold,
    timelineLinkLine,
    timelineText,
    toTimelineCommentDirect,
} from '@lib/bitrix/consts/timeline.consts';

type Row = Record<string, unknown>;

/** Минимум, который нужен от инстанса Битрикса (структурная типизация). */
export interface IEnrichBitrix {
    api: { call: (method: string, params: Row) => Promise<unknown> };
}

/** Итог обогащения одной сделки. */
export interface ILeadEnrichResult {
    /** Найденные ИНН (всё, что уехало в пул). */
    inns: string[];
    /** Записана ли карточка данных заявки в таймлайн. */
    timelinePosted: boolean;
    warnings: string[];
}

/**
 * ENTITY_TYPE_ID реквизитов. ТОЛЬКО контакт и компания: у лида и сделки
 * реквизитов не бывает вовсе — `crm.requisite.list` по ним отвечает ошибкой
 * (проверено 16.09.2026), и каждый такой вызов уходил телеграм-алертом.
 */
const RQ_ENTITY = { contact: 3, company: 4 } as const;

/**
 * Поля лида, которые переносить НЕКУДА: у сделки таких полей нет, и заводить
 * их — значит плодить второй источник правды. Поэтому они уходят ЗАПИСЬЮ В
 * ТАЙМЛАЙН сделки: менеджер видит их в карточке сразу, без перехода в лид.
 *
 * Имена портальные и подписей через REST не имеют (проверено: `crm.lead.fields`
 * отдаёт title, равный имени поля), поэтому подписи заданы здесь.
 */
const TIMELINE_FIELDS: readonly { field: string; label: string }[] = [
    { field: 'UF_CRM_USER_REGION', label: 'Регион' },
    { field: 'UF_CRM_USER_CITY', label: 'Город' },
    { field: 'UF_CRM_ORDER_NUMBER', label: 'Номер заявки' },
    { field: 'UF_CRM_REG_NUMBER', label: 'Код партнёра' },
    { field: 'UF_CRM_DEPARTMENT_STRING', label: 'Отдел' },
    { field: 'UF_CRM_LEAD_USER_ADVICE', label: 'Рекомендации по работе' },
    { field: 'UF_CRM_LEAD_QUEST_URL', label: 'Источник (анкета)' },
    { field: 'UF_CRM_LEAD_PAGE_REFERRER', label: 'Откуда пришёл' },
];

/** Заголовок карточки — он же признак «уже писали» для идемпотентности. */
const TIMELINE_MARKER = 'Данные заявки';

/** `ownerTypeId` сделки для `crm.timeline.item.pin`. */
const TIMELINE_OWNER_DEAL = 2;

/**
 * Перенос данных лида в сделку: ИНН — в поля, остальное — в таймлайн.
 *
 * ОДИН КОД НА ДВА ВХОДА. Его зовёт и хук «лид → работа» (чтобы новая сделка
 * сразу была полной), и скрипт догона (чтобы починить уже созданные). Копии
 * логики быть не должно: разъедутся на первой же правке.
 *
 * НЕ `@Injectable()` с `this.bitrix`: инстанс Битрикса приходит параметром
 * конструктора, потому что он свой на каждый домен (см. CLAUDE.md).
 */
export class LeadDataEnrichService {
    private readonly logger = new Logger(LeadDataEnrichService.name);

    constructor(
        private readonly bitrix: IEnrichBitrix,
        private readonly portal: PortalModel,
        /** Домен портала — только для ссылок в таймлайне. */
        private readonly domain: string,
    ) {}

    /**
     * Обогатить сделку данными её лидов и компании.
     *
     * `leadIds` передаёт вызывающий: связь сделка→лид у нас кастомная
     * (`deal_from_lead_id`, `deal_joined_leads`), и знает о ней он.
     */
    async enrich(
        dealId: number,
        deal: Row,
        leadIds: readonly number[],
    ): Promise<ILeadEnrichResult> {
        const result: ILeadEnrichResult = {
            inns: [],
            timelinePosted: false,
            warnings: [],
        };

        const leads: Row[] = [];
        for (const leadId of leadIds.slice(0, 5)) {
            const lead = await this.getRow('crm.lead.get', leadId);
            if (lead) leads.push(lead);
        }

        result.inns = await this.collectInns(deal, leads);
        if (result.inns.length) {
            await this.writeInns(dealId, deal, result.inns, result.warnings);
        }

        const posted = await this.writeTimeline(dealId, leads, result.warnings);
        result.timelinePosted = posted;
        return result;
    }

    /* ------------------------------------------------------------------ */

    /** ИНН отовсюду: поля сделки и лидов, компания, реквизиты контактов. */
    private async collectInns(deal: Row, leads: Row[]): Promise<string[]> {
        const found: string[] = [];
        const innFields = this.innFieldNames();

        found.push(...this.scanRow(deal, innFields.deal));
        for (const lead of leads) {
            found.push(...this.scanRow(lead, innFields.lead));
        }

        const companyId = Number(deal.COMPANY_ID) || 0;
        if (companyId) {
            const company = await this.getRow('crm.company.get', companyId);
            if (company) {
                found.push(...this.scanRow(company, innFields.company));
                found.push(
                    ...(await this.requisiteInns(RQ_ENTITY.company, companyId)),
                );
            }
        }

        return uniq(found.filter(value => isValidInn(value)));
    }

    /** ИНН из строки: наши поля + название (без чисел в скобках). */
    private scanRow(row: Row, fields: readonly string[]): string[] {
        const found: string[] = [];
        for (const field of fields) {
            for (const value of this.list(row[field])) {
                found.push(...normalizeInnList(value));
            }
        }
        /*
         * Название разбираем именно `extractInnFromTitle`: он выбрасывает
         * числа В СКОБКАХ, а там лежит номер заявки («Заявка с сайта
         * (123123213)»). Контрольной суммы против него мало — десятизначный
         * номер проходит её примерно в одном случае из одиннадцати.
         */
        found.push(...extractInnFromTitle(this.text(row.TITLE)));
        return found;
    }

    /** `RQ_INN` реквизитов сущности; недоступны — пусто, это не ошибка. */
    private async requisiteInns(
        entityTypeId: number,
        entityId: number,
    ): Promise<string[]> {
        try {
            const response = (await this.bitrix.api.call('crm.requisite.list', {
                filter: { ENTITY_TYPE_ID: entityTypeId, ENTITY_ID: entityId },
                select: ['ID', 'RQ_INN'],
                start: -1,
            })) as Row;
            const rows = Array.isArray(response.result)
                ? (response.result as Row[])
                : [];
            const found: string[] = [];
            for (const row of rows) {
                found.push(...normalizeInnList(this.text(row.RQ_INN)));
            }
            return found;
        } catch {
            return [];
        }
    }

    /** Пул пополняем объединением; `op_inn` — только если пуст. */
    private async writeInns(
        dealId: number,
        deal: Row,
        inns: string[],
        warnings: string[],
    ): Promise<void> {
        const innName = this.fieldName('deal', 'op_inn');
        const poolName = this.fieldName('deal', 'op_inn_pool');
        if (!innName || !poolName) {
            warnings.push('Поля op_inn / op_inn_pool не установлены на сделке');
            return;
        }
        const currentPool = this.list(deal[poolName]);
        const pool = uniq([...currentPool, ...inns]);
        const currentInn = this.text(deal[innName]);
        if (pool.length === currentPool.length && currentInn) return;

        const fields: Row = { [poolName]: pool };
        // Выбор человека не перетираем: пишем только в пустое.
        if (!currentInn) fields[innName] = inns[0];
        await this.bitrix.api.call('crm.deal.update', { id: dealId, fields });
    }

    /**
     * Карточка «Данные заявки» в таймлайн сделки.
     *
     * Идемпотентно: перед записью ищем свой заголовок среди последних
     * комментариев. Иначе повторный прогон (или повторный хук) засыпал бы
     * карточку одинаковыми записями — так уже случилось с задачами
     * «Звонок по переданной работе».
     */
    private async writeTimeline(
        dealId: number,
        leads: Row[],
        warnings: string[],
    ): Promise<boolean> {
        const lines = this.timelineLines(leads);
        if (!lines.length) return false;
        if (await this.alreadyPosted(dealId)) return false;

        try {
            const response = (await this.bitrix.api.call(
                'crm.timeline.comment.add',
                {
                    fields: {
                        ENTITY_ID: dealId,
                        ENTITY_TYPE: 'deal',
                        COMMENT: toTimelineCommentDirect([
                            timelineBold(TIMELINE_MARKER),
                            ...lines,
                        ]),
                    },
                },
            )) as Row;
            await this.pin(dealId, Number(response.result), warnings);
            return true;
        } catch (error) {
            warnings.push(
                `Запись в таймлайн сделки ${dealId} не сделана: ${(error as Error).message}`,
            );
            return false;
        }
    }

    /**
     * Карточку закрепляем наверху таймлайна: смысл был в том, чтобы менеджер
     * видел телефон сразу, а не листал ленту.
     *
     * Закрепить можно ТОЛЬКО ТРИ записи на сделку — так устроен Битрикс.
     * Поэтому отказ («Только три события можно добавить в избранное») это не
     * ошибка нашей работы: карточка уже записана и видна, просто не наверху.
     * Предупреждение оставляем, обогащение не роняем.
     */
    private async pin(
        dealId: number,
        commentId: number,
        warnings: string[],
    ): Promise<void> {
        if (!Number.isFinite(commentId) || commentId <= 0) return;
        try {
            await this.bitrix.api.call('crm.timeline.item.pin', {
                id: commentId,
                ownerTypeId: TIMELINE_OWNER_DEAL,
                ownerId: dealId,
            });
        } catch (error) {
            warnings.push(
                `Карточка сделки ${dealId} не закреплена: ${(error as Error).message}`,
            );
        }
    }

    /** Строки карточки: телефоны, почты и поля, которым нет места в сделке. */
    private timelineLines(leads: Row[]): string[] {
        const lines: string[] = [];
        const phones = uniq(leads.flatMap(lead => this.multi(lead.PHONE)));
        const emails = uniq(leads.flatMap(lead => this.multi(lead.EMAIL)));
        if (phones.length) {
            lines.push(timelineText(`Телефоны: ${phones.join(', ')}`));
        }
        if (emails.length) {
            lines.push(timelineText(`Почта: ${emails.join(', ')}`));
        }
        for (const { field, label } of TIMELINE_FIELDS) {
            const values = uniq(leads.flatMap(lead => this.list(lead[field])));
            if (values.length) {
                lines.push(timelineText(`${label}: ${values.join(', ')}`));
            }
        }
        for (const lead of leads) {
            const leadId = Number(lead.ID);
            if (!leadId) continue;
            lines.push(
                timelineLinkLine(
                    'Заявка',
                    crmCardUrl(this.domain, 'lead', leadId),
                    `Лид #${leadId}`,
                ),
            );
        }
        return lines;
    }

    /** Карточка уже писалась — второй раз не пишем. */
    private async alreadyPosted(dealId: number): Promise<boolean> {
        try {
            const response = (await this.bitrix.api.call(
                'crm.timeline.comment.list',
                {
                    filter: { ENTITY_ID: dealId, ENTITY_TYPE: 'deal' },
                    select: ['ID', 'COMMENT'],
                    order: { ID: 'DESC' },
                    start: 0,
                },
            )) as Row;
            const rows = Array.isArray(response.result)
                ? (response.result as Row[])
                : [];
            return rows.some(row =>
                this.text(row.COMMENT).includes(TIMELINE_MARKER),
            );
        } catch {
            // Не прочитали — лучше не записать, чем задублировать.
            return true;
        }
    }

    /** UF-имена ИНН-полей по сущностям (из реестра портала). */
    private innFieldNames(): {
        lead: string[];
        deal: string[];
        company: string[];
    } {
        const pick = (entity: 'lead' | 'deal' | 'company'): string[] =>
            [
                this.fieldName(entity, 'op_inn'),
                this.fieldName(entity, 'op_inn_pool'),
            ].filter((name): name is string => !!name);
        return {
            lead: pick('lead'),
            deal: pick('deal'),
            company: pick('company'),
        };
    }

    private fieldName(
        entity: 'lead' | 'deal' | 'company',
        code: string,
    ): string | null {
        const field = this.portal.getEntityFieldByCode(entity, code);
        return field ? this.portal.getFieldBitrixId(field) : null;
    }

    private async getRow(method: string, id: number): Promise<Row | null> {
        try {
            const response = (await this.bitrix.api.call(method, {
                id,
            })) as Row;
            const result = response.result;
            return result && typeof result === 'object'
                ? (result as Row)
                : null;
        } catch {
            return null;
        }
    }

    /** Множественные поля Битрикса (PHONE/EMAIL): `[{ VALUE }]`. */
    private multi(raw: unknown): string[] {
        if (!Array.isArray(raw)) return [];
        return raw
            .map(item =>
                item && typeof item === 'object'
                    ? this.text((item as Row).VALUE)
                    : this.text(item),
            )
            .filter(Boolean);
    }

    private list(raw: unknown): string[] {
        const values = Array.isArray(raw) ? raw : [raw];
        return values.map(value => this.text(value)).filter(Boolean);
    }

    private text(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number') return String(raw);
        return '';
    }
}
