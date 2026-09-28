import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Ответственный основной сделки клиента — для блока «повторное обращение». */
export class LeadRequestRepeatResponsibleDto {
    @ApiProperty({
        description: 'Идентификатор сотрудника Bitrix.',
        example: 387,
        type: Number,
    })
    @IsInt()
    id: number;

    @ApiPropertyOptional({
        description: 'Имя сотрудника; не удалось прочитать — null.',
        example: 'Юлия Воропаева',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    name: string | null;

    @ApiProperty({
        description:
            'Сотрудник работает (аккаунт активен и не в отделе ' +
            'неработающих).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    active: boolean;

    @ApiProperty({
        description:
            'Сотрудник участвует в распределении по кругу (работает и не ' +
            'исключён настройкой портала). false — «сотрудника нет в ' +
            'карусели».',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    inRotation: boolean;
}

/**
 * Повторное обращение: заявка присоединена к уже существующей работе
 * клиента (решение владельца 28.09.2026 — сотрудник должен видеть, что
 * работа велась и на ком она висела).
 */
export class LeadRequestRepeatDto {
    @ApiProperty({
        description:
            'Заявка присоединена к сделке, созданной из ДРУГОГО лида ' +
            '(повторное обращение клиента).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    isRepeat: boolean;

    @ApiProperty({
        description: 'Основная сделка клиента (to_base_sales лида).',
        example: 42423,
        type: Number,
    })
    @IsInt()
    mainDealId: number;

    @ApiPropertyOptional({
        description: 'Название основной сделки.',
        example: 'МИНИМУЩЕСТВА ВО (3192846)',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    mainDealTitle: string | null;

    @ApiPropertyOptional({
        description:
            'Стадия, на которой шла работа до заявки (op_return_stage; ' +
            'нет — текущая стадия сделки).',
        example: 'Решение',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    stageBeforeName: string | null;

    @ApiProperty({
        description:
            'После принятия сделка вернётся на прежнюю стадию (стадия ' +
            'возврата записана).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    willReturnStage: boolean;

    @ApiPropertyOptional({
        description: 'Ответственный основной сделки.',
        type: LeadRequestRepeatResponsibleDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LeadRequestRepeatResponsibleDto)
    responsible: LeadRequestRepeatResponsibleDto | null;
}
