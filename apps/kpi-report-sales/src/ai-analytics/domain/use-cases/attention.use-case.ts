import { Injectable } from '@nestjs/common';
import {
    AiAttentionRequestDto,
    AiAttentionResponseDto,
} from '../../dto/ai-attention.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { toAttentionDto } from '../presenter/attention.presenter';
import { OverviewLookupUseCase } from './overview-lookup.use-case';

/**
 * «Внимание» РОПу (план 6.2, ТЗ FR-12): синхронный срез над кэшем обзора —
 * те же фильтры, тот же requestKey. Обзор в кэше → карточки по строкам в
 * периметре requester'а (≤ 7, ≤ 3 на менеджера); обзора нет → конверт
 * queued/processing/error обзора: фронт дожидается WS и повторяет запрос.
 */
@Injectable()
export class AttentionUseCase {
    constructor(private readonly overview: OverviewLookupUseCase) {}

    async execute(
        dto: AiAttentionRequestDto,
        access: RequesterAccess,
    ): Promise<AiAttentionResponseDto> {
        const lookup = await this.overview.lookup(dto, access);
        if (lookup.status !== 'ready') return lookup;
        return {
            status: 'ready',
            requestKey: lookup.requestKey,
            data: toAttentionDto(lookup.data),
        };
    }
}
