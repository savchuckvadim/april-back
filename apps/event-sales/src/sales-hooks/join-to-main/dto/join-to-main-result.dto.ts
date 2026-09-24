import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Min,
} from 'class-validator';
import { SalesHookOperationDto } from '../../core/dto/sales-hook-operation.dto';

/** Итог присоединения одной сделки-дубля. */
export class JoinToMainItemResultDto {
    @ApiProperty({
        description: 'Сделка-дубль, которую присоединяли.',
        example: 87955,
        type: Number,
        minimum: 1,
    })
    @IsInt()
    @Min(1)
    dealId: number;

    @ApiPropertyOptional({
        description:
            'Основная сделка, в которую перешла работа. null — открытой ' +
            'основной у компании нет, сделка-дубль осталась основной.',
        example: 42423,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    mainDealId: number | null;

    @ApiPropertyOptional({
        description: 'Компания клиента, к которой привязаны контакты.',
        example: 167119,
        type: Number,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    companyId: number | null;

    @ApiProperty({
        description:
            'Сколько привязок контактов добавлено (к компании и к основной).',
        example: 2,
        type: Number,
    })
    @IsInt()
    contactsLinked: number;

    @ApiProperty({
        description: 'Сколько лидов переведено на основную сделку.',
        example: 1,
        type: Number,
    })
    @IsInt()
    leadsRelinked: number;

    @ApiProperty({
        description: 'Сколько открытых задач перешло ответственному основной.',
        example: 1,
        type: Number,
    })
    @IsInt()
    tasksMoved: number;

    @ApiProperty({
        description:
            'Сколько открытых дел CRM перешло ответственному основной.',
        example: 0,
        type: Number,
    })
    @IsInt()
    activitiesMoved: number;

    @ApiProperty({
        description: 'Сделка-дубль закрыта стадией «Дубль» этим прогоном.',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    closedAsDuplicate: boolean;

    @ApiProperty({
        description:
            'Присоединение не выполнено (чужая воронка, основная закрыта, ' +
            'сделка не найдена) — причина в warnings.',
        example: false,
        type: Boolean,
    })
    @IsBoolean()
    skipped: boolean;

    @ApiProperty({
        description: 'Предупреждения graceful degradation.',
        example: [],
        type: [String],
    })
    @IsArray()
    @IsString({ each: true })
    warnings: string[];
}

/** Результат операции «присоединить к основной». */
export class JoinToMainResultDto {
    @ApiProperty({
        description: 'Доменная логика выполнена (не заглушка).',
        example: true,
        type: Boolean,
    })
    @IsBoolean()
    implemented: boolean;

    @ApiProperty({
        description: 'Итоги по каждой сделке пачки.',
        type: [JoinToMainItemResultDto],
    })
    @IsArray()
    items: JoinToMainItemResultDto[];

    @ApiProperty({
        description: 'Краткое пояснение итога операции.',
        example: 'Присоединено сделок: 1 из 1.',
        type: String,
    })
    @IsString()
    message: string;
}

/** Операция «присоединить к основной» с типизированным результатом. */
export class JoinToMainOperationDto extends SalesHookOperationDto {
    @ApiPropertyOptional({
        description: 'Результат выполнения; null до завершения.',
        type: JoinToMainResultDto,
        nullable: true,
    })
    declare result: JoinToMainResultDto | null;
}
