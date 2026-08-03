import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    extractInnFromTitle,
    normalizeEmail,
    normalizeInn,
    normalizePhone,
    normalizeTitle,
    uniq,
} from '../lib/normalize.util';
import {
    DuplicateEntityType,
    ExtractedSignals,
    DuplicateSignalOrigin,
} from '../type/duplicate.type';
import { SignalFieldMapService } from './signal-field-map.service';

/** REST-метод чтения по типу сущности. */
const GET_METHOD: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'crm.lead.get',
    [DuplicateEntityType.CONTACT]: 'crm.contact.get',
    [DuplicateEntityType.COMPANY]: 'crm.company.get',
    [DuplicateEntityType.DEAL]: 'crm.deal.get',
};

/** Ссылка на сущность внутри обхода связей. */
interface EntityRef {
    entityType: DuplicateEntityType;
    id: number;
}

type BxEntity = Record<string, unknown>;

/**
 * Сбор сигналов (телефон / email / ИНН / название) из любой сущности CRM.
 *
 * Главное здесь — обход связей. Менеджер открывает приложение из сделки, а
 * искать дубли нужно по её компании и контакту; из лида — по самому лиду,
 * потому что компании ещё нет. Поэтому сигналы собираются не с одной
 * сущности, а с неё и её ближайших связей, а сами эти сущности попадают в
 * `excluded`: себя и своё окружение дублем считать нельзя.
 */
@Injectable()
export class DuplicateSignalExtractService {
    private readonly logger = new Logger(DuplicateSignalExtractService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly fieldMap: SignalFieldMapService,
    ) {}

    /**
     * Сигналы сущности и её связей. Ходит в Битрикс двумя батчами:
     * сама сущность → её связи. Больше одного уровня не разворачиваем —
     * дальше начинается вся база.
     */
    async extract(
        domain: string,
        entityType: DuplicateEntityType,
        entityId: number,
    ): Promise<ExtractedSignals> {
        const { bitrix } = await this.pbx.init(domain);

        const root = await this.fetchEntities(bitrix, [{ entityType, id: entityId }]);
        const rootEntity = root.get(this.refKey({ entityType, id: entityId }));
        if (!rootEntity) {
            return this.emptyResult();
        }

        const relatedRefs = this.relatedRefs(entityType, rootEntity);
        const related = relatedRefs.length
            ? await this.fetchEntities(bitrix, relatedRefs)
            : new Map<string, BxEntity>();

        const result = this.emptyResult();
        await this.collect(domain, result, entityType, entityId, rootEntity);
        for (const ref of relatedRefs) {
            const entity = related.get(this.refKey(ref));
            if (!entity) continue;
            await this.collect(domain, result, ref.entityType, ref.id, entity);
        }

        return {
            phones: uniq(result.phones),
            emails: uniq(result.emails),
            inns: uniq(result.inns),
            titles: uniq(result.titles),
            origins: result.origins,
            excluded: result.excluded,
        };
    }

    /** Сигналы из формы админки/фрейма — тот же нормализующий путь. */
    fromRaw(raw: {
        phones?: string[];
        emails?: string[];
        inns?: string[];
        titles?: string[];
    }): ExtractedSignals {
        const result = this.emptyResult();
        result.phones = uniq(
            (raw.phones ?? [])
                .map(normalizePhone)
                .filter((v): v is string => !!v),
        );
        result.emails = uniq(
            (raw.emails ?? [])
                .map(normalizeEmail)
                .filter((v): v is string => !!v),
        );
        result.inns = uniq(
            (raw.inns ?? []).map(normalizeInn).filter((v): v is string => !!v),
        );
        result.titles = uniq(
            (raw.titles ?? [])
                .map(normalizeTitle)
                .filter((v): v is string => !!v),
        );
        return result;
    }

    /* ------------------------------------------------------------------ *
     * Чтение сущностей
     * ------------------------------------------------------------------ */

    private async fetchEntities(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        refs: EntityRef[],
    ): Promise<Map<string, BxEntity>> {
        const map = new Map<string, BxEntity>();
        if (!refs.length) return map;

        for (const ref of refs) {
            bitrix.api.addCmdBatch(this.refKey(ref), GET_METHOD[ref.entityType], {
                id: ref.id,
            });
        }

        const chunks = await bitrix.api.callBatchAsync();
        for (const chunk of chunks) {
            const rows = (chunk?.result ?? {}) as Record<string, unknown>;
            for (const [cmd, value] of Object.entries(rows)) {
                if (value && typeof value === 'object') {
                    map.set(cmd, value as BxEntity);
                }
            }
        }
        return map;
    }

    /**
     * Кого ещё прочитать. Сделка ведёт к компании и контакту, лид — туда же,
     * если уже сконвертирован, контакт — к своей компании.
     */
    private relatedRefs(
        entityType: DuplicateEntityType,
        entity: BxEntity,
    ): EntityRef[] {
        const refs: EntityRef[] = [];
        const push = (type: DuplicateEntityType, raw: unknown) => {
            const id = Number(raw);
            if (Number.isFinite(id) && id > 0) {
                refs.push({ entityType: type, id });
            }
        };

        if (
            entityType === DuplicateEntityType.DEAL ||
            entityType === DuplicateEntityType.LEAD
        ) {
            push(DuplicateEntityType.COMPANY, entity.COMPANY_ID);
            push(DuplicateEntityType.CONTACT, entity.CONTACT_ID);
            const contactIds = entity.CONTACT_IDS;
            if (Array.isArray(contactIds)) {
                contactIds
                    .slice(0, 3)
                    .forEach(id => push(DuplicateEntityType.CONTACT, id));
            }
        }
        if (entityType === DuplicateEntityType.CONTACT) {
            push(DuplicateEntityType.COMPANY, entity.COMPANY_ID);
        }

        // Дубликаты ссылок (контакт указан и в CONTACT_ID, и в CONTACT_IDS).
        const seen = new Set<string>();
        return refs.filter(ref => {
            const key = this.refKey(ref);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    /* ------------------------------------------------------------------ *
     * Разбор одной сущности
     * ------------------------------------------------------------------ */

    private async collect(
        domain: string,
        acc: ExtractedSignals,
        entityType: DuplicateEntityType,
        id: number,
        entity: BxEntity,
    ): Promise<void> {
        acc.excluded.push({ entityType, id });

        const origin = (via: string): DuplicateSignalOrigin => ({
            entityType,
            id,
            via,
        });

        for (const phone of this.multifield(entity.PHONE)) {
            const normalized = normalizePhone(phone);
            if (normalized && !acc.phones.includes(normalized)) {
                acc.phones.push(normalized);
                acc.origins.push(origin('PHONE'));
            }
        }

        for (const email of this.multifield(entity.EMAIL)) {
            const normalized = normalizeEmail(email);
            if (normalized && !acc.emails.includes(normalized)) {
                acc.emails.push(normalized);
                acc.origins.push(origin('EMAIL'));
            }
        }

        // ИНН из полей, которые на этом портале признаны ИНН-полями.
        const innFields = await this.fieldMap.getInnFields(domain, entityType);
        for (const field of innFields) {
            for (const value of this.multifield(entity[field.fieldName])) {
                const normalized = normalizeInn(value);
                if (normalized && !acc.inns.includes(normalized)) {
                    acc.inns.push(normalized);
                    acc.origins.push(origin(field.fieldName));
                }
            }
        }

        // ИНН, вписанный прямо в название — частый случай у компаний и лидов.
        for (const source of ['TITLE', 'COMPANY_TITLE'] as const) {
            for (const inn of extractInnFromTitle(this.text(entity[source]))) {
                if (!acc.inns.includes(inn)) {
                    acc.inns.push(inn);
                    acc.origins.push(origin(source));
                }
            }
        }

        for (const title of this.titlesOf(entityType, entity)) {
            if (!acc.titles.includes(title)) {
                acc.titles.push(title);
                acc.origins.push(origin('TITLE'));
            }
        }
    }

    /**
     * Названия для подстрочного поиска. У сделки название («Продажа №5») к
     * контрагенту отношения не имеет — как сигнал не берём, хотя ИНН из него
     * вытащить пробуем.
     */
    private titlesOf(
        entityType: DuplicateEntityType,
        entity: BxEntity,
    ): string[] {
        const candidates: (string | null)[] = [];

        if (entityType === DuplicateEntityType.COMPANY) {
            candidates.push(this.text(entity.TITLE));
        }
        if (entityType === DuplicateEntityType.LEAD) {
            candidates.push(this.text(entity.COMPANY_TITLE));
            candidates.push(this.text(entity.TITLE));
        }
        if (entityType === DuplicateEntityType.CONTACT) {
            candidates.push(this.text(entity.COMPANY_TITLE));
        }

        return candidates
            .map(normalizeTitle)
            .filter((v): v is string => !!v);
    }

    /**
     * Множественное поле Битрикса: `[{VALUE, VALUE_TYPE}]`, но в разных
     * методах приходит и голой строкой, и массивом строк.
     */
    private multifield(raw: unknown): string[] {
        if (raw === null || raw === undefined) return [];
        const items = Array.isArray(raw) ? raw : [raw];

        return items
            .map(item => {
                if (item && typeof item === 'object') {
                    const value = (item as { VALUE?: unknown }).VALUE;
                    return value === undefined ? null : String(value);
                }
                return String(item);
            })
            .filter((v): v is string => !!v && v !== 'null');
    }

    private text(raw: unknown): string | null {
        if (raw === null || raw === undefined) return null;
        const value = String(raw).trim();
        return value || null;
    }

    private refKey(ref: EntityRef): string {
        return `${ref.entityType}_${ref.id}`;
    }

    private emptyResult(): ExtractedSignals {
        return {
            phones: [],
            emails: [],
            inns: [],
            titles: [],
            origins: [],
            excluded: [],
        };
    }
}
