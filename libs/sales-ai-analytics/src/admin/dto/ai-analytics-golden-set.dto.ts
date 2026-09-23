/**
 * DTO ручек `GET admin/ai-analytics/golden-set` и
 * `POST admin/ai-analytics/golden-set/run` (план Фазы 3, П5 ↔ П7):
 * состав отчётов согласия оценщика и запуск повторного прогона.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';
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
            'Подключён ли запуск повторного прогона. Сейчас false: ' +
            'прогон живёт в apps/event-sales и подключается потоком П7.',
        example: false,
        type: Boolean,
    })
    runAvailable: boolean;

    @ApiProperty({
        description: 'Что делать, если запуск ещё не подключён.',
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
        description: 'Поставлена ли джоба прогона. Сейчас всегда false.',
        example: false,
        type: Boolean,
    })
    dispatched: false;

    @ApiProperty({
        description: 'Идентификатор джобы; сейчас всегда null.',
        example: null,
        type: String,
        nullable: true,
    })
    jobId: null;

    @ApiProperty({
        description: 'Почему прогон не запущен.',
        example:
            'Прогон test-retest подключается потоком П7: отбор выборки и ' +
            'повторный разбор живут в apps/event-sales.',
        type: String,
    })
    reason: string;
}
