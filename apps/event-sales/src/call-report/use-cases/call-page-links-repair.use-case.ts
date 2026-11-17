import { Injectable, Logger } from '@nestjs/common';
import { BitrixService } from '@lib/bitrix';
import {
    AGENT_ANALYSIS_TYPE,
    AiService,
    CallPageLinkService,
    type AiEntityDto,
} from '@lib/call-lib';
import { CallReportSmartResolverService } from '@lib/call-lib/call-report/services/call-report-smart-resolver.service';
import { PBXService } from '@lib/pbx/pbx.service';
import { CallPageLinksRepairStore } from '../services/call-page-links-repair.store';
import {
    CALL_PAGE_LINKS_REPAIR_MAX_ATTEMPTS,
    CALL_PAGE_LINKS_REPAIR_QUOTA,
    CALL_PAGE_LINKS_REPAIR_WINDOW,
    callPageLinkTargets,
    DEAD_CALL_PAGE_SITE,
    pendingLinkRepairs,
    rewriteCallPageLinks,
    type CallPageLinksRepairResult,
} from './call-page-links-repair.util';

/**
 * ПОЧИНКА ССЫЛОК НА СТРАНИЦУ РАЗБОРА (разовая работа, решение владельца
 * 17.11.2026): в комментариях ленты, записанных 16–17.11.2026, адрес сайта
 * заменяется на действующий. Идёт медленно — не больше
 * CALL_PAGE_LINKS_REPAIR_QUOTA разборов портала за проход ежечасного догона:
 * по каждому разбору читается страница свежих комментариев сделки (или лида)
 * и карточки разбора, комментарии с мёртвым адресом переписываются.
 *
 * Повтор безопасен: исправленный комментарий мёртвого адреса уже не
 * содержит. Когда непроверенных разборов не осталось, портал помечается
 * пройденным и шаг перестаёт что-либо делать.
 *
 * `@Injectable` без bitrix-состояния: инстанс берётся у PBXService на вызов
 * (правило CLAUDE.md про `this.bitrix`).
 */
@Injectable()
export class CallPageLinksRepairUseCase {
    private readonly logger = new Logger(CallPageLinksRepairUseCase.name);

    constructor(
        private readonly aiService: AiService,
        private readonly pbxService: PBXService,
        private readonly smartResolver: CallReportSmartResolverService,
        private readonly links: CallPageLinkService,
        private readonly store: CallPageLinksRepairStore,
    ) {}

    async repairDomain(
        domain: string,
        now: Date = new Date(),
    ): Promise<CallPageLinksRepairResult> {
        const result: CallPageLinksRepairResult = {
            domain,
            checked: 0,
            rewritten: 0,
            gaveUp: 0,
            finished: false,
        };
        if (await this.store.isDone(domain)) return result;
        const site = await this.links.siteUrl();
        // Действующий сайт не задан или совпал с мёртвым — менять не на что.
        if (site === null || site === DEAD_CALL_PAGE_SITE) return result;

        const records = await this.aiService.findByDomainTypesInPeriod(
            domain,
            [AGENT_ANALYSIS_TYPE],
            CALL_PAGE_LINKS_REPAIR_WINDOW.from,
            CALL_PAGE_LINKS_REPAIR_WINDOW.to,
        );
        const pending = pendingLinkRepairs(
            records,
            await this.store.seen(domain),
        );
        if (pending.length === 0) {
            await this.store.markDone(domain, now.toISOString());
            // Портал без разборов в окне пройден молча: сообщать не о чем.
            return { ...result, finished: records.length > 0 };
        }

        const { bitrix } = await this.pbxService.init(domain);
        const smart = await this.smartResolver
            .resolve(domain)
            .catch(() => null);
        for (const record of pending.slice(0, CALL_PAGE_LINKS_REPAIR_QUOTA)) {
            try {
                result.rewritten += await this.repairRecord(
                    bitrix,
                    record,
                    smart?.entityTypeId ?? null,
                    site,
                );
                await this.store.markSeen(domain, record.id);
                result.checked += 1;
            } catch (error) {
                const attempt = await this.store.bumpAttempt(record.id);
                this.logger.warn(
                    `Ссылки разбора ${record.id} (${domain}) не проверены, попытка ${attempt}: ${(error as Error).message}`,
                );
                if (attempt >= CALL_PAGE_LINKS_REPAIR_MAX_ATTEMPTS) {
                    await this.store.markSeen(domain, record.id);
                    result.gaveUp += 1;
                }
            }
        }
        return result;
    }

    /** Ленты одного разбора; возвращает число переписанных комментариев. */
    private async repairRecord(
        bitrix: BitrixService,
        record: AiEntityDto,
        smartEntityTypeId: number | null,
        site: string,
    ): Promise<number> {
        let rewritten = 0;
        for (const target of callPageLinkTargets(record, smartEntityTypeId)) {
            // Ссылка писалась недавно — она среди самых свежих комментариев.
            const response = await bitrix.timeline.getTimelineComments(
                { ENTITY_TYPE: target.entityType, ENTITY_ID: target.entityId },
                ['ID', 'COMMENT'],
                { ID: 'DESC' },
            );
            for (const comment of response?.result ?? []) {
                const fixed =
                    typeof comment.COMMENT === 'string'
                        ? rewriteCallPageLinks(comment.COMMENT, site)
                        : null;
                if (fixed === null || comment.ID === undefined) continue;
                await bitrix.timeline.updateTimelineComment(comment.ID, fixed);
                rewritten += 1;
            }
        }
        return rewritten;
    }
}
