import { Injectable } from '@nestjs/common';
import type { DealMovementDealsSnapshotPayload } from '@lib/sales-ai-analytics';
import { AiAnalyticsCacheService } from '../cache/ai-analytics-cache.service';
import type { RequesterAccess } from '../domain/access/perimeter.util';
import {
    dealMovementDealsQueryOf,
    emptyDealMovementDealsPage,
    presentDealMovementDeals,
} from './deal-movement-deals.presenter';
import { DealMovementNamesReader } from './deal-movement-names.reader';
import { dealMovementScopeOf } from './deal-movement-scope';
import { DealMovementSnapshotsReader } from './deal-movement-snapshots.reader';
import {
    buildDealMovementDealsKey,
    DEAL_MOVEMENT_TTL_SECONDS,
} from './deal-movement-vitrina.const';
import type { DealMovementDealsResponseDto } from './dto/deal-movement-deals.dto';
import type { DealMovementDealsRequestDto } from './dto/deal-movement-request.dto';

/**
 * Проблемные сделки последней ночи (постановка §7, п. 2): запись ночного
 * счёта (ais, ключ `latest`) общая на портал и лежит в кэше 5 минут —
 * листание её не перечитывает; периметр, фильтры, порядок по сумме и
 * страница — в памяти. Битрикс не вызывается.
 *
 * `@Injectable` без bitrix-состояния.
 */
@Injectable()
export class DealMovementDealsUseCase {
    constructor(
        private readonly snapshots: DealMovementSnapshotsReader,
        private readonly names: DealMovementNamesReader,
        private readonly cache: AiAnalyticsCacheService,
    ) {}

    async execute(
        dto: DealMovementDealsRequestDto,
        access: RequesterAccess,
    ): Promise<DealMovementDealsResponseDto> {
        const scope = dealMovementScopeOf(access, dto.managerIds);
        const query = dealMovementDealsQueryOf(dto);
        const [record, names] = await Promise.all([
            this.record(dto.domain),
            this.names.names(dto.domain),
        ]);
        return {
            status: 'ready',
            requestKey: buildDealMovementDealsKey(dto.domain),
            data:
                record === null
                    ? emptyDealMovementDealsPage(query)
                    : presentDealMovementDeals({
                          record,
                          domain: dto.domain,
                          scope,
                          query,
                          names,
                      }),
        };
    }

    private async record(
        domain: string,
    ): Promise<DealMovementDealsSnapshotPayload | null> {
        const { value } = await this.cache.remember(
            buildDealMovementDealsKey(domain),
            DEAL_MOVEMENT_TTL_SECONDS,
            () => this.snapshots.problemDeals(domain),
            { volatile: true },
        );
        return value;
    }
}
