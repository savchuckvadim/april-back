import {
    Body,
    Controller,
    Get,
    HttpCode,
    Param,
    ParseIntPipe,
    Post,
    Query,
} from '@nestjs/common';
import {
    ApiBody,
    ApiConflictResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    ChooseInnRequestDto,
    HideInnRequestDto,
    InnSnapshotQueryDto,
    InnSnapshotResponseDto,
} from '../dto/inn.dto';
import { InnUseCase } from '../use-cases/inn.use-case';

/**
 * Вкладка «ИНН» карточки сделки во фрейме отдела продаж.
 *
 * Истина по ИНН — пара «договор ↔ плательщик», поэтому текущий ИНН живёт на
 * СДЕЛКЕ, а не на компании: у клиента бывают две пары реквизитов (физлицо и
 * ООО), на каждую свой договор. Пул вариантов только пополняется, решение
 * принимает человек — эти ручки и есть его инструмент.
 */
@ApiTags('Inn')
@Controller('inn')
export class InnController {
    constructor(private readonly useCase: InnUseCase) {}

    @Get('deal/:dealId')
    @ApiOperation({
        summary: 'Снимок ИНН сделки',
        description:
            'Всё, что нужно карточке: текущий ИНН с происхождением, пул ' +
            'кандидатов с источниками и человеческими подписями, реквизиты ' +
            'компании и контактов, расхождения плашками, признаки ' +
            'доступности полей и прав, версия снимка и признак «сделка ' +
            'закрыта — только чтение». Ничего не пишет.',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 25221,
    })
    @ApiOkResponse({
        type: InnSnapshotResponseDto,
        description: 'Снимок ИНН сделки.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    snapshot(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Query() query: InnSnapshotQueryDto,
    ): Promise<InnSnapshotResponseDto> {
        return this.useCase.snapshot(dealId, query.domain);
    }

    @Post('deal/:dealId/choose')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выбрать текущий ИНН договора',
        description:
            'Записывает выбор человека в поле «ИНН» сделки, добавляет ' +
            'значение в пул вариантов (пул только пополняется) и оставляет ' +
            'запись в таймлайне — кто, когда и что выбрал. Значения нет ' +
            'среди кандидатов — оно должно быть валидным ИНН, тогда это ' +
            '«добавить вручную». Версия снимка обязательна: если состояние ' +
            'изменилось, ответ 409 и карточку нужно перечитать. Закрытая ' +
            'сделка — тоже 409.',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 25221,
    })
    @ApiBody({
        type: ChooseInnRequestDto,
        description: 'Домен, выбранный ИНН, версия снимка и автор действия.',
    })
    @ApiOkResponse({
        type: InnSnapshotResponseDto,
        description: 'Снимок после записи — можно рисовать сразу.',
    })
    @ApiConflictResponse({
        description:
            'Версия снимка устарела либо сделка закрыта: изменение не принято.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    choose(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Body() dto: ChooseInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        return this.useCase.choose(dealId, dto);
    }

    @Post('deal/:dealId/hide')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Скрыть вариант ИНН или вернуть его',
        description:
            'Прячет вариант из списка («это не наш ИНН») записью в ' +
            'таймлайне сделки; `restore: true` возвращает его обратно. Из ' +
            'пула значение не удаляется: по нему могли уйти документы. ' +
            'Текущий ИНН скрыть нельзя — сначала выбирают другой (409). ' +
            'Закрытая сделка — только чтение (409).',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 25221,
    })
    @ApiBody({
        type: HideInnRequestDto,
        description: 'Домен, ИНН-вариант, автор действия и признак возврата.',
    })
    @ApiOkResponse({
        type: InnSnapshotResponseDto,
        description: 'Снимок после изменения списка вариантов.',
    })
    @ApiConflictResponse({
        description: 'Сделка закрыта либо попытка скрыть текущий ИНН договора.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    hide(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Body() dto: HideInnRequestDto,
    ): Promise<InnSnapshotResponseDto> {
        return this.useCase.hide(dealId, dto);
    }
}
