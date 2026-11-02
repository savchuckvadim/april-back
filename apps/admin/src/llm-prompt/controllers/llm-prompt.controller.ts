import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBadGatewayResponse,
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { CurrentUser, Role, Roles, type AuthUser } from '@lib/auth';
import {
    LLM_PROMPT_ADMIN_PATH,
    LLM_PROMPT_ADMIN_TAG,
} from '../llm-prompt.const';
import {
    LlmPromptRunDto,
    LlmPromptRunResultDto,
    LlmPromptTargetsDto,
    LlmPromptTargetsQueryDto,
} from '../dto/llm-prompt.dto';
import { LlmPromptService } from '../services/llm-prompt.service';

/** Пути ручек — один источник для контроллера и путеводителя. */
export const LLM_PROMPT_ROUTES = {
    targets: 'targets',
    run: 'run',
} as const;

/**
 * Ручка «любой промпт любой моделью» для админки: разовые точечные
 * задачи (проверить формулировку промпта, прогнать документ, сравнить
 * ответы провайдеров) теми же ключами и провайдерами, что и разборы.
 * Хостится ТОЛЬКО в apps/admin (ai/rules/app-api-surface.md); вызов
 * платный — только суперпользователь, логин пишется в журнал.
 */
@ApiTags(LLM_PROMPT_ADMIN_TAG)
@ApiBearerAuth()
@Roles(Role.SUPER_USER)
@Controller(LLM_PROMPT_ADMIN_PATH)
export class LlmPromptController {
    constructor(private readonly service: LlmPromptService) {}

    @Get(LLM_PROMPT_ROUTES.targets)
    @ApiOperation({
        summary: 'Исполнители промпта и их готовность',
        description:
            'Все исполнители с подписями: порядок провайдеров разборов, ' +
            'отдельные провайдеры шлюза и модели контура резюме. С domain ' +
            'проверяется, настроены ли провайдеры шлюза для портала (ключ ' +
            'VibeCode, свой или общий OpenAI-совместимый сервис); сеть не ' +
            'трогается.',
    })
    @ApiOkResponse({
        description: 'Исполнители в порядке показа.',
        type: LlmPromptTargetsDto,
    })
    async targets(
        @Query() query: LlmPromptTargetsQueryDto,
    ): Promise<LlmPromptTargetsDto> {
        const domain = query.domain?.trim() || null;
        return { domain, targets: await this.service.targets(domain) };
    }

    @Post(LLM_PROMPT_ROUTES.run)
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Выполнить произвольный промпт выбранной моделью',
        description:
            'Системный промпт + текст запроса уходят исполнителю: модели ' +
            'контура резюме — напрямую обычным текстом, провайдеры шлюза ' +
            'разборов — через схему «один текстовый ответ». Ответ только ' +
            'возвращается, нигде не сохраняется; расход токенов — как ' +
            'сообщил провайдер.',
    })
    @ApiBody({
        type: LlmPromptRunDto,
        description:
            'Исполнитель, домен портала, системный промпт, текст запроса и ' +
            'имя модели (только для VibeCode).',
    })
    @ApiOkResponse({
        description: 'Ответ модели, кто ответил, время и расход.',
        type: LlmPromptRunResultDto,
    })
    @ApiBadGatewayResponse({
        description:
            'Исполнитель не ответил: нет ключа, провайдер недоступен или ' +
            'отверг запрос — причина в сообщении.',
    })
    run(
        @Body() dto: LlmPromptRunDto,
        @CurrentUser() user?: AuthUser,
    ): Promise<LlmPromptRunResultDto> {
        return this.service.run({
            target: dto.target,
            domain: dto.domain?.trim() || null,
            systemPrompt: dto.systemPrompt ?? null,
            userContent: dto.userContent,
            model: dto.model?.trim() || null,
            requestedBy: user?.login ?? null,
        });
    }
}
