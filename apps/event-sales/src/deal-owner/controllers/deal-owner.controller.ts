import {
    Body,
    Controller,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    AlignDealOwnerRequestDto,
    DealOwnerAlignResultDto,
} from '../dto/deal-owner.dto';
import { DealOwnerUseCase } from '../use-cases/deal-owner.use-case';

/**
 * Компания и контакты клиента — за ответственным сделки, по которой сейчас
 * работают (правило владельца 22.10.2026).
 */
@ApiTags('DealOwner')
@Controller('deal-owner')
export class DealOwnerController {
    constructor(private readonly useCase: DealOwnerUseCase) {}

    @Post('deal/:dealId/align')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Перевести компанию и контакты на ответственного сделки',
        description:
            'Фрейм зовёт при открытии сделки, если она открыта и принадлежит ' +
            'сотруднику. Компания сделки и контакты сделки и компании, у ' +
            'которых другой ответственный, переводятся на ответственного ' +
            'сделки. Чужая или закрытая сделка — ничего не меняется. Пишет ' +
            'сервер, поэтому права сотрудника на компанию не нужны.',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 105819,
    })
    @ApiBody({
        type: AlignDealOwnerRequestDto,
        description: 'Домен портала и сотрудник, открывший сделку.',
    })
    @ApiOkResponse({
        type: DealOwnerAlignResultDto,
        description: 'Что переназначено или почему ничего не менялось.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    align(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Body() dto: AlignDealOwnerRequestDto,
    ): Promise<DealOwnerAlignResultDto> {
        return this.useCase.align(dealId, dto);
    }
}
