/**
 * Админ-ручка «Отзывы о разборах» (этап 4 техрешения
 * 2026-11-19-call-reviews-design.md): отзывы руководителей о разборах
 * звонков портала за период и сводка. Подключается только через
 * `SalesAiAnalyticsAdminModule` в apps/admin (ai/rules/app-api-surface.md).
 */
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
    ApiBearerAuth,
    ApiOkResponse,
    ApiOperation,
    ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '@lib/auth';
import {
    AI_ANALYTICS_ADMIN_PATH,
    AI_ANALYTICS_ADMIN_ROLES,
    AI_ANALYTICS_ADMIN_TAG,
} from '../controllers/admin-controller.const';
import { CallReviewsAdminService } from './call-reviews-admin.service';
import { CallReviewsAdminPageDto } from './dto/call-reviews-admin-page.dto';
import { CallReviewsAdminQueryDto } from './dto/call-reviews-admin-query.dto';

@ApiTags(AI_ANALYTICS_ADMIN_TAG)
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...AI_ANALYTICS_ADMIN_ROLES)
@Controller(AI_ANALYTICS_ADMIN_PATH)
export class AiAnalyticsCallReviewsAdminController {
    constructor(private readonly reviews: CallReviewsAdminService) {}

    @ApiOperation({
        summary: 'Отзывы руководителей о разборах звонков за период',
        description:
            'Актуальные отзывы руководителей и суперпользователей (вид ' +
            'call_review обратной связи) по порталу за период дней по ' +
            'Москве, свежие первыми: звонок с публичной ссылкой на ' +
            'страницу разбора, менеджер, автор и роль, оценка AI и ' +
            'руководителя, согласие, замечания «не так» и комментарий ' +
            'целиком. Фильтры — согласие (all / yes / no) и вид замечания. ' +
            'Сводка в том же ответе считается по всему периоду без ' +
            'фильтров: число отзывов и несогласий, средние оценки и ' +
            'разница, замечания по видам, топ-10 пунктов. Замещённые ' +
            '(прежние отзывы того же автора по звонку) не считаются.',
    })
    @ApiOkResponse({
        description: 'Страница отзывов и сводка за период.',
        type: CallReviewsAdminPageDto,
    })
    @Get('call-reviews')
    async list(
        @Query() query: CallReviewsAdminQueryDto,
    ): Promise<CallReviewsAdminPageDto> {
        return this.reviews.page(query);
    }
}
