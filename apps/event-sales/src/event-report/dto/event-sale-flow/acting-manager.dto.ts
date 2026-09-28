import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';

/** Предел длины имени: подпись уезжает в историю карточки и уведомление. */
export const ACTING_MANAGER_NAME_MAX_LENGTH = 120;

/**
 * Руководитель, который отчитался ЗА сотрудника (режим руководителя в
 * «Звонках»). Сам отчёт при этом идёт от имени сотрудника:
 * `plan.responsibility` — сотрудник, сделки и KPI остаются за ним.
 */
export class ActingManagerDto {
    @ApiProperty({
        description:
            'Идентификатор руководителя в Битрикс — того, кто фактически ' +
            'отправил отчёт за сотрудника.',
        type: Number,
        example: 481,
    })
    @IsNumeric()
    ID: number;

    @ApiPropertyOptional({
        description:
            'Имя руководителя для подписи в истории и уведомлении. Не ' +
            'передано — бэк возьмёт имя из структуры отдела продаж.',
        type: String,
        example: 'Иванов Иван',
        maxLength: ACTING_MANAGER_NAME_MAX_LENGTH,
    })
    @IsOptional()
    @IsString()
    @MaxLength(ACTING_MANAGER_NAME_MAX_LENGTH)
    NAME?: string;
}
