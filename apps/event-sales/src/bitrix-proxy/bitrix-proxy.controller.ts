import {
    Body,
    Controller,
    HttpCode,
    Param,
    Post,
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
import {
    AGENT_API_KEY_HEADER,
    AgentKeyGuard,
    AgentRequest,
} from '../agent-gate/guards/agent-key.guard';
import { BitrixProxyService } from './bitrix-proxy.service';
import {
    BitrixProxyCallDto,
    BitrixProxyCallResponseDto,
} from './dto/bitrix-proxy.dto';

/**
 * Agent API: прокси произвольных методов REST API Bitrix. Позволяет
 * внешнему агенту вызвать любой метод Bitrix на портале по его домену.
 * Доступ — по ключу агента (env AGENT_API_KEYS) с доменной изоляцией:
 * ключ с ограничением по доменам может вызывать методы только на них.
 */
@ApiTags('Agent API')
@ApiHeader({
    name: AGENT_API_KEY_HEADER,
    description: 'Ключ внешнего агента (env AGENT_API_KEYS).',
    required: true,
})
@UseGuards(AgentKeyGuard)
@Controller('agent/bitrix/:domain')
export class BitrixProxyController {
    constructor(private readonly bitrixProxyService: BitrixProxyService) {}

    @Post('call')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Вызвать произвольный метод REST API Bitrix на портале',
        description:
            'Инициализирует Bitrix-инстанс по домену портала (PBXService, ' +
            'вебхук или OAuth маркетплейса — автоматически) и выполняет ' +
            'переданный метод с переданными параметрами через универсальный ' +
            'bitrix.api.call(). Ответ Bitrix возвращается как есть. Домен ' +
            'проверяется по доменной изоляции ключа агента.',
    })
    @ApiParam({
        name: 'domain',
        description: 'Домен портала Bitrix, на котором нужно выполнить метод.',
        example: 'example.bitrix24.ru',
    })
    @ApiBody({
        type: BitrixProxyCallDto,
        description: 'Имя метода Bitrix и его параметры.',
    })
    @ApiOkResponse({
        type: BitrixProxyCallResponseDto,
        description: 'Метод выполнен, ответ Bitrix в поле result.',
    })
    async call(
        @Param('domain') domain: string,
        @Body() dto: BitrixProxyCallDto,
        @Req() request: AgentRequest,
    ): Promise<BitrixProxyCallResponseDto> {
        const result = await this.bitrixProxyService.call(
            domain,
            dto.method,
            dto.params,
            request.agentDomains,
        );

        return { domain, method: dto.method, result };
    }
}
