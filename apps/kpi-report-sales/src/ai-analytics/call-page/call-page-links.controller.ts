import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { RequesterAccessService } from '../domain/access/requester-access.service';
import { CallPageLinksUseCase } from './call-page-links.use-case';
import { CALL_PAGE_LINKS_ROUTE } from './call-page.const';
import {
    CallPageLinksRequestDto,
    CallPageLinksResponseDto,
} from './dto/call-page-links.dto';

/**
 * Ссылки на страницы разбора для списков звонков в приложении «Отчёт». В
 * отличие от самой страницы — под сессией портала и с проверкой периметра:
 * ссылка открывает звонок без входа, поэтому получить её может только тот,
 * кому этот звонок и так виден на витрине.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class CallPageLinksController {
    constructor(
        private readonly access: RequesterAccessService,
        private readonly links: CallPageLinksUseCase,
    ) {}

    @PortalSessionProtected()
    @Post(CALL_PAGE_LINKS_ROUTE)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Ссылки на страницы разбора для списка звонков',
        description:
            'По номерам расшифровок из списков витрины возвращает адреса ' +
            'страниц разбора на сайте «Отчёта». Ссылки выдаются только на ' +
            'звонки этого портала и менеджеров из периметра видимости ' +
            'пользователя (как у остальных ручек витрины: руководителю — ' +
            'его отдел, менеджеру — свои звонки при включённом самопросмотре, ' +
            'иначе 403). Номера вне периметра и несуществующие в ответ не ' +
            'попадают. Только чтение базы.',
    })
    @ApiBody({ type: CallPageLinksRequestDto })
    @ApiOkResponse({ type: CallPageLinksResponseDto })
    async getLinks(
        @Body() dto: CallPageLinksRequestDto,
    ): Promise<CallPageLinksResponseDto> {
        const access = await this.access.resolveViewer(
            dto.domain,
            dto.requesterUserId,
        );
        return {
            links: await this.links.execute(
                dto.domain,
                dto.transcriptionIds,
                access,
            ),
        };
    }
}
