import { Controller, Get, Res } from '@nestjs/common';
import { PrometheusController } from '@willsoto/nestjs-prometheus';
import { Response } from 'express';
import { Public } from '@lib/auth';

/**
 * Эндпоинт метрик (GET /api/metrics, text-формат Prometheus).
 *
 * Свой контроллер (а не дефолтный из @willsoto) ради @Public():
 * в приложениях с включённой авторизацией (@lib/auth, AUTH_ENABLED=true)
 * глобальный JwtAuthGuard иначе закрыл бы эндпоинт и Prometheus получал бы 401.
 */
@Controller()
export class MetricsController extends PrometheusController {
    @Public()
    @Get()
    async index(
        @Res({ passthrough: true }) response: Response,
    ): Promise<string> {
        return super.index(response);
    }
}
