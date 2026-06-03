import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

/**
 * Контроллер проверки работоспособности сервиса.
 * Используется в docker healthcheck и для мониторинга.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOkResponse({ description: 'Сервис работает' })
    check(): { status: string; service: string; timestamp: string } {
        return {
            status: 'ok',
            service: process.env.SERVICE_NAME ?? 'kpi-report-sales',
            timestamp: new Date().toISOString(),
        };
    }
}
