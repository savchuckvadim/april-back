import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import { PBX_SALES_EVENT_FIELD_CODES } from '@lib/portal-lib/pbx';
import { PbxDealCategoryCodeEnum } from '@lib/portal-lib/portal/services/types/deals/portal.deal.type';
import {
    crmCardUrl,
    timelineBold,
    timelineLink,
} from '@lib/bitrix/consts/timeline.consts';
import { mergeTaskCrmBindings } from '@/modules/bitrix/domain/tasks/task/lib/task-crm-binding.util';
import { appendDealHistory } from '../../../shared/lead-request/deal-work-timer.util';
import { setManagerOp } from '../../../shared/lead-request/manager-op.util';
import { IJoinToMainItem } from '../dto/join-to-main.dto';

type BxRow = Record<string, unknown>;

/** Сделка после чтения — только то, что нужно плану. */
export interface IJoinDealSnapshot {
    id: number;
    title: string;
    categoryId: number | null;
    stageId: string;
    closed: boolean;
    responsibleId: number | null;
    companyId: number | null;
    contactIds: number[];
    /** Лиды сделки: deal_from_lead_id + deal_joined_leads + штатный LEAD_ID. */
    leadIds: number[];
    row: BxRow;
}

export interface IJoinLeadSnapshot {
    id: number;
    row: BxRow;
}

/** Всё, что прочитано с портала для одного присоединения. */
export interface IJoinSnapshot {
    item: IJoinToMainItem;
    source: IJoinDealSnapshot | null;
    /** Основная: явная либо самая старая открытая сделка ОП компании. */
    main: IJoinDealSnapshot | null;
    /** Компания-цель (режим company); в режиме deal — компания основной. */
    companyId: number | null;
    leads: IJoinLeadSnapshot[];
    /** Контакт → компании, к которым он уже привязан. */
    contactCompanies: Map<number, number[]>;
    warnings: string[];
}

/** Одна запись плана — транспорт превращает её в batch-команду. */
export type JoinOp =
    | { kind: 'contactCompany'; contactId: number; companyId: number }
    | { kind: 'dealContact'; dealId: number; contactId: number }
    | { kind: 'dealUpdate'; dealId: number; fields: BxRow }
    | { kind: 'leadUpdate'; leadId: number; fields: BxRow }
    | { kind: 'timeline'; dealId: number; comment: string };

export interface IJoinPlan {
    ops: JoinOp[];
    skipped: boolean;
    mainDealId: number | null;
    companyId: number | null;
    /** Кому уходит работа (ответственный основной). */
    responsibleId: number | null;
    contactsLinked: number;
    leadsRelinked: number;
    closesAsDuplicate: boolean;
    warnings: string[];
}

/** Контактов на одну сделку-дубль — группа буфера ограничена 50 командами. */
const MAX_CONTACTS = 10;
const DOUBLE_STAGE_CODE = 'sales_double';
const TITLE_LIMIT = 60;

/**
 * ПЛАН присоединения сделки-дубля к основной — чистая функция без I/O.
 *
 * Случай 24.09.2026 (сделки 87955 → 42423): новая заявка того же клиента
 * рождает вторую сделку с новым контактным лицом, менеджер ведёт работу в
 * основной и не знает, куда деть вторую. Слияние средствами Битрикса
 * удаляет младшую сделку навсегда — здесь ничего не удаляется:
 *
 *  - контакты дубля → компания клиента и основная сделка;
 *  - лиды дубля → на основную (`to_base_sales`), ответственный основной;
 *  - основная: компания (если пусто), union присоединённых лидов, история;
 *  - дубль: ссылка на основную, тот же ответственный, стадия «Дубль»;
 *  - таймлайн основной — карточка «присоединена сделка …».
 *
 * Идемпотентно: повтор по уже присоединённой сделке не пишет историю и
 * таймлайн второй раз, привязки — только недостающие.
 */
export function buildJoinPlan(
    portal: PortalModel,
    domain: string,
    snap: IJoinSnapshot,
): IJoinPlan {
    const warnings = [...snap.warnings];
    const { item, source, main } = snap;
    const skip = (reason: string): IJoinPlan => ({
        ops: [],
        skipped: true,
        mainDealId: main?.id ?? null,
        companyId: snap.companyId,
        responsibleId: null,
        contactsLinked: 0,
        leadsRelinked: 0,
        closesAsDuplicate: false,
        warnings: [...warnings, reason],
    });

    const category = portal.getDealCategoryByCode(
        PbxDealCategoryCodeEnum.sales_base,
    );
    const baseCategoryId = Number(category?.bitrixId);
    if (!source) return skip(`Сделка ${item.dealId} не найдена на портале`);
    if (!category || source.categoryId !== baseCategoryId) {
        return skip(
            `Сделка ${source.id} не в воронке ОП (CATEGORY_ID=${source.categoryId ?? '—'}) — не трогаем`,
        );
    }
    if (main) {
        if (main.id === source.id) {
            return skip('Сделка и основная совпадают — присоединять нечего');
        }
        if (main.categoryId !== baseCategoryId) {
            return skip(
                `Основная сделка ${main.id} не в воронке ОП — не трогаем`,
            );
        }
        if (main.closed) {
            return skip(
                `Основная сделка ${main.id} закрыта — присоединять к ней нельзя, выберите открытую`,
            );
        }
    } else if (item.targetType === 'deal') {
        return skip(`Основная сделка ${item.targetId} не найдена на портале`);
    }

    const companyId = main?.companyId ?? snap.companyId ?? source.companyId;
    const ops: JoinOp[] = [];

    // --- Контакты дубля: в компанию клиента и в основную сделку.
    const contacts = source.contactIds.slice(0, MAX_CONTACTS);
    if (source.contactIds.length > MAX_CONTACTS) {
        warnings.push(
            `Контактов у сделки ${source.contactIds.length} — присоединены первые ${MAX_CONTACTS}`,
        );
    }
    let contactsLinked = 0;
    for (const contactId of contacts) {
        const bound = snap.contactCompanies.get(contactId) ?? [];
        if (companyId && !bound.includes(companyId)) {
            ops.push({ kind: 'contactCompany', contactId, companyId });
            contactsLinked += 1;
        }
        if (main && !main.contactIds.includes(contactId)) {
            ops.push({ kind: 'dealContact', dealId: main.id, contactId });
            contactsLinked += 1;
        }
    }

    // --- Открытой основной нет: дубль сам становится основной у компании.
    if (!main) {
        const fields: BxRow = {};
        if (companyId && !source.companyId) fields.COMPANY_ID = companyId;
        if (Object.keys(fields).length) {
            ops.push({ kind: 'dealUpdate', dealId: source.id, fields });
        }
        warnings.push(
            `У компании ${companyId ?? '—'} нет открытой сделки ОП — сделка ${source.id} остаётся основной, ей привязана компания`,
        );
        return {
            ops,
            skipped: false,
            mainDealId: null,
            companyId,
            responsibleId: source.responsibleId,
            contactsLinked,
            leadsRelinked: 0,
            closesAsDuplicate: false,
            warnings,
        };
    }

    const alreadyJoined = isJoined(portal, source, main);
    const orderNumber = dealText(portal, source.row, 'lead_order_number');

    // --- Основная: компания, присоединённые лиды, история.
    const mainFields: BxRow = {};
    if (companyId && !main.companyId) mainFields.COMPANY_ID = companyId;
    const joinedName = fieldName(portal, 'deal', 'deal_joined_leads');
    if (joinedName && source.leadIds.length) {
        const current = refList(main.row[joinedName]);
        const merged = mergeTaskCrmBindings(
            current,
            source.leadIds.map(id => `L_${id}`),
        );
        if (merged.length !== current.length) mainFields[joinedName] = merged;
    }
    if (!alreadyJoined) {
        appendDealHistory(
            portal,
            mainFields,
            main.row,
            `Присоединена сделка #${source.id} «${short(source.title)}»` +
                (orderNumber ? ` (заявка №${orderNumber})` : ''),
        );
    }
    if (Object.keys(mainFields).length) {
        ops.push({ kind: 'dealUpdate', dealId: main.id, fields: mainFields });
    }

    // --- Лиды дубля: на основную, ответственный основной.
    let leadsRelinked = 0;
    const leadBaseName = fieldName(portal, 'lead', 'to_base_sales');
    for (const lead of snap.leads) {
        const fields: BxRow = {};
        if (leadBaseName && !refersTo(lead.row[leadBaseName], main.id)) {
            fields[leadBaseName] = formatLeadRef(
                lead.row[leadBaseName],
                main.id,
            );
        }
        if (
            main.responsibleId &&
            toId(lead.row.ASSIGNED_BY_ID) !== main.responsibleId
        ) {
            fields.ASSIGNED_BY_ID = main.responsibleId;
            setManagerOp(portal, 'lead', fields, main.responsibleId);
        }
        if (Object.keys(fields).length) {
            ops.push({ kind: 'leadUpdate', leadId: lead.id, fields });
            leadsRelinked += 1;
        }
    }

    // --- Дубль: ссылка на основную, ответственный, стадия «Дубль», история.
    const sourceFields: BxRow = {};
    const dealBaseName = fieldName(portal, 'deal', 'to_base_sales');
    if (dealBaseName && toId(source.row[dealBaseName]) !== main.id) {
        // Формат — голый id, как у ХО-сделки (DealFlowService).
        sourceFields[dealBaseName] = String(main.id);
    }
    if (companyId && !source.companyId) sourceFields.COMPANY_ID = companyId;
    if (main.responsibleId && source.responsibleId !== main.responsibleId) {
        sourceFields.ASSIGNED_BY_ID = main.responsibleId;
        setManagerOp(portal, 'deal', sourceFields, main.responsibleId);
    }
    let closesAsDuplicate = false;
    if (item.closeAsDuplicate) {
        const doubleStage = category.stages.find(
            stage => stage.code === DOUBLE_STAGE_CODE,
        );
        if (!doubleStage) {
            warnings.push(
                'Стадия «Дубль» воронки ОП не сопоставлена — сделка-дубль не закрыта',
            );
        } else {
            const stageId = `C${category.bitrixId}:${doubleStage.bitrixId}`;
            if (!source.closed && source.stageId !== stageId) {
                sourceFields.STAGE_ID = stageId;
                closesAsDuplicate = true;
            }
        }
    }
    if (!alreadyJoined) {
        appendDealHistory(
            portal,
            sourceFields,
            source.row,
            `Присоединена к основной сделке #${main.id}`,
        );
    }
    if (Object.keys(sourceFields).length) {
        ops.push({
            kind: 'dealUpdate',
            dealId: source.id,
            fields: sourceFields,
        });
    }

    if (!alreadyJoined) {
        ops.push({
            kind: 'timeline',
            dealId: main.id,
            comment: joinTimelineComment(portal, domain, source, {
                orderNumber,
                contacts: contacts.length,
                closes: closesAsDuplicate,
            }),
        });
    }

    return {
        ops,
        skipped: false,
        mainDealId: main.id,
        companyId,
        responsibleId: main.responsibleId,
        contactsLinked,
        leadsRelinked,
        closesAsDuplicate,
        warnings,
    };
}

/* ---------------------------------------------------------------------- */

/** Уже присоединена: дубль ссылается на основную либо история это помнит. */
function isJoined(
    portal: PortalModel,
    source: IJoinDealSnapshot,
    main: IJoinDealSnapshot,
): boolean {
    const baseName = fieldName(portal, 'deal', 'to_base_sales');
    if (baseName && toId(source.row[baseName]) === main.id) return true;
    const historyName = fieldName(portal, 'deal', 'op_mhistory');
    if (!historyName) return false;
    return refList(main.row[historyName]).some(line =>
        line.includes(`#${source.id} `),
    );
}

/**
 * Карточка в таймлайне основной: откуда пришла работа и что в ней было.
 * HTML, не BB-код (см. timeline.consts); переносы — `\n`, экранирование
 * под batch делает транспорт (`toTimelineComment`).
 */
function joinTimelineComment(
    portal: PortalModel,
    domain: string,
    source: IJoinDealSnapshot,
    info: { orderNumber: string; contacts: number; closes: boolean },
): string {
    const lines: string[] = [];
    lines.push(timelineBold('🔗 Присоединена сделка-дубль'));
    lines.push(
        `${timelineLink(crmCardUrl(domain, 'deal', source.id), short(source.title))} — работа переходит в эту сделку.`,
    );
    const facts: string[] = [];
    if (info.orderNumber) facts.push(`заявка №${info.orderNumber}`);
    if (info.contacts) facts.push(`контактов: ${info.contacts}`);
    if (source.leadIds.length) {
        facts.push(`лиды: ${source.leadIds.map(id => `#${id}`).join(', ')}`);
    }
    if (facts.length) lines.push(facts.join('; '));
    const phones = dealList(portal, source.row, 'op_lead_phones');
    const emails = dealList(portal, source.row, 'op_lead_emails');
    if (phones.length) lines.push(`Телефоны: ${phones.join(', ')}`);
    if (emails.length) lines.push(`Почта: ${emails.join(', ')}`);
    lines.push(
        info.closes
            ? 'Сделка-дубль закрыта стадией «Дубль».'
            : 'Сделка-дубль оставлена открытой.',
    );
    return lines.join('\n');
}

type FieldCode = keyof typeof PBX_SALES_EVENT_FIELD_CODES;

function fieldName(
    portal: PortalModel,
    entity: 'deal' | 'lead',
    code: FieldCode,
): string | null {
    const field = portal.getEntityFieldByCode(
        entity,
        PBX_SALES_EVENT_FIELD_CODES[code],
    );
    return field ? portal.getFieldBitrixId(field) : null;
}

function dealText(portal: PortalModel, row: BxRow, code: FieldCode): string {
    const name = fieldName(portal, 'deal', code);
    if (!name) return '';
    const raw = row[name];
    return typeof raw === 'string' || typeof raw === 'number'
        ? String(raw).trim()
        : '';
}

function dealList(portal: PortalModel, row: BxRow, code: FieldCode): string[] {
    const name = fieldName(portal, 'deal', code);
    return name ? refList(row[name]) : [];
}

/** Значение ссылки на сделку в лиде (`D_42423`, `42423`, массив) → указывает на id? */
function refersTo(raw: unknown, dealId: number): boolean {
    return refList(raw).some(value => toId(value) === dealId);
}

/**
 * Ссылка лида на основную в том же формате, что уже стоит в поле:
 * `D_…` — с префиксом, голое число — числом, массив — массивом.
 */
function formatLeadRef(current: unknown, dealId: number): string | string[] {
    const values = refList(current);
    const prefixed = values.some(value => /^D_/i.test(value));
    const ref = prefixed || !values.length ? `D_${dealId}` : String(dealId);
    return Array.isArray(current) ? [ref] : ref;
}

/** Множественное/строковое поле → строки; числа из `D_12`/`L_5` даёт toId. */
function refList(raw: unknown): string[] {
    if (raw == null || raw === false) return [];
    const items = Array.isArray(raw) ? raw : [raw];
    return items
        .map(value =>
            typeof value === 'string' || typeof value === 'number'
                ? String(value).trim()
                : '',
        )
        .filter(Boolean);
}

/** `D_84879` / `84879` / 84879 → 84879; мусор → null. */
export function toId(raw: unknown): number | null {
    if (typeof raw !== 'string' && typeof raw !== 'number') return null;
    const match = /(\d+)\s*$/.exec(String(raw).trim());
    const id = match ? Number(match[1]) : NaN;
    return Number.isInteger(id) && id > 0 ? id : null;
}

function short(title: string): string {
    return title.length > TITLE_LIMIT
        ? `${title.slice(0, TITLE_LIMIT - 1)}…`
        : title;
}
