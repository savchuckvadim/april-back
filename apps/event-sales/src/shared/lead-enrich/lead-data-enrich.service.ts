import { Logger } from '@nestjs/common';
import { uniq } from '@lib/portal-lib/pbx-duplicate';
import {
    IInnObservation,
    IInnRequisiteCard,
    InnFieldMap,
    InnPoolService,
    observeInnGraph,
} from '@lib/portal-lib/pbx-inn';
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

/**
 * Поля заявки, которые копируются в ПОЛЯ сделки (решение владельца
 * 17.09.2026: «всё, что писалось в карточку, хотят видеть в полях»).
 *
 * `from` — имя поля лида на портале; `to` — код парного поля сделки в
 * реестре. Поле сделки не установлено — пропускаем молча: пока установщик не
 * отработал, работает только карточка таймлайна.
 */
const DEAL_FIELD_COPY: readonly { from: string; to: string }[] = [
    { from: 'UF_CRM_USER_REGION', to: 'lead_user_region' },
    { from: 'UF_CRM_USER_CITY', to: 'lead_user_city' },
    { from: 'UF_CRM_ORDER_NUMBER', to: 'lead_order_number' },
    { from: 'UF_CRM_REG_NUMBER', to: 'lead_reg_number' },
    { from: 'UF_CRM_LEAD_USER_ADVICE', to: 'lead_user_advice' },
    { from: 'UF_CRM_LEAD_QUEST_URL', to: 'lead_quest_url' },
    { from: 'UF_CRM_LEAD_PAGE_REFERRER', to: 'lead_page_referrer' },
    // Отдел заведён и на лиде, и на сделке одним кодом — просто копируем.
    { from: 'UF_CRM_DEPARTMENT_STRING', to: 'department_string' },
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

    /**
     * Наблюдения последнего сбора. Ключ — ТОТ САМЫЙ массив, который вернул
     * `collectInns`: так `writeInns` получает источники значений, не меняя
     * публичный контракт `enrich`, и два параллельных обогащения не
     * перепутают свои данные.
     */
    private readonly observed = new WeakMap<
        readonly string[],
        IInnObservation[]
    >();

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

        await this.writeLeadFields(dealId, deal, leads, result.warnings);

        result.inns = await this.collectInns(deal, leads);
        if (result.inns.length) {
            await this.writeInns(dealId, deal, result.inns, result.warnings);
        }

        const posted = await this.writeTimeline(dealId, leads, result.warnings);
        result.timelinePosted = posted;
        return result;
    }

    /* ------------------------------------------------------------------ */

    /**
     * ИНН отовсюду: поля сделки и лидов, компания, её реквизиты.
     *
     * Сам разбор — общий с ручками фрейма (`observeInnGraph` из
     * `@lib/portal-lib/pbx-inn`): одни и те же правила «что слабое, что
     * сильное» должны действовать и в хуке, и в карточке ИНН. Здесь
     * остаётся только чтение карточек — связь сделка→лид кастомная, и
     * знает о ней вызывающий.
     */
    private async collectInns(deal: Row, leads: Row[]): Promise<string[]> {
        const dealId = Number(deal.ID) || 0;
        const companyId = Number(deal.COMPANY_ID) || 0;
        const company = companyId
            ? await this.getRow('crm.company.get', companyId)
            : null;
        const requisites = company
            ? await this.companyRequisites(companyId, this.text(company.TITLE))
            : [];

        const observations = observeInnGraph(
            { dealId, deal, leads, company, requisites },
            InnFieldMap.from(this.portal),
        );
        // Наблюдения нужны writeInns, чтобы отличить «слабый» ИНН из
        // названия от реквизита. Ключ — сам массив результата: два
        // обогащения подряд не перепутают свои данные.
        const inns = uniq(observations.map(item => item.inn));
        this.observed.set(inns, observations);
        return inns;
    }

    /** Реквизиты компании карточками; недоступны — пусто, это не ошибка. */
    private async companyRequisites(
        companyId: number,
        companyTitle: string,
    ): Promise<IInnRequisiteCard[]> {
        try {
            const response = (await this.bitrix.api.call('crm.requisite.list', {
                filter: {
                    ENTITY_TYPE_ID: RQ_ENTITY.company,
                    ENTITY_ID: companyId,
                },
                select: ['ID', 'RQ_INN', 'RQ_KPP', 'RQ_COMPANY_NAME', 'NAME'],
                start: -1,
            })) as Row;
            const rows = Array.isArray(response.result)
                ? (response.result as Row[])
                : [];
            return rows.map(row => ({
                id: Number(row.ID) || 0,
                ownerType: 'company' as const,
                ownerId: companyId,
                ownerTitle: companyTitle,
                name: this.text(row.NAME),
                presetId: Number(row.PRESET_ID) || 0,
                presetName: '',
                inn: this.text(row.RQ_INN),
                kpp: this.text(row.RQ_KPP),
                companyName: this.text(row.RQ_COMPANY_NAME),
                linked: false,
                otherDealIds: [],
            }));
        } catch {
            return [];
        }
    }

    /**
     * Данные заявки — в ПОЛЯ сделки. Пишем только в пустое: ручную правку
     * менеджера не перетираем, повторный прогон ничего не меняет.
     *
     * Телефоны и почты у лида штатные (PHONE/EMAIL), а не UF, поэтому идут
     * отдельно — в свои множественные поля сделки.
     */
    private async writeLeadFields(
        dealId: number,
        deal: Row,
        leads: Row[],
        warnings: string[],
    ): Promise<void> {
        if (!leads.length) return;
        const fields: Row = {};

        for (const { from, to } of DEAL_FIELD_COPY) {
            const target = this.fieldName('deal', to);
            if (!target || this.list(deal[target]).length) continue;
            const value = leads
                .map(lead => this.text(lead[from]))
                .find(Boolean);
            if (value) fields[target] = value;
        }

        const multi: readonly [string, 'PHONE' | 'EMAIL'][] = [
            ['op_lead_phones', 'PHONE'],
            ['op_lead_emails', 'EMAIL'],
        ];
        for (const [code, source] of multi) {
            const target = this.fieldName('deal', code);
            if (!target) continue;
            /*
             * На портале эти поля установлены ОДИНОЧНОЙ строкой (проверено
             * 17.09.2026 по `crm.deal.fields`), поэтому значения склеиваются
             * через запятую. Массив Битрикс бы не принял, а прежние значения
             * читаются тем же разбором — объединение работает и здесь.
             */
            const current = this.listValues(deal[target]);
            const found = uniq(leads.flatMap(lead => this.multi(lead[source])));
            const merged = uniq([...current, ...found]);
            // Объединением: номер, добавленный руками, не теряется.
            if (merged.length > current.length) {
                fields[target] = merged.join(', ');
            }
        }

        if (!Object.keys(fields).length) return;
        try {
            await this.bitrix.api.call('crm.deal.update', {
                id: dealId,
                fields,
            });
        } catch (error) {
            warnings.push(
                `Поля заявки сделки ${dealId} не записаны: ${(error as Error).message}`,
            );
        }
    }

    /**
     * Запись ИНН — ТОЛЬКО через `InnPoolService`, единственного писателя
     * `op_inn` / `op_inn_pool` (постановка `ai/tasks/2026-09-17-inn-strategy.md`).
     *
     * Что изменилось для хука: пул по-прежнему пополняется объединением, а
     * `op_inn` теперь ставится не «первым валидным из найденных», а только
     * когда кандидат ровно ОДИН и он не «слабый» (слабый = найден лишь в
     * названии). Именно «первый из многих» и породил четыре тысячи
     * непроверенных догадок в ночном догоне. Заодно синхронизируется пул
     * компании — раньше это умел только скрипт догона.
     */
    private async writeInns(
        dealId: number,
        deal: Row,
        inns: string[],
        warnings: string[],
    ): Promise<void> {
        const observations: IInnObservation[] = this.observed.get(inns) ?? [];
        const pool = new InnPoolService(this.bitrix, this.portal, this.domain);
        const result = await pool.absorb(dealId, deal, observations, {
            companyId: Number(deal.COMPANY_ID) || 0,
        });
        warnings.push(...result.warnings);
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
        /*
         * Карточка уже есть — второй раз не пишем, но ЗАКРЕПЛЯЕМ: закрепление
         * появилось позже самой карточки, и 8 тысяч записей от 16.09 остались
         * в ленте (решение владельца 17.09.2026: «закреплять можно везде
         * вчерашнюю запись»). Повторное закрепление Битрикс принимает молча.
         */
        const posted = await this.postedCommentId(dealId);
        if (posted !== null) {
            if (posted > 0) await this.pin(dealId, posted, warnings);
            return false;
        }

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

    /**
     * id уже записанной карточки; `null` — карточки нет и её надо писать.
     * Чтение не удалось — возвращаем 0 («карточка есть, id неизвестен»):
     * лучше не записать, чем задублировать.
     */
    private async postedCommentId(dealId: number): Promise<number | null> {
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
            const card = rows.find(row =>
                this.text(row.COMMENT).includes(TIMELINE_MARKER),
            );
            if (!card) return null;
            return Number(card.ID) || 0;
        } catch {
            return 0;
        }
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

    /**
     * Значения поля-«списка в строке»: телефоны и почты заявки установлены
     * одиночной строкой, где значения разделены запятой. Массив (если поле
     * когда-то переустановят множественным) разбирается тем же методом.
     */
    private listValues(raw: unknown): string[] {
        return this.list(raw).flatMap(value =>
            value
                .split(',')
                .map(part => part.trim())
                .filter(Boolean),
        );
    }

    private text(raw: unknown): string {
        if (typeof raw === 'string') return raw.trim();
        if (typeof raw === 'number') return String(raw);
        return '';
    }
}
