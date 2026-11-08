import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import type { PortalBitrixLoad } from './portal-bitrix-load.service';

export class PortalBitrixLoadQueryDto {
    @ApiProperty({
        description: 'Окно, часов (1–168). По умолчанию сутки.',
        type: Number,
        required: false,
        example: 24,
    })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(168)
    hours?: number;
}

export class BitrixLoadClassDto {
    @ApiProperty({
        description:
            'Класс вызова: interactive — человек ждёт у экрана; background — кроны, очереди, AI.',
        type: String,
        example: 'background',
    })
    callClass!: string;

    @ApiProperty({
        description: 'Обращений за окно.',
        type: Number,
        example: 1200,
    })
    calls!: number;
}

export class BitrixLoadMethodDto {
    @ApiProperty({
        description: 'Метод REST Битрикса.',
        type: String,
        example: 'crm.item.list',
    })
    method!: string;

    @ApiProperty({
        description: 'Обращений за окно.',
        type: Number,
        example: 540,
    })
    calls!: number;
}

export class BitrixLoadRateLimitDto {
    @ApiProperty({
        description: 'Слот ограничителя выдан.',
        type: Number,
        example: 1800,
    })
    granted!: number;

    @ApiProperty({
        description: 'Слот не дождались, запрос ушёл без него (интерактив).',
        type: Number,
        example: 3,
    })
    passed!: number;

    @ApiProperty({
        description: 'Слот не дождались, фоновому вызову отказано.',
        type: Number,
        example: 0,
    })
    rejected!: number;
}

export class BitrixLoadPeakDto {
    @ApiProperty({
        description: 'Конец самого нагруженного часа (ISO).',
        type: String,
        example: '2026-11-08T09:00:00.000Z',
    })
    at!: string;

    @ApiProperty({
        description: 'Обращений за этот час.',
        type: Number,
        example: 420,
    })
    calls!: number;
}

export class PortalBitrixLoadDto implements PortalBitrixLoad {
    @ApiProperty({
        description: 'Домен портала.',
        type: String,
        example: 'april-garant.bitrix24.ru',
    })
    domain!: string;

    @ApiProperty({ description: 'Окно, часов.', type: Number, example: 24 })
    hours!: number;

    @ApiProperty({
        description:
            'Данные получены из Prometheus; false — не ответил (причина в reason).',
        type: Boolean,
        example: true,
    })
    available!: boolean;

    @ApiProperty({
        description: 'Почему данных нет.',
        type: String,
        nullable: true,
        example: null,
    })
    reason!: string | null;

    @ApiProperty({
        description: 'Всего обращений в Битрикс за окно.',
        type: Number,
        example: 2400,
    })
    total!: number;

    @ApiProperty({ description: 'Успешных.', type: Number, example: 2380 })
    ok!: number;

    @ApiProperty({
        description: 'С ошибкой Битрикса или сети.',
        type: Number,
        example: 15,
    })
    errors!: number;

    @ApiProperty({ description: 'По таймауту.', type: Number, example: 5 })
    timeouts!: number;

    @ApiProperty({
        description: 'По классу вызова.',
        type: [BitrixLoadClassDto],
    })
    byClass!: BitrixLoadClassDto[];

    @ApiProperty({
        description: 'Самые частые методы.',
        type: [BitrixLoadMethodDto],
    })
    topMethods!: BitrixLoadMethodDto[];

    @ApiProperty({
        description: 'Ожидание в ограничителе запросов.',
        type: BitrixLoadRateLimitDto,
    })
    rateLimit!: BitrixLoadRateLimitDto;

    @ApiProperty({
        description:
            '95-й перцентиль длительности обращения, секунды; null — данных нет.',
        type: Number,
        nullable: true,
        example: 0.8,
    })
    p95Seconds!: number | null;

    @ApiProperty({
        description: 'Самый нагруженный час окна.',
        type: BitrixLoadPeakDto,
        nullable: true,
    })
    peakHour!: BitrixLoadPeakDto | null;
}
