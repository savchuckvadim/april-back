import {
    Body,
    Controller,
    HttpCode,
    Post,
    UnauthorizedException,
} from '@nestjs/common';
import {
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
    ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import {
    PortalSessionOpenDto,
    PortalSessionDto,
} from './dto/portal-session.dto';
import {
    PORTAL_SESSION_ROUTE,
    PORTAL_SESSION_SWAGGER_TAG,
} from './portal-session.const';
import { PortalSessionService } from './portal-session.service';

/**
 * Обмен AUTH_ID фрейма Bitrix24 на portal-context JWT. Открытая ручка
 * (`@Public()` — на случай приложения с глобальным JwtAuthGuard): её
 * защита — живая REST-проверка присланного токена на портале.
 */
@ApiTags(PORTAL_SESSION_SWAGGER_TAG)
@Controller(PORTAL_SESSION_ROUTE)
export class PortalSessionController {
    constructor(private readonly sessions: PortalSessionService) {}

    @Public()
    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Обменять AUTH_ID фрейма Bitrix24 на portal-context JWT',
        description:
            'Фронт во фрейме берёт access_token и domain из BX24.getAuth() и ' +
            'присылает их сюда. Сервер проверяет токен живым REST-вызовом ' +
            'profile на портале (подделанный или просроченный токен профиль ' +
            'не вернёт) и выпускает JWT на общем секрете приложений: ' +
            'role=CLIENT, domain, bitrixUserId, isAdmin. Дальше фронт шлёт ' +
            'его заголовком Authorization: Bearer на мутирующие ручки, ' +
            'где guard сверяет domain и requesterUserId тела с сессией. ' +
            'Срок токена — AUTH_JWT_EXPIRES_IN (по умолчанию 12 часов); по ' +
            'истечении обмен повторяется.',
    })
    @ApiBody({
        type: PortalSessionOpenDto,
        description:
            'Данные BX24.getAuth() из фрейма: домен портала, AUTH_ID ' +
            '(access_token) и необязательный member_id.',
    })
    @ApiOkResponse({
        type: PortalSessionDto,
        description: 'Сессия открыта: токен, срок и пользователь портала.',
    })
    @ApiUnauthorizedResponse({
        description:
            'Битрикс24 не подтвердил токен фрейма либо домен не является ' +
            'именем хоста.',
    })
    async open(@Body() dto: PortalSessionOpenDto): Promise<PortalSessionDto> {
        const result = await this.sessions.open(dto);
        if (!result.ok) throw new UnauthorizedException(result.message);
        return result.session;
    }
}
