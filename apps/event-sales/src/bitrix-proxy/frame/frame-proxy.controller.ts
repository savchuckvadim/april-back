import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiBody,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    FrameProxyBatchDto,
    FrameProxyBatchResponseDto,
    FrameProxyCallDto,
    FrameProxyCallResponseDto,
} from './dto/frame-proxy.dto';
import { FrameProxyService } from './frame-proxy.service';

/**
 * Работа «Звонков» через сервер: фрейм шлёт сюда запросы к Битрикс24,
 * когда у сотрудника не хватает прав на портале. Доступ — только своей
 * portal-context сессией, проверка всегда (без режима «только лог»).
 */
@ApiTags('Звонки: работа через сервер')
@ApiBearerAuth()
@PortalSessionProtected({ enforce: true })
@Controller('bitrix-proxy/frame')
export class FrameProxyController {
    constructor(private readonly frameProxy: FrameProxyService) {}

    @Post('call')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выполнить метод Битрикс24 за фрейм',
        description:
            'Сервер выполняет метод вебхуком портала и возвращает ответ ' +
            'Битрикса как есть (ok = true) или его ошибку (ok = false). ' +
            'Разрешены только методы приложения «Звонки»; каждый вызов ' +
            'пишется в журнал с доменом и пользователем.',
    })
    @ApiBody({ type: FrameProxyCallDto, description: 'Метод и параметры.' })
    @ApiOkResponse({
        type: FrameProxyCallResponseDto,
        description: 'Ответ Битрикса или его ошибка.',
    })
    call(@Body() dto: FrameProxyCallDto): Promise<FrameProxyCallResponseDto> {
        return this.frameProxy.call(dto);
    }

    @Post('batch')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выполнить пакет команд Битрикс24 за фрейм',
        description:
            'Команды в форме фрейма ({ method, params }) сервер собирает в ' +
            'batch Битрикса (по 50) и возвращает результаты и ошибки по ' +
            'ключам команд. Ссылки $result[ключ] работают внутри пачки.',
    })
    @ApiBody({ type: FrameProxyBatchDto, description: 'Команды пакета.' })
    @ApiOkResponse({
        type: FrameProxyBatchResponseDto,
        description: 'Результаты и ошибки команд по ключам.',
    })
    batch(
        @Body() dto: FrameProxyBatchDto,
    ): Promise<FrameProxyBatchResponseDto> {
        return this.frameProxy.batch(dto);
    }
}
