import { Injectable, Logger } from '@nestjs/common';
import { AppCacheService } from '@lib/app-cache';
import { PBXService } from '@lib/pbx';
import { signalsCacheKey } from '../lib/normalize.util';
import {
    SearchCommand,
    SearchCommandMeta,
    buildSearchPlan,
} from '../lib/search-plan.builder';
import {
    DUPLICATE_ENTITY_TYPE_BY_ID,
    DuplicateEntityType,
    DuplicateRawHit,
    DuplicateSearchInput,
    DuplicateSearchLevel,
    DuplicateSearchResult,
    DuplicateSignalKind,
    DuplicateSignals,
    ExtractedSignals,
    SignalFieldRef,
    emptySignals,
} from '../type/duplicate.type';
import { DuplicateScoreService } from './duplicate-score.service';
import { DuplicateSignalExtractService } from './duplicate-signal-extract.service';
import { DUPLICATE_CACHE_APP, SignalFieldMapService } from './signal-field-map.service';

/** Битрикс режет батч по 50 команд — из этого считается цена поиска в HTTP. */
const BATCH_CHUNK = 50;

/** Короткий кэш результата: фрейм перерисовывается чаще, чем меняется база. */
const RESULT_TTL_SEC = 120;

const ALL_TYPES: DuplicateEntityType[] = [
    DuplicateEntityType.LEAD,
    DuplicateEntityType.CONTACT,
    DuplicateEntityType.COMPANY,
    DuplicateEntityType.DEAL,
];

type BxRow = Record<string, unknown>;

/**
 * Поиск дублей: сигналы → план команд → один батч → кандидаты.
 *
 * Договор по нагрузке: сколько бы значений ни пришло, поиск укладывается в
 * фиксированное число HTTP-запросов к порталу — команды копятся и уходят
 * батчем. Результат кэшируется по набору сигналов, поэтому автозапуск при
 * каждом открытии фрейма почти всегда стоит ноль запросов.
 */
@Injectable()
export class DuplicateSearchService {
    private readonly logger = new Logger(DuplicateSearchService.name);

    constructor(
        private readonly pbx: PBXService,
        private readonly cache: AppCacheService,
        private readonly fieldMap: SignalFieldMapService,
        private readonly extractor: DuplicateSignalExtractService,
        private readonly scorer: DuplicateScoreService,
    ) {}

    async search(
        domain: string,
        input: DuplicateSearchInput,
    ): Promise<DuplicateSearchResult> {
        const signals = await this.resolveSignals(domain, input);
        const level = input.level ?? DuplicateSearchLevel.FAST;
        const targetTypes = input.targetTypes?.length
            ? input.targetTypes
            : ALL_TYPES;

        const empty = this.isEmpty(signals);
        if (empty) {
            return this.result(domain, signals, [], level, false, 0, 0, [
                'Не нашлось ни одного сигнала: у сущности нет ни телефона, ни email, ни ИНН.',
            ]);
        }

        const cacheKey = `search:${level}:${signalsCacheKey(signals)}`;
        if (!input.force) {
            const cached = await this.cache.get<DuplicateSearchResult>({
                app: DUPLICATE_CACHE_APP,
                domain,
                key: cacheKey,
            });
            if (cached) return { ...cached, fromCache: true };
        }

        const innFieldsByEntity = await this.loadInnFields(domain, targetTypes);
        const commands = buildSearchPlan({
            signals,
            level,
            innFieldsByEntity,
            targetTypes,
        });

        const { bitrix } = await this.pbx.init(domain);
        const warnings: string[] = [];

        const responses = await this.runCommands(bitrix, commands);
        let requests = this.requestsFor(commands.length);

        const hits = this.parseHits(commands, responses, warnings);

        // findbycomm отдаёт голые ID — добираем названия и ответственных,
        // иначе карточка кандидата была бы «COMPANY 431» без смысла.
        const enrichCommands = this.buildEnrichCommands(hits);
        if (enrichCommands.length) {
            const enrichResponses = await this.runCommands(
                bitrix,
                enrichCommands,
            );
            requests += this.requestsFor(enrichCommands.length);
            this.applyEnrichment(enrichCommands, enrichResponses, hits);
        }

        const candidates = this.scorer.score(hits, signals.excluded ?? []);
        const result = this.result(
            domain,
            signals,
            candidates,
            level,
            false,
            commands.length + enrichCommands.length,
            requests,
            warnings,
        );

        await this.cache.set({
            app: DUPLICATE_CACHE_APP,
            domain,
            key: cacheKey,
            ttlSeconds: RESULT_TTL_SEC,
            group: 'search',
            data: result,
        });
        return result;
    }

    /* ------------------------------------------------------------------ *
     * Сигналы
     * ------------------------------------------------------------------ */

    private async resolveSignals(
        domain: string,
        input: DuplicateSearchInput,
    ): Promise<ExtractedSignals> {
        const parts: ExtractedSignals[] = [];

        if (input.entityType && input.entityId) {
            parts.push(
                await this.extractor.extract(
                    domain,
                    input.entityType,
                    input.entityId,
                ),
            );
        }
        if (input.raw) {
            parts.push(this.extractor.fromRaw(input.raw));
        }
        if (!parts.length) {
            return { ...emptySignals(), origins: [], excluded: [] };
        }

        return parts.reduce((acc, part) => ({
            phones: [...new Set([...acc.phones, ...part.phones])],
            emails: [...new Set([...acc.emails, ...part.emails])],
            inns: [...new Set([...acc.inns, ...part.inns])],
            titles: [...new Set([...acc.titles, ...part.titles])],
            origins: [...acc.origins, ...part.origins],
            excluded: [...acc.excluded, ...part.excluded],
        }));
    }

    private isEmpty(signals: DuplicateSignals): boolean {
        return (
            !signals.phones.length &&
            !signals.emails.length &&
            !signals.inns.length &&
            !signals.titles.length
        );
    }

    private async loadInnFields(
        domain: string,
        targetTypes: DuplicateEntityType[],
    ): Promise<Map<DuplicateEntityType, SignalFieldRef[]>> {
        const map = new Map<DuplicateEntityType, SignalFieldRef[]>();
        for (const entityType of targetTypes) {
            map.set(
                entityType,
                await this.fieldMap.getInnFields(domain, entityType),
            );
        }
        return map;
    }

    /* ------------------------------------------------------------------ *
     * Исполнение батча
     * ------------------------------------------------------------------ */

    private async runCommands(
        bitrix: Awaited<ReturnType<PBXService['init']>>['bitrix'],
        commands: SearchCommand[],
    ): Promise<Map<string, unknown>> {
        const byCmd = new Map<string, unknown>();
        if (!commands.length) return byCmd;

        for (const command of commands) {
            bitrix.api.addCmdBatch(command.cmd, command.method, command.params);
        }

        const chunks = await bitrix.api.callBatchAsync();
        for (const chunk of chunks) {
            const rows = (chunk?.result ?? {}) as Record<string, unknown>;
            for (const [cmd, value] of Object.entries(rows)) {
                byCmd.set(cmd, value);
            }
        }
        return byCmd;
    }

    private requestsFor(commandCount: number): number {
        return Math.ceil(commandCount / BATCH_CHUNK);
    }

    /* ------------------------------------------------------------------ *
     * Разбор ответов
     * ------------------------------------------------------------------ */

    private parseHits(
        commands: SearchCommand[],
        responses: Map<string, unknown>,
        warnings: string[],
    ): DuplicateRawHit[] {
        const hits: DuplicateRawHit[] = [];

        for (const command of commands) {
            const raw = responses.get(command.cmd);
            if (raw === undefined) {
                warnings.push(`Команда ${command.method} не вернула результат`);
                continue;
            }
            hits.push(...this.parseOne(command.meta, raw));
        }
        return hits;
    }

    private parseOne(meta: SearchCommandMeta, raw: unknown): DuplicateRawHit[] {
        const value = meta.values.join(',');

        if (meta.shape === 'findbycomm') {
            const byType = (raw ?? {}) as Record<string, unknown>;
            const hits: DuplicateRawHit[] = [];
            for (const entityType of [
                DuplicateEntityType.LEAD,
                DuplicateEntityType.CONTACT,
                DuplicateEntityType.COMPANY,
            ]) {
                const ids = byType[entityType];
                if (!Array.isArray(ids)) continue;
                for (const id of ids) {
                    const numericId = Number(id);
                    if (!Number.isFinite(numericId)) continue;
                    hits.push({
                        entityType,
                        id: numericId,
                        kind: meta.kind,
                        via: meta.via,
                        value,
                    });
                }
            }
            return hits;
        }

        if (meta.shape === 'requisiteList') {
            const hits: DuplicateRawHit[] = [];
            for (const row of this.rowsOf(raw)) {
                const entityType =
                    DUPLICATE_ENTITY_TYPE_BY_ID[Number(row.ENTITY_TYPE_ID)];
                const id = Number(row.ENTITY_ID);
                if (!entityType || !Number.isFinite(id)) continue;
                hits.push({
                    entityType,
                    id,
                    kind: DuplicateSignalKind.INN,
                    via: meta.via,
                    value: String(row.RQ_INN ?? value),
                });
            }
            return hits;
        }

        const entityType = meta.entityType;
        if (!entityType) return [];

        const hits: DuplicateRawHit[] = [];
        for (const row of this.rowsOf(raw)) {
            const id = Number(row.ID);
            if (!Number.isFinite(id)) continue;
            hits.push({
                entityType,
                id,
                kind: meta.kind,
                via: meta.via,
                value,
                title: this.titleOf(entityType, row),
                assignedById: this.numberOrUndefined(row.ASSIGNED_BY_ID),
            });
        }
        return hits;
    }

    /**
     * `crm.*.list` в батче отдаёт либо массив, либо `{items|result: []}` —
     * зависит от метода и версии. Терпим оба варианта.
     */
    private rowsOf(raw: unknown): BxRow[] {
        if (Array.isArray(raw)) return raw as BxRow[];
        if (raw && typeof raw === 'object') {
            const container = raw as { items?: unknown; result?: unknown };
            if (Array.isArray(container.items)) return container.items as BxRow[];
            if (Array.isArray(container.result)) {
                return container.result as BxRow[];
            }
        }
        return [];
    }

    /* ------------------------------------------------------------------ *
     * Обогащение findbycomm-попаданий
     * ------------------------------------------------------------------ */

    private buildEnrichCommands(hits: DuplicateRawHit[]): SearchCommand[] {
        const missing = new Map<DuplicateEntityType, Set<number>>();
        for (const hit of hits) {
            if (hit.title) continue;
            const ids = missing.get(hit.entityType) ?? new Set<number>();
            ids.add(hit.id);
            missing.set(hit.entityType, ids);
        }

        const methods: Record<DuplicateEntityType, string> = {
            [DuplicateEntityType.LEAD]: 'crm.lead.list',
            [DuplicateEntityType.CONTACT]: 'crm.contact.list',
            [DuplicateEntityType.COMPANY]: 'crm.company.list',
            [DuplicateEntityType.DEAL]: 'crm.deal.list',
        };
        const selects: Record<DuplicateEntityType, string[]> = {
            [DuplicateEntityType.LEAD]: ['ID', 'TITLE', 'ASSIGNED_BY_ID'],
            [DuplicateEntityType.CONTACT]: [
                'ID',
                'NAME',
                'LAST_NAME',
                'SECOND_NAME',
                'ASSIGNED_BY_ID',
            ],
            [DuplicateEntityType.COMPANY]: ['ID', 'TITLE', 'ASSIGNED_BY_ID'],
            [DuplicateEntityType.DEAL]: ['ID', 'TITLE', 'ASSIGNED_BY_ID'],
        };

        let seq = 0;
        return [...missing.entries()].map(([entityType, ids]) => ({
            cmd: `e${seq++}`,
            method: methods[entityType],
            params: {
                filter: { ID: [...ids] },
                select: selects[entityType],
                start: -1,
            },
            meta: {
                shape: 'entityList' as const,
                kind: DuplicateSignalKind.PHONE,
                entityType,
                via: 'enrich',
                values: [],
            },
        }));
    }

    private applyEnrichment(
        commands: SearchCommand[],
        responses: Map<string, unknown>,
        hits: DuplicateRawHit[],
    ): void {
        const titles = new Map<string, { title?: string; assigned?: number }>();

        for (const command of commands) {
            const entityType = command.meta.entityType;
            if (!entityType) continue;
            for (const row of this.rowsOf(responses.get(command.cmd))) {
                const id = Number(row.ID);
                if (!Number.isFinite(id)) continue;
                titles.set(`${entityType}_${id}`, {
                    title: this.titleOf(entityType, row),
                    assigned: this.numberOrUndefined(row.ASSIGNED_BY_ID),
                });
            }
        }

        for (const hit of hits) {
            const found = titles.get(`${hit.entityType}_${hit.id}`);
            if (!found) continue;
            hit.title = hit.title ?? found.title;
            hit.assignedById = hit.assignedById ?? found.assigned;
        }
    }

    private titleOf(
        entityType: DuplicateEntityType,
        row: BxRow,
    ): string | undefined {
        if (entityType === DuplicateEntityType.CONTACT) {
            const name = [row.LAST_NAME, row.NAME, row.SECOND_NAME]
                .map(part => (part ? String(part).trim() : ''))
                .filter(Boolean)
                .join(' ');
            return name || undefined;
        }
        const title = row.TITLE ? String(row.TITLE).trim() : '';
        return title || undefined;
    }

    private numberOrUndefined(raw: unknown): number | undefined {
        const value = Number(raw);
        return Number.isFinite(value) && value > 0 ? value : undefined;
    }

    private result(
        domain: string,
        signals: ExtractedSignals,
        candidates: DuplicateSearchResult['candidates'],
        level: DuplicateSearchLevel,
        fromCache: boolean,
        batchCommands: number,
        batchRequests: number,
        warnings: string[],
    ): DuplicateSearchResult {
        return {
            domain,
            signals: {
                phones: signals.phones,
                emails: signals.emails,
                inns: signals.inns,
                titles: signals.titles,
            },
            origins: signals.origins ?? [],
            candidates,
            level,
            fromCache,
            batchCommands,
            batchRequests,
            warnings,
        };
    }
}
