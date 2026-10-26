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
    ApiBadRequestResponse,
    ApiBody,
    ApiConflictResponse,
    ApiNotFoundResponse,
    ApiOkResponse,
    ApiOperation,
    ApiParam,
    ApiTags,
} from '@nestjs/swagger';
import {
    AlignInnRequestDto,
    ChooseInnRequestDto,
    HideInnRequestDto,
    InnAlignResponseDto,
    InnSnapshotQueryDto,
    InnSnapshotResponseDto,
} from '../dto/inn.dto';
import { InnSetResponseDto, SetInnRequestDto } from '../dto/inn-set.dto';
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
            'закрыта — только чтение». Пустую сторону текущего ИНН ' +
            '(сделка или компания) дописывает из другой, из реквизита ' +
            'компании или заявки — один раз, с записью в таймлайне.',
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

    @Post('set')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Записать ИНН из шапки «Звонков»',
        description:
            'ИНН, введённый руками в шапке. Есть открытая сделка — запись как ' +
            'при «Выбрать» во вкладке «ИНН»: сделка, её пул, компания поверх ' +
            'прежнего, пустые заявки и запись в ленте сделки. Сделки нет или ' +
            'она закрыта — пишется компания, без неё заявка: текущий ИНН ' +
            'поверх прежнего, пул объединением. Пишет сервер, поэтому права ' +
            'сотрудника на компанию не нужны.',
    })
    @ApiBody({
        type: SetInnRequestDto,
        description: 'Домен, ИНН, открытые сущности и автор.',
    })
    @ApiOkResponse({
        type: InnSetResponseDto,
        description: 'Куда записан ИНН и что записать не удалось.',
    })
    @ApiBadRequestResponse({
        description:
            'Значение не ИНН либо записать некуда (поля ИНН нет у сущности).',
    })
    @ApiConflictResponse({
        description:
            'Сделка закрыта, а компании и заявки нет: ИНН договора только ' +
            'читается.',
    })
    set(@Body() dto: SetInnRequestDto): Promise<InnSetResponseDto> {
        return this.useCase.set(dto);
    }

    @Post('deal/:dealId/align')
    @HttpCode(200)
    @ApiOperation({
        summary: 'Выровнять текущий ИНН сделки без вкладки «ИНН»',
        description:
            'Фрейм зовёт, когда у сделки с компанией текущий ИНН пуст. Лёгкое ' +
            'чтение (сделка, компания, её реквизиты) и то же правило, что у ' +
            'снимка: пусто в сделке — берётся ИНН компании, иначе ИНН ' +
            'реквизита компании (привязанного к сделке или единственного), ' +
            'и записывается в сделку, её пул и пустое поле компании с ' +
            'записью в таймлайне. Закрытую сделку не трогает.',
    })
    @ApiParam({
        name: 'dealId',
        description: 'Id сделки в Битриксе.',
        type: Number,
        example: 25221,
    })
    @ApiBody({ type: AlignInnRequestDto, description: 'Домен портала.' })
    @ApiOkResponse({
        type: InnAlignResponseDto,
        description: 'Текущий ИНН сделки после выравнивания.',
    })
    @ApiNotFoundResponse({
        description: 'Сделка не найдена или недоступна интеграции.',
    })
    align(
        @Param('dealId', ParseIntPipe) dealId: number,
        @Body() dto: AlignInnRequestDto,
    ): Promise<InnAlignResponseDto> {
        return this.useCase.align(dealId, dto.domain);
    }
}
