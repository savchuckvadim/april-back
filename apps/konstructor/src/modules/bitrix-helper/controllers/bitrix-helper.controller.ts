import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
    BitrixMethodDto,
    BitrixMethodResponseDto,
} from '../dto/bitrix-method.dto';
import { BitrixMethodUseCase } from '../use-cases/bitrix-method.use-case';

@ApiTags('KonstructorBitrixHelper')
@Controller('helper/bitrix')
export class BitrixHelperController {
    constructor(private readonly useCase: BitrixMethodUseCase) {}

    @Post('method')
    @HttpCode(200)
    @ApiOperation({
        summary:
            'Вызвать REST-метод Bitrix24 от имени портала (dev-режим легаси-фронта)',
        description:
            'Прокси одного REST-вызова Bitrix24. Ручка только для dev-режима легаси-фронта конструктора: вне iframe Bitrix у фронта нет `BX24.callMethod`, и те же (method, params) он шлёт сюда, а бэк авторизуется на портале через PBXService (вебхук или OAuth маркетплейса). В проде фронт ходит в Bitrix сам — ручка не используется. Замена `helper/bitrix/method` старой сборки back.april-app.ru.',
    })
    @ApiBody({
        type: BitrixMethodDto,
        description: 'Домен портала, имя REST-метода и его параметры.',
    })
    @ApiOkResponse({
        type: BitrixMethodResponseDto,
        description:
            'Поле `result` из ответа Bitrix — как `answer.result` у `BX24.callMethod`.',
    })
    async callMethod(
        @Body() body: BitrixMethodDto,
    ): Promise<BitrixMethodResponseDto> {
        return await this.useCase.execute(body);
    }
}
