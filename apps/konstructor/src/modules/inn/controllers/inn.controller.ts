import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiConflictResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    KonstructorInnSetDto,
    KonstructorInnSetResponseDto,
} from '../dto/inn-set.dto';
import { KonstructorInnSetUseCase } from '../use-cases/inn-set.use-case';

/**
 * ИНН клиента из конструктора. Зеркало ручки `POST inn/set` отдела продаж:
 * тот же сервис записи (`@lib/portal-lib/pbx-inn`), свой адрес в приложении
 * конструктора, чтобы фронту не ходить за ним в чужое приложение.
 */
@ApiTags('KonstructorInn')
@Controller('konstructor/inn')
export class KonstructorInnController {
    constructor(private readonly useCase: KonstructorInnSetUseCase) {}

    @Post('set')
    @HttpCode(200)
    @PortalSessionProtected()
    @ApiOperation({
        summary: 'Записать ИНН клиента при смене текущих реквизитов',
        description:
            'Есть открытая сделка: ИНН пишется в её поле «ИНН» и в пул ' +
            'вариантов (без дублей), следом компания поверх прежнего, пустые ' +
            'заявки и запись в ленте сделки. Сделки нет или она закрыта: ' +
            'пишется компания, без неё заявка, текущий ИНН поверх прежнего, ' +
            'пул объединением. Пишет сервер, поэтому права сотрудника на ' +
            'компанию не нужны. Нужен Bearer сессии портала ' +
            '(POST auth/portal-session), домен сессии должен совпадать с ' +
            'domain тела.',
    })
    @ApiBody({
        type: KonstructorInnSetDto,
        description: 'Домен, ИНН, открытые сущности и автор.',
    })
    @ApiOkResponse({
        type: KonstructorInnSetResponseDto,
        description: 'Куда записан ИНН и что записать не удалось.',
    })
    @ApiBadRequestResponse({
        description:
            'Значение не ИНН либо записать некуда (поля ИНН нет у сущности).',
    })
    @ApiConflictResponse({
        description:
            'Сделка закрыта и нет ни компании, ни заявки: ИНН договора только ' +
            'читается.',
    })
    async set(
        @Body() dto: KonstructorInnSetDto,
    ): Promise<KonstructorInnSetResponseDto> {
        return await this.useCase.execute(dto);
    }
}
