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
import { REPORT_VIEW_LABEL_LIMITS } from '@lib/portal-lib/store/app-settings';
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
 * «Настройки отчёта» портала: вкладки, графики, основные бейджи списка
 * разборов, свои названия показателей и колонки планов, общие для всех
 * пользователей портала. Под сессией портала:
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
            'Вид отчёта KPI на портале: скрытые вкладки, показ графиков, ' +
            'основные бейджи списка разборов, свои названия показателей и ' +
            'колонки планов, кто и когда менял их последним, может ли ' +
            'пользователь их менять, ссылка на чат поддержки и варианты для ' +
            'страницы настроек (вкладки, общие бейджи, пункты методики и ' +
            'каталог показателей портала). Читать может любой пользователь ' +
            'портала.',
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
            'основные бейджи списка разборов, свои названия показателей ' +
            '(набор целиком), колонки планов. Запоминает, кто и когда ' +
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
            'Неизвестный общий бейдж в списке основных, попытка скрыть ' +
            'сразу все вкладки, которые видят все сотрудники, свои ' +
            'названия с ключом не из каталога показателей портала ' +
            '(«Неизвестный показатель в своих названиях»), ключ не по ' +
            'формату «ev:|call:|plan:<код>», название не строкой, длиннее ' +
            `${REPORT_VIEW_LABEL_LIMITS.nameLength} знаков или больше ` +
            `${REPORT_VIEW_LABEL_LIMITS.entries} записей, неизвестный код ` +
            'или слишком длинный список скрытых колонок планов.',
    })
    async saveView(
        @Body() dto: PortalViewSaveRequestDto,
    ): Promise<PortalViewResponseDto> {
        return this.useCase.save(dto);
    }
}
