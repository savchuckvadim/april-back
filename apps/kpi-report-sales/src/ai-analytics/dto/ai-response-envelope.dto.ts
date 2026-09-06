import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_RESPONSE_STATUSES,
    AiAnalyticsResponseStatus,
} from '../constants/ai-analytics.const';

/**
 * Общий конверт ответа ai-analytics (план, 6.2): status, requestKey
 * (ключ результата — по нему фронт повторяет запрос и подписывается на
 * WS), data при ready, message при error. Конкретные ответы наследуют
 * конверт и типизируют data.
 */
export class AiAnalyticsEnvelopeDto {
    @ApiProperty({
        description:
            'Статус: ready — данные в ответе; queued/processing — считаются ' +
            'в очереди (результат придёт по WS); error — ошибка, см. message.',
        enum: AI_ANALYTICS_RESPONSE_STATUSES,
        example: 'ready',
    })
    status: AiAnalyticsResponseStatus;

    @ApiProperty({
        description:
            'Ключ запроса/результата (ключ кэша). Одинаковые запросы дают ' +
            'один ключ — по нему дедуплицируются повторы.',
        type: String,
        example: 'sales-ai-analytics:v1:april.bitrix24.ru:pulse:2026-09-04',
    })
    requestKey: string;

    @ApiPropertyOptional({
        description: 'Текст ошибки при status = error.',
        type: String,
        example: 'Портал не найден',
    })
    message?: string;
}
