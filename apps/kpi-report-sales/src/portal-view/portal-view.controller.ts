import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
    ApiBadRequestResponse,
    ApiBody,
    ApiForbiddenResponse,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import {
    PortalViewGetRequestDto,
    PortalViewSaveRequestDto,
} from './dto/portal-view-request.dto';
import { PortalViewResponseDto } from './dto/portal-view.dto';
import {
    PORTAL_VIEW_ROUTE_PREFIX,
    PORTAL_VIEW_ROUTES,
    PORTAL_VIEW_SWAGGER_TAG,
} from './portal-view.const';
import { PortalViewUseCase } from './portal-view.use-case';

/**
 * «Настройки отчёта» портала: вкладки, графики и основные бейджи списка
 * разборов, общие для всех пользователей портала. Под сессией портала:
 * читает любой пользователь, меняет руководитель группы и выше.
 */
@ApiTags(PORTAL_VIEW_SWAGGER_TAG)
@Controller(PORTAL_VIEW_ROUTE_PREFIX)
export class PortalViewController {
    constructor(private readonly useCase: PortalViewUseCase) {}

    @PortalSessionProtected()
    @Post(PORTAL_VIEW_ROUTES.get)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Настройки отчёта портала',
        description:
            'Вид отчёта KPI на портале: скрытые вкладки, показ графиков и ' +
            'основные бейджи списка разборов, кто и когда менял их ' +
            'последним, может ли пользователь их менять, ссылка на чат ' +
            'поддержки и варианты для страницы настроек (вкладки, общие ' +
            'бейджи и пункты методики портала). Читать может любой ' +
            'пользователь портала.',
    })
    @ApiBody({
        type: PortalViewGetRequestDto,
        description: 'Домен портала и пользователь, открывший отчёт.',
    })
    @ApiOkResponse({
        type: PortalViewResponseDto,
        description: 'Настройки отчёта, права пользователя и варианты выбора.',
    })
    async getView(
        @Body() dto: PortalViewGetRequestDto,
    ): Promise<PortalViewResponseDto> {
        return this.useCase.get(dto);
    }

    @PortalSessionProtected()
    @Post(PORTAL_VIEW_ROUTES.save)
    @HttpCode(200)
    @ApiOperation({
        summary: 'Сохранить настройки отчёта портала',
        description:
            'Меняет только переданные поля: скрытые вкладки, показ графиков, ' +
            'основные бейджи списка разборов. Запоминает, кто и когда ' +
            'сохранил. Доступно руководителю группы и выше и ' +
            'суперпользователю; остальным — отказ. Возвращает состояние ' +
            'после сохранения в том же виде, что и чтение.',
    })
    @ApiBody({
        type: PortalViewSaveRequestDto,
        description:
            'Домен, пользователь и изменяемые поля (не переданные не меняются).',
    })
    @ApiOkResponse({
        type: PortalViewResponseDto,
        description: 'Настройки отчёта после сохранения.',
    })
    @ApiForbiddenResponse({
        description: 'Настройки отчёта меняет руководитель группы и выше.',
    })
    @ApiBadRequestResponse({
        description:
            'Неизвестный общий бейдж в списке основных либо попытка ' +
            'скрыть сразу все вкладки, которые видят все сотрудники.',
    })
    async saveView(
        @Body() dto: PortalViewSaveRequestDto,
    ): Promise<PortalViewResponseDto> {
        return this.useCase.save(dto);
    }
}
