import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import {
    ApiBody,
    ApiHeader,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import { BackgroundCalls } from '@lib/core/call-context';
import { SupportDeskService } from '@lib/support';
import {
    SUPPORT_API_KEY_HEADER,
    SupportApiKeyGuard,
    type SupportApiRequest,
} from './guards/support-api-key.guard';
import {
    SupportChatViewResponseDto,
    SupportDialogReadQueryDto,
    SupportDialogsResponseDto,
    SupportDomainQueryDto,
    SupportReplyRequestDto,
    SupportReplyResponseDto,
    SupportTaskRequestDto,
    SupportTaskResponseDto,
} from './dto/support-api.dto';

const CHAT_ID_PARAM = {
    name: 'chatId',
    description: 'Чат диалога линии (из списка диалогов).',
    type: Number,
    example: 769,
} as const;

/**
 * Support API для техспециалиста и ИИ-помощника (MCP april-support):
 * диалоги линии, переписка, ответ клиенту после «да» человека, задача на
 * исправление. Закрыт ключами SUPPORT_API_KEYS.
 */
@ApiTags('Support API')
@ApiHeader({
    name: SUPPORT_API_KEY_HEADER,
    description: 'Ключ Support API (env SUPPORT_API_KEYS).',
    required: true,
})
@BackgroundCalls()
@UseGuards(SupportApiKeyGuard)
@Controller('support')
export class SupportApiController {
    constructor(private readonly desk: SupportDeskService) {}

    @Get('dialogs')
    @ApiOperation({
        summary: 'Открытые диалоги линии поддержки',
        description:
            'Диалоги линии в статусах «новый» и «взят оператором»: клиент, ' +
            'его портал, оператор, сколько минут клиент ждёт ответа, ' +
            'неотвеченное сообщение, ссылки на диалог и карточку CRM.',
    })
    @ApiOkResponse({
        type: SupportDialogsResponseDto,
        description: 'Открытые диалоги.',
    })
    async dialogs(
        @Query() query: SupportDomainQueryDto,
    ): Promise<SupportDialogsResponseDto> {
        return this.desk.listDialogs(query.domain);
    }

    @Get('dialogs/:chatId')
    @ApiOperation({
        summary: 'Переписка диалога',
        description:
            'Последние сообщения чата линии с ролями авторов: клиент, ' +
            'сотрудник, система. Включает прошлые обращения клиента в этом чате.',
    })
    @ApiParam(CHAT_ID_PARAM)
    @ApiOkResponse({
        type: SupportChatViewResponseDto,
        description: 'Переписка чата.',
    })
    async dialog(
        @Param('chatId', ParseIntPipe) chatId: number,
        @Query() query: SupportDialogReadQueryDto,
    ): Promise<SupportChatViewResponseDto> {
        return this.desk.readDialog(chatId, query.limit ?? 30, query.domain);
    }

    @Post('dialogs/:chatId/reply')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ответить клиенту (только после «да» человека)',
        description:
            'Отправляет текст в диалог линии от имени пользователя ключа ' +
            'портала. Если диалог ведёт другой оператор, сначала ' +
            'присоединяется к нему, оператор не меняется. Каждая отправка ' +
            'пишется в журнал и копией — в Telegram-чат поддержки.',
    })
    @ApiParam(CHAT_ID_PARAM)
    @ApiBody({
        type: SupportReplyRequestDto,
        description: 'Подтверждённый текст ответа.',
    })
    @ApiOkResponse({
        type: SupportReplyResponseDto,
        description: 'Ответ отправлен.',
    })
    async reply(
        @Param('chatId', ParseIntPipe) chatId: number,
        @Body() body: SupportReplyRequestDto,
        @Req() request: SupportApiRequest,
    ): Promise<SupportReplyResponseDto> {
        return this.desk.reply(
            chatId,
            body.text.trim(),
            `${body.confirmedBy.trim()} (через ${request.supportClient})`,
            body.domain,
        );
    }

    @Post('tasks')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Задача на исправление',
        description:
            'Создаёт задачу на портале оповещений (april-garant) со ссылкой ' +
            'на диалог клиента.',
    })
    @ApiBody({
        type: SupportTaskRequestDto,
        description: 'Задача и ответственный.',
    })
    @ApiOkResponse({
        type: SupportTaskResponseDto,
        description: 'Задача создана.',
    })
    async task(
        @Body() body: SupportTaskRequestDto,
    ): Promise<SupportTaskResponseDto> {
        return this.desk.createTask(
            {
                title: body.title,
                description: body.description,
                responsibleId: body.responsibleId,
                chatId: body.chatId,
            },
            body.domain,
        );
    }
}
