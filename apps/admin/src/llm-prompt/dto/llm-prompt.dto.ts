import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsIn,
    IsNotEmpty,
    IsOptional,
    IsString,
    MaxLength,
} from 'class-validator';
import type { StructuredLlmUsage } from '@lib/llm-gateway';
import {
    LLM_PROMPT_LIMITS,
    LLM_PROMPT_TARGET_KINDS,
    LLM_PROMPT_TARGETS,
    type LlmPromptTarget,
    type LlmPromptTargetKind,
} from '../llm-prompt.const';
import type {
    LlmPromptResult,
    LlmPromptTargetInfo,
} from '../services/llm-prompt.service';

/** Запрос ручки «любой промпт любой моделью». */
export class LlmPromptRunDto {
    @ApiProperty({
        description:
            'Исполнитель: auto — порядок провайдеров разборов портала (или ' +
            'общий приложения); vibecode / openai-compatible — один провайдер ' +
            'шлюза разборов; gigachat / cloudru / openai / ollama — модель ' +
            'контура резюме напрямую, обычным текстом.',
        enum: LLM_PROMPT_TARGETS,
        example: 'auto',
    })
    @IsString()
    @IsIn(LLM_PROMPT_TARGETS)
    target: LlmPromptTarget;

    @ApiPropertyOptional({
        description:
            'Домен портала: по нему берутся ключи (VibeCode, свой ' +
            'OpenAI-совместимый сервис) и порядок провайдеров. Пусто — общие ' +
            'ключи приложения; VibeCode без портала недоступен.',
        type: String,
        example: 'garant.bitrix24.ru',
        maxLength: LLM_PROMPT_LIMITS.domain,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LLM_PROMPT_LIMITS.domain)
    domain?: string;

    @ApiPropertyOptional({
        description:
            'Системный промпт: роль, правила и формат ответа. Пусто — ' +
            'нейтральный ассистент, отвечающий по-русски.',
        type: String,
        example: 'Ты — ревизор качества звонков. Отвечай списком.',
        maxLength: LLM_PROMPT_LIMITS.systemPrompt,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LLM_PROMPT_LIMITS.systemPrompt)
    systemPrompt?: string;

    @ApiProperty({
        description:
            'Текст запроса: сам промпт либо данные, к которым применяется ' +
            'системный промпт (расшифровка звонка, документ).',
        type: String,
        example:
            'Сделай краткое резюме разговора и три рекомендации менеджеру.',
        maxLength: LLM_PROMPT_LIMITS.userContent,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(LLM_PROMPT_LIMITS.userContent)
    userContent: string;

    @ApiPropertyOptional({
        description:
            'Имя модели для VibeCode (как в настройке «Модель глубокого ' +
            'разбора», например bitrix/bitrixgpt-5.5). Остальные исполнители ' +
            'поле игнорируют: у них модель задана адресом сервиса.',
        type: String,
        example: 'bitrix/bitrixgpt-5.5',
        maxLength: LLM_PROMPT_LIMITS.model,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LLM_PROMPT_LIMITS.model)
    model?: string;
}

/** Расход токенов одного вызова. */
export class LlmPromptUsageDto implements StructuredLlmUsage {
    @ApiProperty({
        description: 'Токены запроса; null — провайдер не сообщил.',
        type: Number,
        nullable: true,
        example: 812,
    })
    promptTokens: number | null;

    @ApiProperty({
        description: 'Токены ответа; null — провайдер не сообщил.',
        type: Number,
        nullable: true,
        example: 240,
    })
    completionTokens: number | null;

    @ApiProperty({
        description: 'Всего токенов; null — провайдер не сообщил.',
        type: Number,
        nullable: true,
        example: 1052,
    })
    totalTokens: number | null;
}

/** Ответ модели на произвольный промпт. */
export class LlmPromptRunResultDto implements LlmPromptResult {
    @ApiProperty({
        description: 'Ответ модели обычным текстом.',
        type: String,
        example: 'Клиент заинтересован в системе для бухгалтерии…',
    })
    text: string;

    @ApiProperty({
        description:
            'Кто ответил: код провайдера шлюза (vibecode, openai-compatible, ' +
            'ai-rag) либо модель контура резюме (gigachat, cloudru, openai, ' +
            'ollama).',
        type: String,
        example: 'vibecode',
    })
    provider: string;

    @ApiProperty({
        description: 'Фактическая модель; null — провайдер не сообщил.',
        type: String,
        nullable: true,
        example: 'bitrix/bitrixgpt-5.5',
    })
    model: string | null;

    @ApiProperty({
        description: 'Время ответа, мс.',
        type: Number,
        example: 4321,
    })
    elapsedMs: number;

    @ApiProperty({
        description:
            'Расход токенов; null — исполнитель его не отдаёт (модели ' +
            'контура резюме).',
        type: LlmPromptUsageDto,
        nullable: true,
    })
    usage: LlmPromptUsageDto | null;
}

/** Параметры списка исполнителей. */
export class LlmPromptTargetsQueryDto {
    @ApiPropertyOptional({
        description:
            'Домен портала — для проверки, настроены ли провайдеры шлюза ' +
            'именно для него. Пусто — общие ключи приложения.',
        type: String,
        example: 'garant.bitrix24.ru',
        maxLength: LLM_PROMPT_LIMITS.domain,
    })
    @IsOptional()
    @IsString()
    @MaxLength(LLM_PROMPT_LIMITS.domain)
    domain?: string;
}

/** Один исполнитель с подписью и готовностью для домена. */
export class LlmPromptTargetDto implements LlmPromptTargetInfo {
    @ApiProperty({
        description: 'Код исполнителя — значение поля target запроса.',
        enum: LLM_PROMPT_TARGETS,
        example: 'vibecode',
    })
    code: LlmPromptTarget;

    @ApiProperty({
        description: 'Название для формы.',
        type: String,
        example: 'VibeCode Битрикса',
    })
    title: string;

    @ApiProperty({
        description: 'Чьи ключи и как считается ответ.',
        type: String,
        example: 'Ключ VibeCode портала. Без портала недоступен.',
    })
    description: string;

    @ApiProperty({
        description:
            'Вид исполнителя: gateway — провайдер шлюза разборов (ответ ' +
            'через схему «один текст»); model — модель контура резюме ' +
            'напрямую.',
        enum: LLM_PROMPT_TARGET_KINDS,
        example: 'gateway',
    })
    kind: LlmPromptTargetKind;

    @ApiProperty({
        description: 'Принимает ли исполнитель имя модели из запроса.',
        type: Boolean,
        example: true,
    })
    acceptsModel: boolean;

    @ApiProperty({
        description:
            'Почему исполнитель недоступен для домена (нет ключа, нет ' +
            'портала); null — настроен или проверяется только при вызове.',
        type: String,
        nullable: true,
        example: 'нужен портал: ключ VibeCode хранится у портала',
    })
    issue: string | null;
}

/** Список исполнителей для формы. */
export class LlmPromptTargetsDto {
    @ApiProperty({
        description:
            'Домен, для которого проверялась готовность; null — без портала.',
        type: String,
        nullable: true,
        example: 'garant.bitrix24.ru',
    })
    domain: string | null;

    @ApiProperty({
        description: 'Исполнители в порядке показа.',
        type: [LlmPromptTargetDto],
    })
    targets: LlmPromptTargetDto[];
}
