import {
    Body,
    Controller,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
} from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    AlignClientTypeRequestDto,
    ClientTypeAlignResponseDto,
    ClientTypeStateDto,
    SetClientTypeRequestDto,
} from '../dto/client-type.dto';
import { ClientTypeUseCase } from '../use-cases/client-type.use-case';

/**
 * Тип клиента в шапке «Звонков». Значение одно на клиента: главное — у
 * компании, сделка его повторяет (то же правило, что у ИНН).
 */
@ApiTags('ClientType')
@Controller('client-type')
export class ClientTypeController {
    constructor(private readonly useCase: ClientTypeUseCase) {}

    @Post('deal/:dealId/align')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выровнять тип клиента сделки и компании',
        description:
            'Фрейм зовёт при открытии сделки, когда у сделки или компании тип ' +
            'клиента пуст. Пустая сторона заполняется из заполненной; разные ' +
            'значения не трогаются — это конфликт, его решает человек. ' +
            'Закрытая сделка не меняется.',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 105819,
    })
    @ApiBody({ type: AlignClientTypeRequestDto, description: 'Домен портала.' })
    @ApiOkResponse({
        type: ClientTypeAlignResponseDto,
        description:
            'Тип клиента у сделки и компании после выравнивания; skipped — ' +
            'сервер недавно уже выравнивал.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    align(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Body() dto: AlignClientTypeRequestDto,
    ): Promise<ClientTypeAlignResponseDto> {
        return this.useCase.align(dealId, dto);
    }

    @Post('set')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выбрать тип клиента',
        description:
            'Выбор человека в шапке «Звонков» пишется и в компанию, и в ' +
            'открытую сделку. Закрытая сделка не меняется. Пишет сервер, ' +
            'поэтому права сотрудника на компанию не нужны.',
    })
    @ApiBody({
        type: SetClientTypeRequestDto,
        description: 'Домен, код типа клиента, сделка и компания.',
    })
    @ApiOkResponse({
        type: ClientTypeStateDto,
        description: 'Тип клиента у сделки и компании после записи.',
    })
    @ApiBadRequestResponse({
        description:
            'Записать некуда: поля «Тип Клиента» нет или сделка закрыта, а ' +
            'компании нет.',
    })
    set(@Body() dto: SetClientTypeRequestDto): Promise<ClientTypeStateDto> {
        return this.useCase.set(dto);
    }
}
