import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    Max,
    Min,
} from 'class-validator';

/** Установка смарт-процесса «AI-анализ звонков» на портал. */
export class InstallCallReportSmartDto {
    @ApiProperty({
        description:
            'Домен портала Bitrix24, на который устанавливается смарт-процесс. ' +
            'По нему PBXService выдаёт инстанс Bitrix с ключами доступа.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;
}

/** Ручной запуск скана звонков домена (наполнение до включения крона). */
export class ScanCallsDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24, звонки которого сканируются.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'Минимальная длительность звонка в секундах: короче — не анализируем ' +
            '(приоритет — длинные звонки/презентации). По умолчанию из env ' +
            'CALL_REPORT_MIN_DURATION_SEC (300).',
        example: 300,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    minDurationSec?: number;

    @ApiPropertyOptional({
        description:
            'Окно поиска звонков назад в часах. По умолчанию из env ' +
            'CALL_REPORT_WINDOW_HOURS (25).',
        example: 25,
        type: Number,
        minimum: 1,
        maximum: 720,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(720)
    windowHours?: number;

    @ApiPropertyOptional({
        description:
            'Максимум звонков, поставленных в очередь за один скан — защита ' +
            'бюджета транскрибации. По умолчанию из env CALL_REPORT_MAX_PER_RUN (10).',
        example: 10,
        type: Number,
        minimum: 1,
        maximum: 100,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(100)
    maxPerRun?: number;
}

/**
 * Ручной запуск анализа звонков (смоук/отладка). Два режима:
 *
 * 1. Прямой — задан activityId (dealId опционален: без него сделка
 *    определяется по владельцу активности).
 * 2. Подбор — activityId нет: звонки ищутся в voximplant-статистике.
 *    Обязателен хотя бы один из dealId / userId; limit — сколько
 *    последних записей взять, maxDurationSec — не длиннее.
 */
export class AnalyzeCallDto {
    @ApiProperty({
        description: 'Домен портала Bitrix24.',
        example: 'april-garant.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    domain: string;

    @ApiPropertyOptional({
        description:
            'ID активности-звонка в CRM (crm.activity) — прямой режим. ' +
            'Не задан — включается режим подбора по dealId/userId.',
        example: 781614,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    activityId?: number;

    @ApiPropertyOptional({
        description:
            'ID сделки. В прямом режиме опционален (определяется по ' +
            'активности); в режиме подбора — фильтр «звонки этой сделки». ' +
            'Без activityId и dealId обязателен userId.',
        example: 12345,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    dealId?: number;

    @ApiPropertyOptional({
        description:
            'Bitrix-id менеджера НА ЭТОМ ПОРТАЛЕ (не id из нашей БД) — ' +
            'режим подбора: последние звонки этого менеджера ' +
            '(voximplant PORTAL_USER_ID).',
        example: 7,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    userId?: number;

    @ApiPropertyOptional({
        description:
            'Режим подбора: сколько последних подходящих записей взять ' +
            'и проанализировать (обрабатываются синхронно, по очереди). ' +
            'По умолчанию 1, максимум 10 — защита бюджета транскрибации.',
        example: 1,
        type: Number,
        minimum: 1,
        maximum: 10,
        default: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(10)
    limit?: number;

    @ApiPropertyOptional({
        description:
            'Режим подбора: брать только записи длительностью НЕ БОЛЕЕ, сек.',
        example: 900,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    maxDurationSec?: number;

    @ApiPropertyOptional({
        description:
            'Режим подбора: минимальная длительность записи, сек. ' +
            'По умолчанию 0 (в отличие от cron-скана порог не применяется — ' +
            'смоук должен уметь взять и короткий звонок).',
        example: 60,
        type: Number,
        minimum: 0,
    })
    @IsOptional()
    @IsInt()
    @Min(0)
    minDurationSec?: number;

    @ApiPropertyOptional({
        description:
            'Режим подбора: окно поиска назад в часах. По умолчанию 168 (неделя).',
        example: 168,
        type: Number,
        minimum: 1,
        maximum: 720,
        default: 168,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(720)
    windowHours?: number;

    @ApiPropertyOptional({
        description:
            'Прямой режим: длительность звонка в секундах — влияет на выбор ' +
            'транскрибатора (длинные → Yandex, короткие → Vibecode Whisper). ' +
            'В режиме подбора длительность берётся из voximplant.',
        example: 720,
        type: Number,
        minimum: 1,
    })
    @IsOptional()
    @IsInt()
    @Min(1)
    durationSec?: number;
}
