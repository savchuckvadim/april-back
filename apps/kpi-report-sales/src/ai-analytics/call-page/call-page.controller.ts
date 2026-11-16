import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import {
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiProduces,
    ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import {
    AI_ANALYTICS_ROUTE_PREFIX,
    AI_ANALYTICS_SWAGGER_TAG,
} from '../constants/ai-analytics.const';
import { CallPageAudioService } from './call-page-audio.service';
import { CALL_PAGE_AUDIO_ROUTE, CALL_PAGE_ROUTE } from './call-page.const';
import { CallPageUseCase } from './call-page.use-case';
import { CallPageDto } from './dto/call-page.dto';

const TOKEN_PARAM = {
    name: 'token',
    description:
        'Ссылка-пропуск звонка: хвост адреса страницы /call/{token}. ' +
        'Выдаётся в карточке разбора и в сделке.',
    example: '1g9gd-3q2x8Yk0mXo1p7cT5vB9nW4sZ6aQeR',
} as const;

/**
 * Страница разбора звонка на сайте «Отчёта». Ручки открытые: страницу
 * открывают по ссылке без входа, поэтому доступ проверяется подписью в
 * самой ссылке. Вызывает сервер сайта (Next), адрес бэкенда и адрес записи
 * в Битриксе в браузер не попадают.
 */
@ApiTags(AI_ANALYTICS_SWAGGER_TAG)
@Controller(AI_ANALYTICS_ROUTE_PREFIX)
export class CallPageController {
    constructor(
        private readonly page: CallPageUseCase,
        private readonly audio: CallPageAudioService,
    ) {}

    @Get(CALL_PAGE_ROUTE)
    @ApiOperation({
        summary: 'Страница разбора звонка по ссылке',
        description:
            'Готовая карточка звонка: шапка (менеджер, время, тип), оценка, ' +
            'итоги разговора, разделы с советами, возражения, проверка по ' +
            'методике, расшифровка по репликам и подсветки — места разбора, ' +
            'уже привязанные к репликам (по времени в звонке, иначе по ' +
            'тексту цитаты). Подписи по-русски, коды справочников наружу не ' +
            'отдаются. Ссылка неверная или отозвана — 404.',
    })
    @ApiParam(TOKEN_PARAM)
    @ApiOkResponse({
        type: CallPageDto,
        description: 'Карточка звонка, готовая к показу.',
    })
    @ApiNotFoundResponse({
        description:
            'Ссылка недействительна или отозвана, либо по звонку нет разбора.',
    })
    async getPage(@Param('token') token: string): Promise<CallPageDto> {
        return this.page.load(token);
    }

    @Get(CALL_PAGE_AUDIO_ROUTE)
    @ApiOperation({
        summary: 'Запись разговора для страницы звонка',
        description:
            'Отдаёт запись потоком через наш сервер и поддерживает перемотку ' +
            '(заголовок Range): если портал не умеет отдавать кусок файла, ' +
            'кусок вырезается на лету. Адрес файла в Битриксе не раскрывается. ' +
            'Записи нет или ссылка недействительна — 404.',
    })
    @ApiParam(TOKEN_PARAM)
    @ApiProduces('audio/mpeg')
    @ApiOkResponse({
        description:
            'Запись целиком (200) или запрошенный кусок (206, с заголовком ' +
            'Content-Range).',
        schema: { type: 'string', format: 'binary' },
    })
    @ApiNotFoundResponse({
        description: 'Ссылка недействительна либо записи у звонка нет.',
    })
    async getAudio(
        @Param('token') token: string,
        @Headers('range') range: string | undefined,
        @Res() res: Response,
    ): Promise<void> {
        const audio = await this.audio.open(token, range);
        res.status(audio.status).set(audio.headers);
        if (audio.body === null) {
            res.end();
            return;
        }
        // res — в обход общего конверта ответа; браузер ушёл — поток гасим.
        res.on('close', () => audio.body?.destroy());
        audio.body.on('error', () => res.destroy());
        audio.body.pipe(res);
    }
}
