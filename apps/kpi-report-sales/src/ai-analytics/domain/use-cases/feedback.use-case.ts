import { Injectable, Logger } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
    AiAnalyticsFeedbackKind,
    toPortalDate,
} from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../../cache/ai-analytics-cache.service';
import { AI_ANALYTICS_LEADER_ROLES } from '../../constants/ai-analytics.const';
import { AI_ANALYTICS_LEADER_ONLY_FEEDBACK_KINDS } from '../../constants/ai-feedback.const';
import { AiFeedbackRequestDto } from '../../dto/ai-feedback.dto';
import {
    AiFeedbackListDto,
    AiFeedbackListRequestDto,
} from '../../dto/ai-feedback-list.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { AiAnalyticsSnapshotStore } from '../../store/ai-analytics-snapshot.store';
import {
    isStyleSubject,
    nextDisputedTags,
    styleDisputeTarget,
} from '../../style/style-dispute.util';
import { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import { portalRangeUtc } from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';
import { resetFeedbackCaches } from './feedback-cache-reset.util';
import {
    decideFeedbackWrite,
    type FeedbackWriteDecision,
    needsSameDayLookup,
} from './feedback-dedup.util';
import { visibleFeedbackRecords } from './feedback-visibility.util';

/** Реакции пользователей, по которым считается доля несогласий. */
const REACTION_KINDS: readonly AiAnalyticsFeedbackKind[] = [
    'useful',
    'not_useful',
    'disagree',
];

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** Доля несогласий, % среди реакций useful/not_useful/disagree; null — реакций нет. */
export function disagreementSharePct(
    kinds: readonly AiAnalyticsFeedbackKind[],
): number | null {
    const reactions = kinds.filter(kind => REACTION_KINDS.includes(kind));
    if (!reactions.length) return null;
    const disagree = reactions.filter(kind => kind === 'disagree').length;
    return round1((disagree / reactions.length) * 100);
}

/**
 * Обратная связь по витрине (план, 6.2/6.5): запись реакции от имени
 * requester'а и список за период. Права: руководитель пишет/читает по
 * своему периметру, менеджер — только свои строки (managerId подменяется
 * на его id); alert_handled («Отработано») — только руководителям.
 *
 * Запись (feedback-dedup.util): оценка useful / not_useful — один слот
 * на автора, объект и день портала (та же оценка — id прежней записи,
 * смена оценки — новая запись, прежняя уходит в superseded); повтор
 * alert_handled за день возвращает id прежней записи. После записи
 * alert_handled сбрасывается кэш пульса домена, после disagree — кэш
 * повестки (новое «Отработано» и несогласие видны сразу).
 *
 * Список: только пользовательские реакции, без managerId — в периметре
 * requester'а (feedback-visibility.util).
 */
@Injectable()
export class FeedbackUseCase {
    private readonly logger = new Logger(FeedbackUseCase.name);

    constructor(
        private readonly store: AiAnalyticsFeedbackStore,
        private readonly access: RequesterAccessService,
        private readonly settings: SettingsLoader,
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async add(
        dto: AiFeedbackRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<{ id: string }> {
        if (this.isLeaderOnly(dto.kind)) this.access.assertLeader(access);
        const managerId = this.scopeManagerId(dto.managerId, dto, access);
        const decision = await this.decideWrite(dto, now);
        if (decision.action === 'reuse') return { id: decision.id };
        const authorRole = isStyleSubject(dto.requesterUserId, managerId)
            ? 'subject'
            : 'leader';
        const id = await this.store.add({
            domain: dto.domain,
            kind: dto.kind,
            object: dto.object,
            managerId,
            transcriptionId: dto.transcriptionId ?? null,
            requesterUserId: dto.requesterUserId,
            reason: dto.reason ?? null,
            payload: { ...(dto.payload ?? {}), authorRole },
        });
        await this.supersedePrevious(dto.domain, decision.supersedeIds);
        await resetFeedbackCaches(
            this.cache,
            dto.domain,
            dto.kind,
            this.logger,
        );
        await this.markStyleDisputed(dto, managerId, authorRole);
        return { id };
    }

    /**
     * Гасит прежние оценки слота ПОСЛЕ записи новой: сбой здесь оставит
     * в слоте две актуальные оценки (следующая смена оценки их погасит),
     * но не потеряет реакцию — поэтому ответ ручки он не роняет.
     */
    private async supersedePrevious(
        domain: string,
        ids: readonly string[],
    ): Promise<void> {
        if (!ids.length) return;
        try {
            await this.store.supersede(ids);
        } catch (error) {
            this.logger.warn(
                `Прежние оценки ${ids.join(', ')} не переведены в superseded ` +
                    `(${domain}): ${(error as Error).message}`,
            );
        }
    }

    /** Вид только для руководителей (cup/op/group)? */
    private isLeaderOnly(kind: AiFeedbackRequestDto['kind']): boolean {
        return (
            AI_ANALYTICS_LEADER_ONLY_FEEDBACK_KINDS as readonly string[]
        ).includes(kind);
    }

    /**
     * Решение по реакции над актуальными записями сегодняшнего дня
     * портала (одна выборка тем же listInPeriod); виды без дедупликации
     * (view, disagree) пишутся без выборки.
     */
    private async decideWrite(
        dto: AiFeedbackRequestDto,
        now: Date,
    ): Promise<FeedbackWriteDecision> {
        if (!needsSameDayLookup(dto.kind)) {
            return { action: 'write', supersedeIds: [] };
        }
        const { calendar } = await this.settings.load(dto.domain);
        const today = toPortalDate(now, calendar.timeZone);
        const { from, to } = portalRangeUtc(today, today, calendar.timeZone);
        const records = await this.store.listInPeriod(dto.domain, from, to);
        return decideFeedbackWrite(records, {
            kind: dto.kind,
            object: dto.object,
            requesterUserId: dto.requesterUserId,
        });
    }

    /**
     * Несогласие СУБЪЕКТА с подписью стиля ставит `disputed` на подпись в
     * снапшоте `ai-analytics-style` (документ §1.3): в карточке она
     * остаётся с пометкой, вне карточки не используется до пересчёта.
     * Несогласие руководителя подпись не снимает — это отдельный канал
     * (доля несогласий РОПов по подписи).
     */
    private async markStyleDisputed(
        dto: AiFeedbackRequestDto,
        managerId: string | null,
        authorRole: 'subject' | 'leader',
    ): Promise<void> {
        if (dto.kind !== 'disagree' || authorRole !== 'subject') return;
        const target = styleDisputeTarget(dto.object);
        if (target === null || managerId === null) return;
        const record = await this.snapshots.latest(
            dto.domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            managerId,
            { limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT },
        );
        if (record === null) return;
        const disputedTags = nextDisputedTags(record.payload, target);
        if (disputedTags === null) return;
        await this.snapshots.upsert(
            {
                ...record,
                payload: {
                    ...(record.payload as Record<string, unknown>),
                    disputedTags,
                },
            },
            { force: true },
        );
        this.logger.log(
            `Подписи стиля ${disputedTags.join(', ')} менеджера ${managerId} ` +
                `отмечены оспоренными (${dto.domain})`,
        );
    }

    async list(
        dto: AiFeedbackListRequestDto,
        access: RequesterAccess,
    ): Promise<AiFeedbackListDto> {
        const managerId = this.scopeManagerId(dto.managerId, dto, access);
        const { calendar } = await this.settings.load(dto.domain);
        const { from, to } = portalRangeUtc(
            dto.from,
            dto.to,
            calendar.timeZone,
        );
        const records = visibleFeedbackRecords(
            await this.store.listInPeriod(
                dto.domain,
                from,
                to,
                managerId ?? undefined,
            ),
            access,
            managerId,
        );
        return {
            items: records.map(record => ({
                id: record.id,
                kind: record.kind,
                object: record.object,
                managerId: record.managerId,
                transcriptionId: record.transcriptionId,
                requesterUserId: record.requesterUserId,
                reason: record.reason,
                createdAt: record.createdAt.toISOString(),
            })),
            disagreementSharePct: disagreementSharePct(
                records.map(record => record.kind),
            ),
        };
    }

    /**
     * Менеджер без роли руководителя работает только со своими строками;
     * руководитель — с любым менеджером своего периметра (иначе 403).
     */
    private scopeManagerId(
        requested: string | undefined,
        dto: { requesterUserId: string },
        access: RequesterAccess,
    ): string | null {
        const isLeader = (
            AI_ANALYTICS_LEADER_ROLES as readonly string[]
        ).includes(access.role);
        if (!isLeader) return String(Number(dto.requesterUserId));
        if (requested === undefined) return null;
        this.access.assertVisible(access, requested);
        return requested;
    }
}
