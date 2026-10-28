import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumeric } from '@/core/decorators/dto/string-to-number-transform-validate.decorator';
import { ACTING_MANAGER_NAME_MAX_LENGTH } from './acting-manager.dto';

/**
 * Суперпользователь April, который работал в «Звонках» КАК сотрудник
 * (режим «работать как»). Отчёт идёт целиком от имени сотрудника — без
 * пометок на портале и без уведомлений; кто его отправил на самом деле,
 * знает только журнал сервера.
 */
export class ImpersonatorDto {
    @ApiProperty({
        description:
            'Идентификатор суперпользователя April в Битрикс — того, кто ' +
            'фактически отправил отчёт, работая как сотрудник.',
        type: Number,
        example: 447,
    })
    @IsNumeric()
    ID: number;

    @ApiPropertyOptional({
        description:
            'Имя суперпользователя для журнала сервера. На портал не ' +
            'попадает, если роль подтверждена.',
        type: String,
        example: 'Петров Пётр',
        maxLength: ACTING_MANAGER_NAME_MAX_LENGTH,
    })
    @IsOptional()
    @IsString()
    @MaxLength(ACTING_MANAGER_NAME_MAX_LENGTH)
    NAME?: string;
}
