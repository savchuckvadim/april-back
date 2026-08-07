import { Injectable, Logger } from '@nestjs/common';
import { PBXService } from '@lib/pbx';
import {
    extractInnFromTitle,
    normalizeEmail,
    normalizeInn,
    normalizeInnList,
    normalizePhone,
    normalizeTitle,
    uniq,
} from '../lib/normalize.util';
import { resolveDuplicateDealCategories } from '../lib/deal-category.filter';
import {
    DuplicateEntityType,
    DuplicateSearchLevel,
    DuplicateSignalOrigin,
    ExtractedSignals,
    SOURCE_GRAPH_LIMITS_DEEP,
    SOURCE_GRAPH_LIMITS_FAST,
} from '../type/duplicate.type';
import { SignalFieldMapService } from './signal-field-map.service';
import {
    BxGraphRow,
    DuplicateSourceGraphService,
} from './duplicate-source-graph.service';

type BxEntity = Record<string, unknown>;

/**
 * Сбор сигналов (телефон / email / ИНН / название) из сущности и её ГРАФА.
 *
 * Связанные с источником контакты/компании/реквизиты и даже их сделки наших
 * воронок — не дубли, а источник сигналов: ИНН из реквизита контакта лида
 * может оказаться в названии компании-дубля. Обход делает
 * DuplicateSourceGraphService (одна волна = один HTTP), весь граф уходит в
 * `excluded` — себя и своё окружение дублем считать нельзя.
 */
@Injectable()
export class DuplicateSignalExtractService {
    private readonly logger = new Logger(DuplicateSignalExtractService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly fieldMap: SignalFieldMapService,
        private readonly sourceGraph: DuplicateSourceGraphService,
    ) {}

    /**
     * Сигналы сущности и её графа. Глубина обхода зависит от уровня поиска:
     * FAST — 2 волны (источник + связи), DEEP — 3 (+ окружение сделок).
     */
    async extract(
        domain: string,
        entityType: DuplicateEntityType,
        entityId: number,
        level: DuplicateSearchLevel = DuplicateSearchLevel.FAST,
    ): Promise<ExtractedSignals> {
        const { bitrix, PortalModel: portalModel } =
            await this.pbx.init(domain);

        const categories = resolveDuplicateDealCategories(portalModel);
        const limits =
            level >= DuplicateSearchLevel.DEEP
                ? SOURCE_GRAPH_LIMITS_DEEP
                : SOURCE_GRAPH_LIMITS_FAST;

        const graph = await this.sourceGraph.collect(
            bitrix,
            { entityType, id: entityId },
            limits,
            categories.allowedBitrixIds,
        );

        const result = this.emptyResult();
        result.warnings.push(...categories.warnings, ...graph.warnings);
        result.excluded.push(...graph.excluded);

        for (const node of graph.nodes) {
            await this.collect(
                domain,
                result,
                node.entityType,
                node.id,
                node.entity,
            );
        }
        for (const row of graph.requisiteRows) {
            await this.collectRequisiteRow(domain, result, row);
        }

        return {
            phones: uniq(result.phones),
            emails: uniq(result.emails),
            inns: uniq(result.inns),
            titles: uniq(result.titles),
            origins: result.origins,
            excluded: result.excluded,
            warnings: result.warnings,
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
        // flatMap + normalizeInnList: менеджер мог вставить в форму сразу
        // несколько ИНН через запятую — раньше терялись все.
        result.inns = uniq((raw.inns ?? []).flatMap(normalizeInnList));
        result.titles = uniq(
            (raw.titles ?? [])
                .map(normalizeTitle)
                .filter((v): v is string => !!v),
        );
        return result;
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
        // normalizeInnList: легаси-поля хранят списки «через запятую» —
        // одиночный normalizeInn молча терял все значения такой строки.
        const innFields = await this.fieldMap.getInnEntityFields(
            domain,
            entityType,
        );
        for (const field of innFields) {
            for (const value of this.multifield(entity[field.fieldName])) {
                for (const normalized of normalizeInnList(value)) {
                    if (!acc.inns.includes(normalized)) {
                        acc.inns.push(normalized);
                        acc.origins.push(origin(field.fieldName));
                    }
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
     * Строка реквизита узла графа: ИНН (RQ_INN + UF-поля реквизитов),
     * название компании из реквизита — источник и для подстрочного поиска.
     */
    private async collectRequisiteRow(
        domain: string,
        acc: ExtractedSignals,
        row: BxGraphRow,
    ): Promise<void> {
        const ownerType = row.ENTITY_TYPE_ID;
        const ownerId = Number(row.ENTITY_ID);
        const origin = (via: string): DuplicateSignalOrigin => ({
            entityType: DuplicateEntityType.COMPANY,
            id: Number.isFinite(ownerId) ? ownerId : 0,
            via: `${via}@requisite:${this.text(row.ID) ?? '?'}:${this.text(ownerType) ?? '?'}`,
        });

        const innFields = await this.fieldMap.getInnRequisiteFields(domain);
        for (const field of innFields) {
            const normalized = normalizeInn(
                this.text(row[field.fieldName]) ?? '',
            );
            if (normalized && !acc.inns.includes(normalized)) {
                acc.inns.push(normalized);
                acc.origins.push(origin(field.fieldName));
            }
        }

        for (const source of [
            'RQ_COMPANY_NAME',
            'RQ_COMPANY_FULL_NAME',
        ] as const) {
            const title = normalizeTitle(this.text(row[source]));
            if (title && !acc.titles.includes(title)) {
                acc.titles.push(title);
                acc.origins.push(origin(source));
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

        return candidates.map(normalizeTitle).filter((v): v is string => !!v);
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
                    return this.text((item as { VALUE?: unknown }).VALUE);
                }
                return this.text(item);
            })
            .filter((v): v is string => !!v && v !== 'null');
    }

    /** Скаляр → строка; объекты не сериализуем (защита от '[object Object]'). */
    private text(raw: unknown): string | null {
        if (raw === null || raw === undefined) return null;
        if (typeof raw === 'string') {
            const value = raw.trim();
            return value || null;
        }
        if (typeof raw === 'number' || typeof raw === 'bigint') {
            return String(raw);
        }
        return null;
    }

    private emptyResult(): ExtractedSignals & { warnings: string[] } {
        return {
            phones: [],
            emails: [],
            inns: [],
            titles: [],
            origins: [],
            excluded: [],
            warnings: [],
        };
    }
}
