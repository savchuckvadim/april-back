import { Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as path from 'node:path';
import { BitrixService } from '@lib/bitrix';
import { PortalModel } from '@lib/portal-lib/portal/services/portal.model';
import {
    buildSkapItemDedupKey,
    buildSkapXmlId,
    normalizeSkapLogin,
    SkapSmartInfo,
} from '@lib/portal-lib/pbx/pbx-skap-smart';
import {
    computeSkapEvents,
    detectSkapFileKind,
    emptySkapFileStats,
    formatSkapPeriodCode,
    parseSkapPeriod,
    SkapDetailRow,
    SkapEventHistoryRow,
    SkapFileParseService,
    SkapFileStats,
    SkapFormatError,
    SkapItemRepository,
    SkapOnlineRow,
    SkapParsedAnyFile,
    SkapPrimeLentRow,
    SkapSessionRepository,
    SkapSmartWriterService,
    SkapSubscriptionInput,
    SkapSubscriptionRepository,
} from '@lib/skap-lib';
import { SkapImportFile } from 'generated/prisma';
import { SkapCompanyMatchService } from '../match/skap-company-match.service';
import { SkapDealMatchService } from '../match/skap-deal-match.service';

/** Репозитории БД, передаваемые в per-domain флоу из use-case. */
export interface SkapFileImportServices {
    itemRepo: SkapItemRepository;
    sessionRepo: SkapSessionRepository;
    subscriptionRepo: SkapSubscriptionRepository;
}

/** Снапшот обогащения клиента из Prime_lent за месяц. */
interface SkapEnrichmentEntry {
    complectNames: Map<string, string>;
    city: string | null;
    region: string | null;
    managerName: string | null;
    activeMailings: number;
}

/** Контекст одного прогона (домен + лимиты + инфраструктура). */
export interface SkapImportContext {
    domain: string;
    portalId: bigint;
    /** Абсолютный дедлайн тайм-бюджета (мс epoch). */
    deadlineAt: number;
    /** Месяцы старше cutoff не импортируются (null — без лимита). */
    historyCutoff: Date | null;
    smartInfo: SkapSmartInfo;
}

/** Превышен тайм-бюджет — файл возвращается в pending. */
export class SkapTimeBudgetExceeded extends Error {
    constructor() {
        super('Тайм-бюджет прогона исчерпан');
        this.name = 'SkapTimeBudgetExceeded';
    }
}

interface ParsedEntry {
    parsed: SkapParsedAnyFile;
    period: Date;
    sourceFile: string;
}

/**
 * Импорт одного файла с Диска (zip или одиночный csv/txt): распаковка,
 * формат-гвард, матчинг компаний/сделок/контактов, upsert элементов
 * смарта, сессии и подписки в БД, детализация в таймлайн.
 *
 * НЕ @Injectable: создаётся на прогон под конкретный домен
 * (`new SkapFileImportFlow(bitrix, portalModel, ctx, services)`).
 */
export class SkapFileImportFlow {
    private readonly logger = new Logger(SkapFileImportFlow.name);
    private readonly writer: SkapSmartWriterService;
    private readonly companyMatch: SkapCompanyMatchService;
    private readonly dealMatch: SkapDealMatchService;
    /** Кэш истории клиента для событий месяца (в рамках одного файла). */
    private readonly historyCache = new Map<string, SkapEventHistoryRow[]>();

    constructor(
        bitrix: BitrixService,
        portalModel: PortalModel,
        private readonly ctx: SkapImportContext,
        private readonly services: SkapFileImportServices,
        private readonly parser: SkapFileParseService,
    ) {
        this.writer = new SkapSmartWriterService(bitrix, ctx.smartInfo);
        this.companyMatch = new SkapCompanyMatchService(bitrix);
        this.dealMatch = new SkapDealMatchService(bitrix, portalModel);
    }

    /** Обработка файла журнала; возвращает счётчики + версию формата. */
    async processFile(
        file: SkapImportFile,
        buffer: Buffer,
    ): Promise<{ stats: SkapFileStats; formatVersion: string | null }> {
        const stats = emptySkapFileStats();
        const entries = this.extractEntries(file, buffer, stats);
        if (!entries.length) {
            throw new SkapFormatError(
                null,
                `В файле «${file.fileName}» нет распознанных выгрузок СКАП ` +
                    '(Online / Online_detail / Prime_lent) с определимым месяцем',
            );
        }

        // Порядок внутри файла: справочник → элементы → сессии.
        const order = { prime_lent: 0, online: 1, online_detail: 2 } as const;
        entries.sort((a, b) => order[a.parsed.kind] - order[b.parsed.kind]);

        for (const entry of entries) {
            this.assertBudget();
            stats.rowsParsed += entry.parsed.rows.length;
            for (const warning of entry.parsed.warnings) {
                stats.warnings.push(`${entry.sourceFile}: ${warning.message}`);
            }
            switch (entry.parsed.kind) {
                case 'prime_lent':
                    await this.importPrimeLent(file, entry, stats);
                    break;
                case 'online':
                    await this.importOnline(file, entry, stats);
                    break;
                case 'online_detail':
                    await this.importDetail(file, entry, stats);
                    break;
            }
        }
        return {
            stats,
            formatVersion: entries
                .map(entry => entry.parsed.formatVersion)
                .join(','),
        };
    }

    // -----------------------------------------------------------------
    // Распаковка и определение месяца
    // -----------------------------------------------------------------

    private extractEntries(
        file: SkapImportFile,
        buffer: Buffer,
        stats: SkapFileStats,
    ): ParsedEntry[] {
        const isZip = path.extname(file.fileName).toLowerCase() === '.zip';
        const raw: { name: string; content: Buffer }[] = isZip
            ? new AdmZip(buffer)
                  .getEntries()
                  .filter(entry => !entry.isDirectory)
                  .map(entry => ({
                      name: entry.entryName.split('\\').join('/'),
                      content: entry.getData(),
                  }))
            : [{ name: file.fileName, content: buffer }];

        const entries: ParsedEntry[] = [];
        for (const item of raw) {
            const kind = detectSkapFileKind(path.basename(item.name));
            if (!kind) continue;
            const period = this.resolvePeriod(item.name);
            if (!period) {
                stats.warnings.push(
                    `${item.name}: отчётный месяц не определён по пути/имени — пропущено (error_no_period)`,
                );
                continue;
            }
            if (this.ctx.historyCutoff && period < this.ctx.historyCutoff) {
                stats.itemsSkippedTooOld += 1;
                continue;
            }
            try {
                entries.push({
                    parsed: this.parser.parseCsvBuffer(
                        item.content,
                        path.basename(item.name),
                    ),
                    period,
                    sourceFile: item.name,
                });
            } catch (error) {
                if (error instanceof SkapFormatError) throw error;
                stats.warnings.push(
                    `${item.name}: не распарсен — ${(error as Error).message}`,
                );
            }
        }
        return entries;
    }

    /** Месяц: сегменты пути (папка «август 2024») → имя файла. */
    private resolvePeriod(entryPath: string): Date | null {
        const segments = entryPath.split('/');
        for (let i = segments.length - 1; i >= 0; i--) {
            const period = parseSkapPeriod(segments[i]);
            if (period) return period;
        }
        return null;
    }

    // -----------------------------------------------------------------
    // Prime_lent → подписки в БД
    // -----------------------------------------------------------------

    private async importPrimeLent(
        file: SkapImportFile,
        entry: ParsedEntry,
        stats: SkapFileStats,
    ): Promise<void> {
        const rows = entry.parsed.rows as SkapPrimeLentRow[];
        const periodCode = formatSkapPeriodCode(entry.period);
        const inputs: SkapSubscriptionInput[] = rows.map(row => ({
            portalId: this.ctx.portalId,
            domain: this.ctx.domain,
            dedupKey:
                `${this.ctx.domain}:${row.clientCard}:${row.complectArmId}:` +
                `${normalizeSkapLogin(row.mailingEmail || '-')}:${periodCode}`,
            clientCard: row.clientCard,
            regList: row.regList,
            complectArmId: row.complectArmId,
            complectName: row.complectName || null,
            supplyKind: row.supplyKind || null,
            city: row.city || null,
            region: row.region || null,
            version: row.version || null,
            content: row.content || null,
            managerName: row.managerName || null,
            managerEmail: row.managerEmail || null,
            mailingName: row.mailingName || null,
            mailingEmail: row.mailingEmail || null,
            isActive: row.isActive,
            period: entry.period,
        }));
        stats.subscriptionsSaved +=
            await this.services.subscriptionRepo.createManySkipDuplicates(
                inputs,
            );
        this.logger.log(
            `${file.fileName}: prime_lent ${entry.sourceFile} — ${inputs.length} подписок (${this.ctx.domain})`,
        );
    }

    // -----------------------------------------------------------------
    // Online → элементы смарта (главный путь)
    // -----------------------------------------------------------------

    private async importOnline(
        file: SkapImportFile,
        entry: ParsedEntry,
        stats: SkapFileStats,
    ): Promise<void> {
        const rows = entry.parsed.rows as SkapOnlineRow[];
        const period = entry.period;
        const periodCode = formatSkapPeriodCode(period);

        // 1. Компании по рег-листу — фундамент.
        const companies = await this.companyMatch.matchCompanies(
            rows.map(row => row.clientCard),
        );
        const matchedRows = rows.filter(row =>
            companies.has(row.clientCard.trim()),
        );
        stats.itemsSkippedNoCompany += rows.length - matchedRows.length;
        const missedCards = [
            ...new Set(
                rows
                    .filter(row => !companies.has(row.clientCard.trim()))
                    .map(row => row.clientCard.trim()),
            ),
        ];
        for (const card of missedCards.slice(0, 20)) {
            stats.warnings.push(
                `Компания по рег-листу ${card} не найдена (UF_CRM_USER_CARDNUM)`,
            );
        }
        if (missedCards.length > 20) {
            stats.warnings.push(
                `…и ещё ${missedCards.length - 20} рег-листов без компании`,
            );
        }

        if (!matchedRows.length) return;

        // Дубли строк ВНУТРИ файла (один логин×месяц дважды — выгрузки
        // «на неожиданный промежуток» могут пересекаться): берём последнюю
        // строку по xmlId, иначе вторая создала бы дубль элемента.
        const rowByXmlId = new Map<string, SkapOnlineRow>();
        for (const row of matchedRows) {
            rowByXmlId.set(
                buildSkapXmlId(row.clientCard, row.login, periodCode),
                row,
            );
        }
        const uniqueRows = [...rowByXmlId.values()];
        if (uniqueRows.length < matchedRows.length) {
            stats.warnings.push(
                `${entry.sourceFile}: ${matchedRows.length - uniqueRows.length} ` +
                    'повторяющихся строк логин×месяц схлопнуто (взята последняя)',
            );
        }

        const companyIds = [
            ...new Set(
                uniqueRows.map(row => companies.get(row.clientCard.trim())!.id),
            ),
        ];

        // 2. Сделки (по датам договора) и контакты (по email-логину).
        this.assertBudget();
        const dealsByCompany = await this.dealMatch.loadDeals(companyIds);
        const contactsByCompany =
            await this.companyMatch.loadContactEmails(companyIds);

        // 3. Обогащение из Prime_lent (снапшот месяца в БД).
        const enrichment = await this.loadEnrichment(period);

        // 4. Существующие элементы по xmlId (батч-чтение чанками).
        const existingByXmlId = await this.writer.findItemIdsByXmlIds([
            ...rowByXmlId.keys(),
        ]);

        // 5. Запись: одиночные вызовы, темп задаёт rate limiter.
        for (const row of uniqueRows) {
            this.assertBudget();
            const clientCard = row.clientCard.trim();
            const company = companies.get(clientCard)!;
            const xmlId = buildSkapXmlId(clientCard, row.login, periodCode);
            const dedupKey = buildSkapItemDedupKey(
                this.ctx.domain,
                clientCard,
                row.login,
                periodCode,
            );
            const pick = this.dealMatch.pickDeal(
                dealsByCompany.get(company.id),
                period,
            );
            const contactId =
                contactsByCompany
                    .get(company.id)
                    ?.get(normalizeSkapLogin(row.login)) ?? null;
            const events = computeSkapEvents({
                login: row.login,
                period,
                sessionCount: row.sessionCount,
                history: await this.clientHistory(clientCard, period),
            });
            const enriched = enrichment.get(clientCard);
            const timeTotalMin = Math.round(row.timeMs / 60_000);

            try {
                const { id, created } = await this.writer.upsertItem(
                    {
                        xmlId,
                        title: `СКАП ${periodCode} · ${normalizeSkapLogin(row.login)}`,
                        period,
                        periodCode,
                        login: normalizeSkapLogin(row.login),
                        loginCreated: row.loginCreated,
                        clientCard,
                        regList: row.regList,
                        rpName: row.rpName,
                        clientName: row.clientName,
                        complectId: row.complectArmId,
                        complectType: row.complectType,
                        complectName:
                            enriched?.complectNames.get(row.complectArmId) ??
                            null,
                        supplyKind: row.supplyKind,
                        netCoef: row.netCoef,
                        sessionCount: row.sessionCount,
                        timeTotalMin,
                        ipCount: row.ipCount,
                        ipList: row.ipList,
                        city: enriched?.city ?? null,
                        region: enriched?.region ?? null,
                        managerName: enriched?.managerName ?? null,
                        mailingCount: enriched?.activeMailings ?? null,
                        sourceFile: entry.sourceFile,
                        formatVersion: entry.parsed.formatVersion,
                        companyId: company.id,
                        dealId: pick.dealId,
                        contactId,
                        assignedById: company.assignedById,
                        events,
                    },
                    existingByXmlId.get(xmlId) ?? null,
                );
                // Страховка от повторного add в этом же прогоне.
                existingByXmlId.set(xmlId, id);
                await this.services.itemRepo.upsertByDedupKey({
                    portalId: this.ctx.portalId,
                    domain: this.ctx.domain,
                    dedupKey,
                    clientCard,
                    regList: row.regList,
                    login: normalizeSkapLogin(row.login),
                    period,
                    status: created ? 'created' : 'updated',
                    bitrixItemId: id,
                    companyId: company.id,
                    dealId: pick.dealId,
                    contactId,
                    warning: pick.warning,
                    sessionCount: row.sessionCount,
                    timeTotalMin,
                    ipCount: row.ipCount,
                    fileId: file.id,
                });
                if (created) stats.itemsCreated += 1;
                else stats.itemsUpdated += 1;
                if (pick.warning) stats.warnings.push(pick.warning);
            } catch (error) {
                if (error instanceof SkapTimeBudgetExceeded) throw error;
                stats.itemsError += 1;
                const message = (error as Error).message;
                stats.warnings.push(`${xmlId}: ${message}`);
                await this.services.itemRepo
                    .upsertByDedupKey({
                        portalId: this.ctx.portalId,
                        domain: this.ctx.domain,
                        dedupKey,
                        clientCard,
                        regList: row.regList,
                        login: normalizeSkapLogin(row.login),
                        period,
                        status: 'error',
                        warning: message,
                        fileId: file.id,
                    })
                    .catch(() => undefined);
            }
        }

        // 6. Записи без компании — в журнал (для reprocess после заведения).
        for (const row of rows) {
            const clientCard = row.clientCard.trim();
            if (companies.has(clientCard)) continue;
            await this.services.itemRepo
                .upsertByDedupKey({
                    portalId: this.ctx.portalId,
                    domain: this.ctx.domain,
                    dedupKey: buildSkapItemDedupKey(
                        this.ctx.domain,
                        clientCard,
                        row.login,
                        periodCode,
                    ),
                    clientCard,
                    regList: row.regList,
                    login: normalizeSkapLogin(row.login),
                    period,
                    status: 'skipped_no_company',
                    warning: `Компания по рег-листу ${clientCard} не найдена`,
                    sessionCount: row.sessionCount,
                    timeTotalMin: Math.round(row.timeMs / 60_000),
                    ipCount: row.ipCount,
                    fileId: file.id,
                })
                .catch(() => undefined);
        }
    }

    // -----------------------------------------------------------------
    // Online_detail → сессии в БД + детализация в таймлайн
    // -----------------------------------------------------------------

    private async importDetail(
        file: SkapImportFile,
        entry: ParsedEntry,
        stats: SkapFileStats,
    ): Promise<void> {
        const rows = entry.parsed.rows as SkapDetailRow[];
        const periodCode = formatSkapPeriodCode(entry.period);

        stats.sessionsSaved +=
            await this.services.sessionRepo.createManySkipDuplicates(
                rows.map(row => ({
                    portalId: this.ctx.portalId,
                    domain: this.ctx.domain,
                    dedupKey:
                        `${this.ctx.domain}:${row.clientCard.trim()}:` +
                        `${normalizeSkapLogin(row.login)}:${row.startedAt.toISOString()}`,
                    clientCard: row.clientCard.trim(),
                    regList: row.regList,
                    login: normalizeSkapLogin(row.login),
                    complectArmId: row.complectArmId || null,
                    complectType: row.complectType || null,
                    startedAt: row.startedAt,
                    endedAt: row.endedAt,
                    durationSec: Math.round(row.durationMs / 1000),
                    ip: row.ip || null,
                })),
            );

        // Детализация в таймлайн элементов месяца (если элемент уже создан).
        const byLogin = new Map<string, SkapDetailRow[]>();
        for (const row of rows) {
            const key = buildSkapItemDedupKey(
                this.ctx.domain,
                row.clientCard,
                row.login,
                periodCode,
            );
            const list = byLogin.get(key) ?? [];
            list.push(row);
            byLogin.set(key, list);
        }
        const items = await this.services.itemRepo.findByDedupKeys([
            ...byLogin.keys(),
        ]);
        for (const item of items) {
            if (!item.bitrixItemId) continue;
            this.assertBudget();
            const sessions = byLogin.get(item.dedupKey) ?? [];
            if (!sessions.length) continue;
            await this.writer.postSessionsComment(
                item.bitrixItemId,
                this.formatSessions(sessions),
            );
        }
        this.logger.log(
            `${file.fileName}: detail ${entry.sourceFile} — сессий ${rows.length}, элементов с таймлайном ${items.length}`,
        );
    }

    private formatSessions(sessions: SkapDetailRow[]): string {
        const fmt = (date: Date): string =>
            `${String(date.getDate()).padStart(2, '0')}.${String(
                date.getMonth() + 1,
            ).padStart(
                2,
                '0',
            )} ${String(date.getHours()).padStart(2, '0')}:${String(
                date.getMinutes(),
            ).padStart(2, '0')}`;
        const dur = (ms: number): string => {
            const totalMin = Math.round(ms / 60_000);
            const hours = Math.floor(totalMin / 60);
            return hours > 0 ? `${hours}ч ${totalMin % 60}м` : `${totalMin}м`;
        };
        return sessions
            .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
            .map(
                session =>
                    `${fmt(session.startedAt)}${
                        session.endedAt ? `–${fmt(session.endedAt)}` : ''
                    } · ${dur(session.durationMs)} · IP ${session.ip || '—'}`,
            )
            .join('\n');
    }

    // -----------------------------------------------------------------
    // Хелперы
    // -----------------------------------------------------------------

    private async clientHistory(
        clientCard: string,
        period: Date,
    ): Promise<SkapEventHistoryRow[]> {
        const cached = this.historyCache.get(clientCard);
        if (cached) return cached;
        const rows = await this.services.itemRepo.findClientHistoryBefore(
            this.ctx.portalId,
            clientCard,
            period,
        );
        const history = rows.map(row => ({
            login: row.login,
            period: row.period,
            sessionCount: row.sessionCount,
        }));
        this.historyCache.set(clientCard, history);
        return history;
    }

    private enrichmentCache: Map<string, SkapEnrichmentEntry> | null = null;

    private async loadEnrichment(
        period: Date,
    ): Promise<Map<string, SkapEnrichmentEntry>> {
        if (this.enrichmentCache) return this.enrichmentCache;
        const map = new Map<string, SkapEnrichmentEntry>();
        const subscriptions = await this.services.subscriptionRepo.listByPeriod(
            this.ctx.portalId,
            period,
        );
        for (const sub of subscriptions) {
            const entry = map.get(sub.clientCard) ?? {
                complectNames: new Map<string, string>(),
                city: null,
                region: null,
                managerName: null,
                activeMailings: 0,
            };
            if (sub.complectName) {
                entry.complectNames.set(sub.complectArmId, sub.complectName);
            }
            entry.city = entry.city ?? sub.city;
            entry.region = entry.region ?? sub.region;
            entry.managerName = entry.managerName ?? sub.managerName;
            if (sub.isActive) entry.activeMailings += 1;
            map.set(sub.clientCard, entry);
        }
        this.enrichmentCache = map;
        return map;
    }

    private assertBudget(): void {
        if (Date.now() > this.ctx.deadlineAt) {
            throw new SkapTimeBudgetExceeded();
        }
    }
}
