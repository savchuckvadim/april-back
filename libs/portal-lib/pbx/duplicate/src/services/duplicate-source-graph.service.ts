import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    DUPLICATE_ENTITY_TYPE_BY_ID,
    DuplicateEntityType,
    SourceGraphLimits,
} from '../type/duplicate.type';

/** Строка ответа Битрикса. */
export type BxGraphRow = Record<string, unknown>;

/** Ссылка на узел графа. */
export interface SourceGraphRef {
    entityType: DuplicateEntityType;
    id: number;
}

/** Узел графа: сущность + как до неё дошли. */
export interface SourceGraphNode extends SourceGraphRef {
    depth: number;
    entity: BxGraphRow;
}

/** Итог обхода. */
export interface SourceGraphResult {
    nodes: SourceGraphNode[];
    /** Строки реквизитов узлов (ENTITY_TYPE_ID/ENTITY_ID сматчены на узлы). */
    requisiteRows: BxGraphRow[];
    /** ВСЕ узлы графа — они не дубли, а окружение источника. */
    excluded: SourceGraphRef[];
    warnings: string[];
    /** Сколько HTTP-запросов ушло (число волн = число callBatchAsync). */
    httpRequests: number;
}

const GET_METHOD: Record<DuplicateEntityType, string> = {
    [DuplicateEntityType.LEAD]: 'crm.lead.get',
    [DuplicateEntityType.CONTACT]: 'crm.contact.get',
    [DuplicateEntityType.COMPANY]: 'crm.company.get',
    [DuplicateEntityType.DEAL]: 'crm.deal.get',
};

/**
 * Select зеркальных сделок: минимум для сигналов + идентификация.
 * `UF_*` — чтобы увидеть наши поля графа (`deal_from_lead_id`,
 * `deal_joined_leads`): их лиды тоже часть работы, а не дубли.
 */
const MIRROR_DEAL_SELECT = [
    'ID',
    'TITLE',
    'COMPANY_ID',
    'CONTACT_ID',
    'LEAD_ID',
    'CATEGORY_ID',
    'STAGE_ID',
    'UF_*',
];

const REQUISITE_SELECT = [
    'ID',
    'ENTITY_TYPE_ID',
    'ENTITY_ID',
    'RQ_INN',
    'RQ_COMPANY_NAME',
    'RQ_COMPANY_FULL_NAME',
    'NAME',
];

/**
 * Ограниченный BFS по графу связей источника.
 *
 * Зачем: связанные с лидом контакты/компании/реквизиты — НЕ дубли, а
 * ИСТОЧНИК сигналов (ИНН из реквизита контакта лида может лежать в названии
 * компании-дубля). Обход зеркальный: вниз (лид → контакты/компания) и вверх
 * (компания → её сделки НАШИХ воронок).
 *
 * Инвариант стоимости: одна волна = один HTTP-batch (все команды волны
 * независимы). Число HTTP = maxDepth, а не число узлов.
 *
 * Инстанс bitrix приходит параметром (per-domain), в полях не хранится.
 */
@Injectable()
export class DuplicateSourceGraphService {
    private readonly logger = new Logger(DuplicateSourceGraphService.name);

    async collect(
        bitrix: BitrixService,
        root: SourceGraphRef,
        limits: SourceGraphLimits,
        /** CATEGORY_ID наших воронок; пусто — зеркальные сделки не читаются. */
        dealCategoryBitrixIds: number[],
    ): Promise<SourceGraphResult> {
        const result: SourceGraphResult = {
            nodes: [],
            requisiteRows: [],
            excluded: [],
            warnings: [],
            httpRequests: 0,
        };
        const visited = new Set<string>();
        const perType = new Map<DuplicateEntityType, number>();

        let frontier: SourceGraphRef[] = [root];

        for (let depth = 0; depth < limits.maxDepth; depth++) {
            const wave = frontier.filter(ref =>
                this.admit(ref, visited, perType, result, limits),
            );
            if (!wave.length) break;

            const { rows, requisites, mirrors } = await this.runWave(
                bitrix,
                wave,
                depth,
                dealCategoryBitrixIds,
                limits,
                result,
            );
            result.httpRequests += 1;

            const nextFrontier: SourceGraphRef[] = [];
            for (const ref of wave) {
                const entity = rows.get(this.key(ref));
                if (!entity) continue;
                result.nodes.push({ ...ref, depth, entity });
                nextFrontier.push(...this.edgesOf(ref, entity));
            }
            result.requisiteRows.push(...requisites);

            // Зеркальные сделки — узлы графа (окружение, не дубли), но их
            // собственные связи разворачиваем только на следующей волне DEEP.
            for (const dealRow of mirrors) {
                const id = Number(dealRow.ID);
                if (!Number.isFinite(id) || id <= 0) continue;
                const ref: SourceGraphRef = {
                    entityType: DuplicateEntityType.DEAL,
                    id,
                };
                if (!this.admit(ref, visited, perType, result, limits)) {
                    continue;
                }
                result.nodes.push({
                    ...ref,
                    depth: depth + 1,
                    entity: dealRow,
                });
                nextFrontier.push(...this.edgesOf(ref, dealRow));
            }

            frontier = nextFrontier;
        }

        return result;
    }

    /* ------------------------------------------------------------------ *
     * Волна: get узлов + связи + реквизиты + зеркальные сделки — один batch
     * ------------------------------------------------------------------ */

    private async runWave(
        bitrix: BitrixService,
        wave: SourceGraphRef[],
        depth: number,
        dealCategoryBitrixIds: number[],
        limits: SourceGraphLimits,
        result: SourceGraphResult,
    ): Promise<{
        rows: Map<string, BxGraphRow>;
        requisites: BxGraphRow[];
        mirrors: BxGraphRow[];
    }> {
        let commands = 0;
        const budget = () => commands < limits.maxCommandsPerWave;
        const overBudget: string[] = [];

        for (const ref of wave) {
            if (!budget()) {
                overBudget.push(this.key(ref));
                continue;
            }
            bitrix.api.addCmdBatch(this.key(ref), GET_METHOD[ref.entityType], {
                id: ref.id,
            });
            commands++;
        }

        // Реквизиты владельцев (контакт/компания/лид) — ОДНА команда на волну.
        // Фильтр только по ENTITY_ID: пара ENTITY_TYPE_ID+ENTITY_ID дала бы
        // декартово IN×IN (реквизит контакта №5 при запросе компании №5) —
        // пары матчим на своей стороне в matchRequisites().
        const requisiteOwnerIds = wave
            .filter(ref => ref.entityType !== DuplicateEntityType.DEAL)
            .map(ref => ref.id);
        if (requisiteOwnerIds.length && budget()) {
            bitrix.batch.requisite.getList(
                `rq_wave_${depth}`,
                { ENTITY_ID: requisiteOwnerIds } as never,
                REQUISITE_SELECT,
            );
            commands++;
        }

        // Зеркальные сделки НАШИХ воронок по компаниям/контактам/лидам волны.
        const mirrorFilters: [string, number[]][] = [
            [
                'COMPANY_ID',
                wave
                    .filter(
                        ref => ref.entityType === DuplicateEntityType.COMPANY,
                    )
                    .map(ref => ref.id),
            ],
            [
                'CONTACT_ID',
                wave
                    .filter(
                        ref => ref.entityType === DuplicateEntityType.CONTACT,
                    )
                    .map(ref => ref.id),
            ],
            [
                'LEAD_ID',
                wave
                    .filter(ref => ref.entityType === DuplicateEntityType.LEAD)
                    .map(ref => ref.id),
            ],
        ];
        for (const [field, ids] of mirrorFilters) {
            if (!ids.length || !dealCategoryBitrixIds.length) continue;
            if (!budget()) {
                overBudget.push(`mirror_${field}`);
                continue;
            }
            bitrix.api.addCmdBatch(
                `mirror_${field}_${depth}`,
                'crm.deal.list',
                {
                    filter: {
                        [field]: ids,
                        CATEGORY_ID: dealCategoryBitrixIds,
                    },
                    select: MIRROR_DEAL_SELECT,
                    start: -1,
                },
            );
            commands++;
        }

        if (overBudget.length) {
            result.warnings.push(
                `Бюджет волны ${depth} исчерпан (${limits.maxCommandsPerWave} команд) — пропущено: ${overBudget.join(', ')}`,
            );
        }

        const responses = await bitrix.api.callBatchAsync();
        const rows = new Map<string, BxGraphRow>();
        const requisites: BxGraphRow[] = [];
        const mirrors: BxGraphRow[] = [];

        for (const chunk of responses) {
            const byCmd = (chunk?.result ?? {}) as Record<string, unknown>;
            for (const [cmd, value] of Object.entries(byCmd)) {
                if (cmd.startsWith('rq_wave_')) {
                    requisites.push(
                        ...this.matchRequisites(this.rowsOf(value), wave),
                    );
                } else if (cmd.startsWith('mirror_')) {
                    mirrors.push(...this.rowsOf(value));
                } else if (value && typeof value === 'object') {
                    rows.set(cmd, value as BxGraphRow);
                }
            }
        }
        return { rows, requisites, mirrors };
    }

    /** Пары (ENTITY_TYPE_ID, ENTITY_ID) матчим против узлов волны. */
    private matchRequisites(
        rows: BxGraphRow[],
        wave: SourceGraphRef[],
    ): BxGraphRow[] {
        const waveKeys = new Set(wave.map(ref => this.key(ref)));
        return rows.filter(row => {
            const entityType =
                DUPLICATE_ENTITY_TYPE_BY_ID[Number(row.ENTITY_TYPE_ID)];
            const id = Number(row.ENTITY_ID);
            if (!entityType || !Number.isFinite(id)) return false;
            return waveKeys.has(this.key({ entityType, id }));
        });
    }

    /** Рёбра «вниз»: связи сущности, которые становятся следующей волной. */
    private edgesOf(ref: SourceGraphRef, entity: BxGraphRow): SourceGraphRef[] {
        const refs: SourceGraphRef[] = [];
        const push = (entityType: DuplicateEntityType, raw: unknown) => {
            const id = Number(raw);
            if (Number.isFinite(id) && id > 0) refs.push({ entityType, id });
        };

        if (
            ref.entityType === DuplicateEntityType.DEAL ||
            ref.entityType === DuplicateEntityType.LEAD
        ) {
            push(DuplicateEntityType.COMPANY, entity.COMPANY_ID);
            push(DuplicateEntityType.CONTACT, entity.CONTACT_ID);
            const contactIds = entity.CONTACT_IDS;
            if (Array.isArray(contactIds)) {
                contactIds.forEach(id => push(DuplicateEntityType.CONTACT, id));
            }
        }
        /*
         * Сделка → её ЛИДЫ. Без этого ребра лид-первоисточник не попадает в
         * граф источника, а значит и в excluded — и всплывает в результатах
         * как «дубль» самого себя (он же и есть эта работа, а не другая).
         * Источники: штатный LEAD_ID конвертации + наши поля графа
         * (`deal_from_lead_id`, `deal_joined_leads`), значения которых
         * бывают и `L_123`, и голым id — разбираем оба вида.
         */
        if (ref.entityType === DuplicateEntityType.DEAL) {
            for (const value of this.leadRefsOf(entity)) {
                push(DuplicateEntityType.LEAD, value);
            }
        }
        if (ref.entityType === DuplicateEntityType.CONTACT) {
            push(DuplicateEntityType.COMPANY, entity.COMPANY_ID);
        }
        return refs;
    }

    /**
     * Идентификаторы лидов сделки из всех известных источников связи.
     * UF-имена полей графа заранее неизвестны (у каждого портала свои),
     * поэтому берём их из строки сделки по суффиксу кода — это надёжнее,
     * чем тащить PortalModel в чистый обходчик графа.
     */
    private leadRefsOf(entity: BxGraphRow): number[] {
        const ids: number[] = [];
        const collect = (raw: unknown): void => {
            const values = Array.isArray(raw) ? raw : [raw];
            for (const value of values) {
                if (typeof value !== 'string' && typeof value !== 'number') {
                    continue;
                }
                const match = /^(?:L_)?(\d+)$/.exec(String(value).trim());
                if (match) ids.push(Number(match[1]));
            }
        };

        collect(entity.LEAD_ID);
        for (const [key, value] of Object.entries(entity)) {
            if (!key.startsWith('UF_CRM_')) continue;
            const code = key.toUpperCase();
            if (
                code.endsWith('DEAL_FROM_LEAD_ID') ||
                code.endsWith('DEAL_JOINED_LEADS')
            ) {
                collect(value);
            }
        }
        return ids;
    }

    /** Пропуск узла в граф с учётом visited/квот; учитывает его в excluded. */
    private admit(
        ref: SourceGraphRef,
        visited: Set<string>,
        perType: Map<DuplicateEntityType, number>,
        result: SourceGraphResult,
        limits: SourceGraphLimits,
    ): boolean {
        const key = this.key(ref);
        if (visited.has(key)) return false;

        if (visited.size >= limits.maxNodes) {
            result.warnings.push(
                `Бюджет графа исчерпан (${limits.maxNodes} узлов) — обход остановлен`,
            );
            return false;
        }
        const typeCount = perType.get(ref.entityType) ?? 0;
        const quota = limits.quotas[ref.entityType];
        if (quota !== undefined && typeCount >= quota) return false;

        visited.add(key);
        perType.set(ref.entityType, typeCount + 1);
        // В excluded попадает ВЕСЬ граф, даже если сущность не прочиталась:
        // окружение источника не должно всплыть как «дубль».
        result.excluded.push(ref);
        return true;
    }

    private rowsOf(raw: unknown): BxGraphRow[] {
        if (Array.isArray(raw)) return raw as BxGraphRow[];
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items))
                return container.items as BxGraphRow[];
            if (Array.isArray(container.result))
                return container.result as BxGraphRow[];
        }
        return [];
    }

    private key(ref: SourceGraphRef): string {
        return `${ref.entityType}_${ref.id}`;
    }
}
