import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InitSupplyUseCase } from './init-supply.use-case';
import { InitSupplyDto } from './dto/init-supply.dto';
import { InitSupplyResponseDto } from './dto/init-supply-response.dto';

@ApiTags('Konstructor')
@Controller('konstructor')
export class InitSupplyController {
    constructor(private readonly initSupplyUseCase: InitSupplyUseCase) {}

    @Post('init-supply')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Запустить процесс поставки (RPA)',
        description:
            'Создаёт или обновляет элемент RPA «Поставка», кладёт договор и ' +
            'счёт в сделку, пишет таймлайн на каждого участника.',
    })
    @ApiBody({ type: InitSupplyDto })
    @ApiOkResponse({ type: InitSupplyResponseDto })
    async initSupply(
        @Body() body: InitSupplyDto,
    ): Promise<InitSupplyResponseDto> {
        return await this.initSupplyUseCase.initSupply(body);
    }
}
