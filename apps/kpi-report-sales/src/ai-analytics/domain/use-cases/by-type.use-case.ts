import { Injectable } from '@nestjs/common';
import { AiAnalyticsByTypeLayout } from '../../constants/ai-overview.const';
import {
    AiByTypeRequestDto,
    AiByTypeResponseDto,
} from '../../dto/ai-by-type.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { buildByType } from '../presenter/by-type.presenter';
import { OverviewLookupUseCase } from './overview-lookup.use-case';

const DEFAULT_LAYOUT: AiAnalyticsByTypeLayout = 'wide';

/**
 * Срез обзора по типу звонка, всем типам (all) или возражениям (план 6.2,
 * ТЗ FR-21): тот же кэш обзора, что у overview; ready → раскладка wide
 * (строка на менеджера, при all — на пару менеджер × тип) или long
 * («сотрудник | показатель | оценка | объяснение») по строкам в периметре
 * requester'а; иначе — конверт обзора (queued/processing/error).
 */
@Injectable()
export class ByTypeUseCase {
    constructor(private readonly overview: OverviewLookupUseCase) {}

    async execute(
        dto: AiByTypeRequestDto,
        access: RequesterAccess,
    ): Promise<AiByTypeResponseDto> {
        const lookup = await this.overview.lookup(dto, access);
        if (lookup.status !== 'ready') return lookup;
        return {
            status: 'ready',
            requestKey: lookup.requestKey,
            data: buildByType(
                lookup.data,
                dto.callType,
                dto.layout ?? DEFAULT_LAYOUT,
            ),
        };
    }
}
