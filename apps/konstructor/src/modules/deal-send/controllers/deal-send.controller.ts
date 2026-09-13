import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DealSendDto, DealSendResponseDto } from '../dto/deal-send.dto';
import { DealSendUseCase } from '../use-cases/deal-send.use-case';

@ApiTags('KonstructorDealSend')
@Controller('konstructor/deal-send')
export class DealSendController {
    constructor(private readonly useCase: DealSendUseCase) {}

    @Post()
    @HttpCode(200)
    @ApiOperation({
        summary: 'Отправить сделку конструктора в Bitrix',
        description:
            'Создаёт сделку, если dealId не передан, и записывает в неё поля и товарные строки. Поля приходят кодами pbx-канона — идентификаторы полей резолвятся по схеме портала, фронту знать их не нужно. Сделка создаётся синхронно (её id нужен фронту сразу), запись полей и строк уходит в очередь.',
    })
    @ApiBody({
        type: DealSendDto,
        description: 'Состояние сделки из конструктора.',
    })
    @ApiOkResponse({
        type: DealSendResponseDto,
        description:
            'Сделка, в которую пишем, признак создания и коды полей, которых нет на портале.',
    })
    async send(@Body() body: DealSendDto): Promise<DealSendResponseDto> {
        return await this.useCase.execute(body);
    }
}
