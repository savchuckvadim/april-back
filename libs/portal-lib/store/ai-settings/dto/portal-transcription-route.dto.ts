import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    IsArray,
    IsIn,
    IsInt,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    ValidateNested,
} from 'class-validator';
import {
    AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE,
    AI_TRANSCRIPTION_MAX_FALLBACKS,
    AI_TRANSCRIPTION_MODEL_MAX_LENGTH,
    AI_TRANSCRIPTION_PRIORITIES,
    AI_TRANSCRIPTION_PROVIDERS,
    AiTranscriptionPriority,
    AiTranscriptionProvider,
    AiTranscriptionSlot,
    PortalTranscriptionRoute,
} from '../portal-transcription-route.types';

const PROVIDER_DESCRIPTION =
    'Транскрибатор: yandex — Яндекс SpeechKit, bitrix-vibecode — VibeCode ' +
    'Битрикса (ключ портала), local-whisper — Whisper-совместимый сервис ' +
    'портала или приложения (свой сервер или облако, например Groq).';

/** Одна роль маршрута распознавания: транскрибатор и модель. */
export class AiTranscriptionSlotDto implements AiTranscriptionSlot {
    @ApiProperty({
        description: PROVIDER_DESCRIPTION,
        enum: AI_TRANSCRIPTION_PROVIDERS,
        example: 'local-whisper',
    })
    @IsString()
    @IsIn(AI_TRANSCRIPTION_PROVIDERS as unknown as string[])
    provider: AiTranscriptionProvider;

    @ApiProperty({
        description:
            'Имя модели у этого транскрибатора: у VibeCode — модель ИИ-роутера ' +
            '(например bitrix/bitrixgpt-5.6-transcribe), у Whisper-совместимого ' +
            'сервиса — его модель (whisper-large-v3 точнее, ' +
            'whisper-large-v3-turbo быстрее). Пусто или null — модель ' +
            'транскрибатора по умолчанию; у Яндекса модель не выбирается.',
        example: 'whisper-large-v3-turbo',
        type: String,
        nullable: true,
        maxLength: AI_TRANSCRIPTION_MODEL_MAX_LENGTH,
    })
    @IsOptional()
    @IsString()
    @MaxLength(AI_TRANSCRIPTION_MODEL_MAX_LENGTH)
    model: string | null;
}

/**
 * Маршрут распознавания портала: кто распознаёт длинные и короткие звонки,
 * кто запасной, кто «для скорости» и «для точности». Пустая роль — действует
 * режим транскрибации портала или приложения.
 */
export class PortalTranscriptionRouteDto implements PortalTranscriptionRoute {
    @ApiPropertyOptional({
        description:
            'С какой длительности звонок считается длинным, секунд; null — ' +
            'порог приложения (обычно 600 секунд).',
        example: 600,
        type: Number,
        minimum: AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE.min,
        maximum: AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE.max,
        nullable: true,
    })
    @IsOptional()
    @IsInt()
    @Min(AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE.min)
    @Max(AI_TRANSCRIPTION_LONG_MIN_SEC_RANGE.max)
    longMinSec: number | null;

    @ApiPropertyOptional({
        description:
            'Кто распознаёт длинные звонки; null — как в режиме транскрибации.',
        type: AiTranscriptionSlotDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiTranscriptionSlotDto)
    long: AiTranscriptionSlotDto | null;

    @ApiPropertyOptional({
        description:
            'Кто распознаёт короткие звонки; null — как в режиме транскрибации.',
        type: AiTranscriptionSlotDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiTranscriptionSlotDto)
    short: AiTranscriptionSlotDto | null;

    @ApiPropertyOptional({
        description:
            'Запасные по порядку: подхватывают звонок, когда основной не ' +
            `ответил (не больше ${AI_TRANSCRIPTION_MAX_FALLBACKS}). null — ` +
            'запасные режима транскрибации; пустой список — без запасных.',
        type: [AiTranscriptionSlotDto],
        nullable: true,
    })
    @IsOptional()
    @IsArray()
    @ArrayMaxSize(AI_TRANSCRIPTION_MAX_FALLBACKS)
    @ValidateNested({ each: true })
    @Type(() => AiTranscriptionSlotDto)
    fallbacks: AiTranscriptionSlotDto[] | null;

    @ApiPropertyOptional({
        description:
            'Кто распознаёт все звонки, когда выбран приоритет «скорость»; ' +
            'null — приоритет «скорость» ничего не меняет.',
        type: AiTranscriptionSlotDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiTranscriptionSlotDto)
    fast: AiTranscriptionSlotDto | null;

    @ApiPropertyOptional({
        description:
            'Кто распознаёт все звонки, когда выбран приоритет «точность»; ' +
            'null — приоритет «точность» ничего не меняет.',
        type: AiTranscriptionSlotDto,
        nullable: true,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => AiTranscriptionSlotDto)
    precise: AiTranscriptionSlotDto | null;

    @ApiPropertyOptional({
        description:
            'Что сейчас важнее: normal — по длительности (длинные и короткие), ' +
            'fast — роль «для скорости» на все звонки, precise — роль «для ' +
            'точности» на все звонки. null — normal.',
        enum: AI_TRANSCRIPTION_PRIORITIES,
        example: 'normal',
        nullable: true,
    })
    @IsOptional()
    @IsString()
    @IsIn(AI_TRANSCRIPTION_PRIORITIES as unknown as string[])
    priority: AiTranscriptionPriority | null;
}
