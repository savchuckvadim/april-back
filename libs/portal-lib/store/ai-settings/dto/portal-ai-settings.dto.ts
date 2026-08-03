import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsArray,
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import {
    PortalAiSettingsRecord,
    PortalAiSettingsUpdate,
} from '../portal-ai-settings.types';

/**
 * Общее для всех полей: `null` = «на портале не задано», значение берётся
 * из глобальных настроек приложения. Поэтому у каждого поля `nullable: true`,
 * а не «дефолт» — дефолтов на уровне портала нет by design.
 */
export class PortalAiSettingsResponseDto implements PortalAiSettingsRecord {
    constructor(record: PortalAiSettingsRecord | null) {
        const source = record ?? ({} as Partial<PortalAiSettingsRecord>);
        this.enabled = source.enabled ?? null;
        this.deepAnalysisEnabled = source.deepAnalysisEnabled ?? null;
        this.createSmartEnabled = source.createSmartEnabled ?? null;
        this.classifyEnabled = source.classifyEnabled ?? null;
        this.salesOnly = source.salesOnly ?? null;
        this.minDurationSec = source.minDurationSec ?? null;
        this.windowHours = source.windowHours ?? null;
        this.maxPerRun = source.maxPerRun ?? null;
        this.staleMinutes = source.staleMinutes ?? null;
        this.llmModel = source.llmModel ?? null;
        this.deepAnalysisModel = source.deepAnalysisModel ?? null;
        this.scanIntervalMinutes = source.scanIntervalMinutes ?? null;
        this.nightScanIntervalMinutes = source.nightScanIntervalMinutes ?? null;
        this.nightStartHour = source.nightStartHour ?? null;
        this.nightEndHour = source.nightEndHour ?? null;
        this.lastScanAt = source.lastScanAt ?? null;
        this.allowedUserIds = source.allowedUserIds ?? null;
    }

    @ApiProperty({
        description:
            'Обрабатывать ли звонки этого портала. Главный выключатель: ' +
            'при false портал не сканируется вообще.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    enabled: boolean | null;

    @ApiProperty({
        description:
            'Глубокий разбор звонка: 7 разделов с оценками, анализ речи, ' +
            'рекомендации. Самая дорогая часть конвейера.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    deepAnalysisEnabled: boolean | null;

    @ApiProperty({
        description:
            'Создавать элемент смарт-процесса «AI-анализ звонков» в Битриксе. ' +
            'При false результаты остаются только в БД и в таймлайне сделки.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    createSmartEnabled: boolean | null;

    @ApiProperty({
        description:
            'Определять тип звонка дешёвой моделью. От типа зависят критерии ' +
            'глубокого разбора, поэтому выключать не рекомендуется.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    classifyEnabled: boolean | null;

    @ApiProperty({
        description:
            'Анализировать только звонки менеджеров отдела продаж. ' +
            'При false берутся звонки всех сотрудников портала.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    salesOnly: boolean | null;

    @ApiProperty({
        description:
            'Минимальная длительность звонка для анализа, секунд. Короткие ' +
            'звонки и недозвоны разбирать нечего, а транскрибация платная.',
        example: 300,
        type: Number,
        nullable: true,
    })
    minDurationSec: number | null;

    @ApiProperty({
        description:
            'Окно поиска звонков назад, часов. Должно с запасом перекрывать ' +
            'интервал сканирования, иначе звонки будут теряться.',
        example: 25,
        type: Number,
        nullable: true,
    })
    windowHours: number | null;

    @ApiProperty({
        description:
            'Максимум звонков, отправляемых в обработку за один скан — ' +
            'защита бюджета транскрибации и моделей.',
        example: 10,
        type: Number,
        nullable: true,
    })
    maxPerRun: number | null;

    @ApiProperty({
        description:
            'Через сколько минут зависшая обработка считается сорвавшейся ' +
            'и звонок снова становится доступен для анализа.',
        example: 90,
        type: Number,
        nullable: true,
    })
    staleMinutes: number | null;

    @ApiProperty({
        description:
            'Модель первичного анализа (резюме и рекомендации по звонку).',
        example: 'gigachat',
        type: String,
        nullable: true,
    })
    llmModel: string | null;

    @ApiProperty({
        description:
            'Модель глубокого разбора звонка. Здесь оправданна модель ' +
            'посильнее: именно она формирует оценки и рекомендации.',
        example: 'cloudru',
        type: String,
        nullable: true,
    })
    deepAnalysisModel: string | null;

    @ApiProperty({
        description:
            'Как часто сканировать портал днём, минут. Планировщик тикает с ' +
            'фиксированной частотой и пропускает портал, пока его интервал не ' +
            'вышел, поэтому чаще собственного тика сканирования не будет.',
        example: 30,
        type: Number,
        nullable: true,
    })
    scanIntervalMinutes: number | null;

    @ApiProperty({
        description:
            'Как часто сканировать портал в ночные часы, минут. Основную ' +
            'работу дешевле и спокойнее выполнять ночью, а днём — реже.',
        example: 15,
        type: Number,
        nullable: true,
    })
    nightScanIntervalMinutes: number | null;

    @ApiProperty({
        description:
            'Начало ночного окна, час 0-23 по таймзоне портала. Окно может ' +
            'пересекать полночь (например, с 22 до 6).',
        example: 22,
        type: Number,
        nullable: true,
    })
    nightStartHour: number | null;

    @ApiProperty({
        description: 'Конец ночного окна, час 0-23 по таймзоне портала.',
        example: 6,
        type: Number,
        nullable: true,
    })
    nightEndHour: number | null;

    @ApiProperty({
        description:
            'Когда портал сканировали в последний раз. Служебное поле, ' +
            'пишется планировщиком, снаружи не редактируется.',
        example: '2026-08-01T09:30:00.000Z',
        type: Date,
        nullable: true,
    })
    lastScanAt: Date | null;

    @ApiProperty({
        description:
            'ДЕМО-режим: bitrix-id сотрудников, чьи звонки анализируются. ' +
            'Пусто — весь отдел продаж портала.',
        example: [222, 323],
        type: [Number],
        nullable: true,
    })
    allowedUserIds: number[] | null;
}

/**
 * Изменение настроек. Отсутствующее поле не трогается, явный `null`
 * сбрасывает значение на глобальное — так снимается «переопределение».
 */
export class UpdatePortalAiSettingsDto implements PortalAiSettingsUpdate {
    @ApiPropertyOptional({
        description: 'Обрабатывать ли звонки портала (главный выключатель).',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean | null;

    @ApiPropertyOptional({
        description: 'Глубокий разбор звонка (7 разделов, оценки, спич).',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    deepAnalysisEnabled?: boolean | null;

    @ApiPropertyOptional({
        description: 'Создавать элемент смарт-процесса «AI-анализ звонков».',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    createSmartEnabled?: boolean | null;

    @ApiPropertyOptional({
        description: 'Определять тип звонка дешёвой моделью.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    classifyEnabled?: boolean | null;

    @ApiPropertyOptional({
        description: 'Анализировать только менеджеров отдела продаж.',
        example: true,
        type: Boolean,
        nullable: true,
    })
    @IsOptional()
    @IsBoolean()
    salesOnly?: boolean | null;

    @ApiPropertyOptional({
        description: 'Минимальная длительность звонка для анализа, секунд.',
        example: 300,
        type: Number,
        minimum: 1,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    minDurationSec?: number | null;

    @ApiPropertyOptional({
        description: 'Окно поиска звонков назад, часов.',
        example: 25,
        type: Number,
        minimum: 1,
        maximum: 720,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(720)
    windowHours?: number | null;

    @ApiPropertyOptional({
        description: 'Максимум звонков в обработку за один скан.',
        example: 10,
        type: Number,
        minimum: 1,
        maximum: 500,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(500)
    maxPerRun?: number | null;

    @ApiPropertyOptional({
        description: 'Порог реанимации зависших обработок, минут.',
        example: 90,
        type: Number,
        minimum: 1,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    staleMinutes?: number | null;

    @ApiPropertyOptional({
        description: 'Модель первичного анализа (резюме и рекомендации).',
        example: 'gigachat',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    llmModel?: string | null;

    @ApiPropertyOptional({
        description: 'Модель глубокого разбора звонка.',
        example: 'cloudru',
        type: String,
        nullable: true,
    })
    @IsOptional()
    @IsString()
    deepAnalysisModel?: string | null;

    @ApiPropertyOptional({
        description: 'Интервал сканирования портала днём, минут.',
        example: 30,
        type: Number,
        minimum: 1,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    scanIntervalMinutes?: number | null;

    @ApiPropertyOptional({
        description: 'Интервал сканирования портала ночью, минут.',
        example: 15,
        type: Number,
        minimum: 1,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    nightScanIntervalMinutes?: number | null;

    @ApiPropertyOptional({
        description: 'Начало ночного окна, час 0-23 по таймзоне портала.',
        example: 22,
        type: Number,
        minimum: 0,
        maximum: 23,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(23)
    nightStartHour?: number | null;

    @ApiPropertyOptional({
        description: 'Конец ночного окна, час 0-23 по таймзоне портала.',
        example: 6,
        type: Number,
        minimum: 0,
        maximum: 23,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(23)
    nightEndHour?: number | null;

    @ApiPropertyOptional({
        description:
            'ДЕМО-режим: bitrix-id сотрудников, чьи звонки анализируются. ' +
            'Пустой массив или null — весь отдел продаж.',
        example: [222, 323],
        type: [Number],
        nullable: true,
    })
    @IsOptional()
    @IsArray()
    @IsInt({ each: true })
    @Min(1, { each: true })
    allowedUserIds?: number[] | null;
}
