import { Injectable } from '@nestjs/common';
import {
    AiAttentionRequestDto,
    AiAttentionResponseDto,
} from '../../dto/ai-attention.dto';
import type { RequesterAccess } from '../access/perimeter.util';
import { SmartLinkLoader } from '../loaders/smart-link.loader';
import {
    attentionTranscriptionIds,
    toAttentionDto,
    withAttentionCallLinks,
} from '../presenter/attention.presenter';
import { OverviewLookupUseCase } from './overview-lookup.use-case';

/**
 * «Внимание» РОПу (план 6.2, ТЗ FR-12): синхронный срез над кэшем обзора —
 * те же фильтры, тот же requestKey. Обзор в кэше → карточки по строкам в
 * периметре requester'а (≤ 7, ≤ 3 на менеджера); обзора нет → конверт
 * queued/processing/error обзора: фронт дожидается WS и повторяет запрос.
 * Риск-звонки карточек получают ссылки на разборы (SmartLinkLoader, как в
 * повестке): без элемента в смарте ссылка null, ошибка загрузчика не роняет
 * ответ.
 */
@Injectable()
export class AttentionUseCase {
    constructor(
        private readonly overview: OverviewLookupUseCase,
        private readonly smartLinks: SmartLinkLoader,
    ) {}

    async execute(
        dto: AiAttentionRequestDto,
        access: RequesterAccess,
    ): Promise<AiAttentionResponseDto> {
        const lookup = await this.overview.lookup(dto, access);
        if (lookup.status !== 'ready') return lookup;
        const data = toAttentionDto(lookup.data);
        const links = await this.smartLinks.resolveLinks(
            dto.domain,
            attentionTranscriptionIds(data),
        );
        return {
            status: 'ready',
            requestKey: lookup.requestKey,
            data: withAttentionCallLinks(data, links),
        };
    }
}
