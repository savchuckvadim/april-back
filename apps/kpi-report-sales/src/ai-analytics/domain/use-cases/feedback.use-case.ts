import { Injectable } from '@nestjs/common';
import { AiAnalyticsFeedbackKind } from '@lib/sales-ai-analytics';
import { AI_ANALYTICS_LEADER_ROLES } from '../../constants/ai-analytics.const';
import { AiFeedbackRequestDto } from '../../dto/ai-feedback.dto';
import {
    AiFeedbackListDto,
    AiFeedbackListRequestDto,
} from '../../dto/ai-feedback-list.dto';
import { AiAnalyticsFeedbackStore } from '../../store/ai-analytics-feedback.store';
import { RequesterAccess } from '../access/perimeter.util';
import { RequesterAccessService } from '../access/requester-access.service';
import { portalRangeUtc } from '../loaders/period.util';
import { SettingsLoader } from '../loaders/settings.loader';

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
 * на его id).
 */
@Injectable()
export class FeedbackUseCase {
    constructor(
        private readonly store: AiAnalyticsFeedbackStore,
        private readonly access: RequesterAccessService,
        private readonly settings: SettingsLoader,
    ) {}

    async add(
        dto: AiFeedbackRequestDto,
        access: RequesterAccess,
    ): Promise<{ id: string }> {
        const managerId = this.scopeManagerId(dto.managerId, dto, access);
        const id = await this.store.add({
            domain: dto.domain,
            kind: dto.kind,
            object: dto.object,
            managerId,
            transcriptionId: dto.transcriptionId ?? null,
            requesterUserId: dto.requesterUserId,
            reason: dto.reason ?? null,
            ...(dto.payload ? { payload: dto.payload } : {}),
        });
        return { id };
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
        const records = await this.store.listInPeriod(
            dto.domain,
            from,
            to,
            managerId ?? undefined,
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
