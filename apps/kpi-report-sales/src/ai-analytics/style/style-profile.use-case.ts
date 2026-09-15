import { Injectable } from '@nestjs/common';
import {
    AI_ANALYTICS_SNAPSHOT_TYPE,
    AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT,
} from '@lib/sales-ai-analytics';
import {
    AiStyleCardDto,
    AiStyleProfileRequestDto,
} from '../dto/ai-style-card.dto';
import { RequesterAccess } from '../domain/access/perimeter.util';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { AiAnalyticsSnapshotStore } from '../store/ai-analytics-snapshot.store';
import {
    buildStyleCard,
    type StyleSnapshotPayload,
} from './style-card.presenter';
import { StyleSettingsLoader } from './style-settings.loader';

/** Месяц 'YYYY-MM' момента (UTC достаточно: признак «профиль отстал»). */
const monthKeyOf = (now: Date): string => now.toISOString().slice(0, 7);

/**
 * Карточка стиля менеджера (документ
 * `ai/tasks/ai-analytics-manager-style.md`, §1.3): читает готовый снапшот
 * `ai-analytics-style` месячного шага — сам ничего не считает и в Bitrix
 * не ходит.
 *
 * Доступ: руководитель — по своему периметру, менеджер — только по себе
 * (стиль субъект видит первым). Отказ сотрудника от профилирования
 * (`ai_analytics_style_opt_out`) закрывает карточку и для руководителя.
 */
@Injectable()
export class StyleProfileUseCase {
    constructor(
        private readonly snapshots: AiAnalyticsSnapshotStore,
        private readonly settings: StyleSettingsLoader,
        private readonly access: RequesterAccessService,
    ) {}

    async execute(
        dto: AiStyleProfileRequestDto,
        access: RequesterAccess,
        now: Date = new Date(),
    ): Promise<AiStyleCardDto> {
        const managerId = String(Number(dto.managerId));
        this.access.assertVisible(access, managerId);
        const optOut = await this.settings.isOptedOut(dto.domain, managerId);
        const record = optOut
            ? null
            : await this.findSnapshot(dto.domain, managerId, dto.monthKey);
        return buildStyleCard({
            managerId,
            monthKey: record?.periodKey ?? dto.monthKey ?? null,
            payload: (record?.payload as StyleSnapshotPayload) ?? null,
            generatedAt: record?.generatedAt ?? null,
            optOut,
            nowMonthKey: monthKeyOf(now),
        });
    }

    /** Снапшот месяца по ключу либо последний профиль менеджера. */
    private async findSnapshot(
        domain: string,
        managerId: string,
        monthKey?: string,
    ) {
        if (monthKey === undefined) {
            return this.snapshots.latest(
                domain,
                AI_ANALYTICS_SNAPSHOT_TYPE.style,
                managerId,
                { limit: AI_ANALYTICS_SNAPSHOT_WINDOW_LIMIT },
            );
        }
        const records = await this.snapshots.findByKeys(
            domain,
            AI_ANALYTICS_SNAPSHOT_TYPE.style,
            {
                periodKeys: [monthKey],
                managerIds: [managerId],
                latestOnly: true,
            },
        );
        return records[records.length - 1] ?? null;
    }
}
