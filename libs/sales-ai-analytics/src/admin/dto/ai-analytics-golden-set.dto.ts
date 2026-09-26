/**
 * DTO ручек `GET admin/ai-analytics/golden-set` и
 * `POST admin/ai-analytics/golden-set/run` (план Фазы 3, П5 ↔ П7):
 * состав отчётов согласия оценщика и запуск повторного прогона.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';
import type {
    GoldenSetEntry,
    GoldenSetResult,
    GoldenSetRunResult,
} from '../services/ai-analytics-golden-set.service';

const trimLower = ({ value }: { value: unknown }): unknown =>
    typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Запрос состава золотого набора по домену. */
export class AiAnalyticsGoldenSetQueryDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;
}

/** Запуск прогона test-retest по домену. */
export class AiAnalyticsGoldenSetRunDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, на котором гонять test-retest.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty({ message: 'domain обязателен' })
    @Transform(trimLower)
    domain: string;

    @ApiPropertyOptional({
        description:
            'Квота пар test-retest (10..1000); не задана — ' +
            'retest_budget_calls реестра.',
        example: 300,
        type: Number,
        minimum: 10,
        maximum: 1000,
    })
    @IsOptional()
    @IsInt()
    @Min(10)
    @Max(1000)
    quota?: number;
}

/** Отчёт согласия в составе набора. */
export class AiAnalyticsGoldenSetEntryDto implements GoldenSetEntry {
    @ApiProperty({
        description: 'Идентификатор записи ais отчёта согласия.',
        example: '994112',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Ключ записи — хэш версии промпта (16 hex-символов).',
        example: '3f2a9c1d7b4e5068',
        type: String,
    })
    periodKey: string;

    @ApiProperty({
        description: 'Версия промпта/рубрики, для которой мерили согласие.',
        example: 'v3.1',
        type: String,
    })
    promptVersion: string;

    @ApiProperty({
        description: 'Пар разборов (первый и второй прогон одного звонка).',
        example: 312,
        type: Number,
    })
    pairs: number;

    @ApiProperty({
        description: 'Квота вызовов на смену версии (retest_budget_calls).',
        example: 300,
        type: Number,
    })
    quota: number;

    @ApiProperty({
        description: 'Уложилась ли выборка в квоту.',
        example: false,
        type: Boolean,
    })
    withinQuota: boolean;

    @ApiProperty({
        description: 'σ_llm к применению: измеренная либо дефолт реестра.',
        example: 0.62,
        type: Number,
    })
    sigmaLlm: number;

    @ApiProperty({
        description:
            'Источник σ_llm: measured — измерена на парах, configured — ' +
            'дефолт реестра (ценз пар не пройден).',
        example: 'measured',
        type: String,
    })
    sigmaSource: string;

    @ApiProperty({
        description: 'Момент формирования отчёта, ISO (UTC).',
        example: '2026-09-18T02:40:00.000Z',
        type: String,
    })
    generatedAt: string;
}

/** Ответ ручки состава набора. */
export class AiAnalyticsGoldenSetResultDto implements GoldenSetResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Отчётов согласия распознанной формы по порталу.',
        example: 2,
        type: Number,
    })
    total: number;

    @ApiProperty({
        description: 'Записей чужой формы (в состав не вошли).',
        example: 0,
        type: Number,
    })
    skipped: number;

    @ApiProperty({
        description: 'Отчёты согласия, свежие первыми.',
        type: [AiAnalyticsGoldenSetEntryDto],
    })
    entries: AiAnalyticsGoldenSetEntryDto[];

    @ApiProperty({
        description:
            'Подключён ли запуск повторного прогона (очередь CALL_REPORT ' +
            'доступна этой сборке).',
        example: true,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Как читать состав и что делает запуск.',
        example:
            'Ручка отдаёт состав уже посчитанных отчётов согласия ' +
            '(ai-analytics-golden-report).',
        type: String,
    })
    hint: string;
}

/** Ответ ручки запуска прогона. */
export class AiAnalyticsGoldenSetRunResultDto implements GoldenSetRunResult {
    @ApiProperty({
        description: 'Домен портала.',
        example: 'april.bitrix24.ru',
        type: String,
    })
    domain: string;

    @ApiProperty({
        description: 'Поставлена ли джоба прогона в очередь CALL_REPORT.',
        example: true,
        type: Boolean,
    })
    dispatched: boolean;

    @ApiProperty({
        description:
            'Идентификатор джобы (один на домен в сутки); null — не поставлена.',
        example: 'call-report-retest:april.bitrix24.ru:2026-09-25',
        type: String,
        nullable: true,
    })
    jobId: string | null;

    @ApiProperty({
        description: 'Почему прогон не запущен; null — запущен.',
        example: null,
        type: String,
        nullable: true,
    })
    reason: string | null;

    @ApiProperty({
        description: 'Квота пар, с которой уйдёт прогон.',
        example: 300,
        type: Number,
    })
    quota: number;
}
