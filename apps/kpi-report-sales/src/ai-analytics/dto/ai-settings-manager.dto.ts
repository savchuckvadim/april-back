import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    ArrayMaxSize,
    IsArray,
    IsBoolean,
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/**
 * Слой параметров одного менеджера — верхний слой реестра: сильнее полосы
 * стажа и портала. Здесь только решения руководителя о конкретном
 * человеке; всё, что оценивается из данных, живёт в снапшоте модели.
 */
export class AiManagerParamsDto {
    @ApiProperty({
        description: 'Bitrix-id менеджера.',
        type: Number,
        example: 447,
    })
    @IsInt()
    @Min(1)
    managerId: number;

    @ApiPropertyOptional({
        description: 'Ставка [0.25; 1]: половина ставки — половина экспозиции.',
        type: Number,
        example: 0.5,
    })
    @IsOptional()
    @IsNumber()
    fteShare?: number;

    @ApiPropertyOptional({
        description: 'Личная цель продаж; null — снять переопределение.',
        type: Number,
        example: 4,
        nullable: true,
    })
    @IsOptional()
    @IsNumber()
    targetOverride?: number | null;

    @ApiPropertyOptional({
        description: 'Личный обучающий минимум презентаций в месяц.',
        type: Number,
        example: 20,
    })
    @IsOptional()
    @IsNumber()
    trainingMinPresentations?: number;

    @ApiPropertyOptional({
        description:
            'Исключить из норм отдела: строки менеджера не участвуют в ' +
            'оценке нормы полосы (стажёр, наставник, особый профиль).',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    excludeFromNorms?: boolean;

    @ApiPropertyOptional({
        description: 'Не слать алерты по звонкам этого менеджера.',
        type: Boolean,
        example: false,
    })
    @IsOptional()
    @IsBoolean()
    alertsMuted?: boolean;

    @ApiPropertyOptional({
        description: 'Личное включение утреннего разбора.',
        type: Boolean,
        example: true,
    })
    @IsOptional()
    @IsBoolean()
    digestEnabled?: boolean;

    @ApiPropertyOptional({
        description: 'Bitrix-id наставника.',
        type: Number,
        example: 42,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    mentorUserId?: number;

    @ApiPropertyOptional({
        description: 'Свои рабочие дни недели (1 — понедельник … 7).',
        type: [Number],
        example: [1, 2, 3, 4, 5],
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(7)
    @IsInt({ each: true })
    @Min(1, { each: true })
    @Max(7, { each: true })
    workweek?: number[];

    @ApiPropertyOptional({
        description: 'Своя TZ (IANA), если менеджер работает в другом поясе.',
        type: String,
        example: 'Asia/Novosibirsk',
    })
    @IsOptional()
    @IsString()
    timeZone?: string;
}
