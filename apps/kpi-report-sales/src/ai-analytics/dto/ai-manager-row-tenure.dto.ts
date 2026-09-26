import { ApiPropertyOptional } from '@nestjs/swagger';
import {
    AI_ANALYTICS_SINCE_SOURCES,
    AiAnalyticsSinceSource,
} from '../constants/ai-overview.const';

/**
 * Стаж строки менеджера: дата начала и её источник. Вынесено из
 * `ai-manager-row.dto.ts` (лимит 300 строк) базовым классом — строка
 * наследует поля, Swagger собирает их в одну схему. Оба поля
 * необязательны: кэш обзора, собранный до их появления, их не содержит.
 */
export class AiManagerRowTenureDto {
    @ApiPropertyOptional({
        description:
            'Дата начала стажа YYYY-MM-DD, от которой считается ' +
            'tenureMonths: since записи уровня РОПа, а без неё — дата ' +
            'паспорта менеджера из месячного снапшота (каскад ' +
            'UF_EMPLOYMENT_DATE → DATE_REGISTER → первое событие). Поля ' +
            'нет — дата не известна ни РОПу, ни паспорту.',
        type: String,
        example: '2025-04-01',
    })
    since?: string;

    @ApiPropertyOptional({
        description:
            'Откуда взята дата стажа: manual — задана РОПом в записи ' +
            'уровня; employment — поле трудоустройства ' +
            '(UF_EMPLOYMENT_DATE); register — дата регистрации в Bitrix ' +
            '(DATE_REGISTER); proxy — первое событие телефонии или ' +
            'отчётности (приблизительно). Поля нет — даты нет либо ' +
            'источник паспорта незнаком.',
        enum: AI_ANALYTICS_SINCE_SOURCES,
        example: 'employment',
    })
    sinceSource?: AiAnalyticsSinceSource;
}
