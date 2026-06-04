import { Controller, Get } from '@nestjs/common';

/**
 * Общий health-контроллер для всех приложений монорепо.
 * С глобальным префиксом 'api' доступен по GET /api/health
 * и используется в docker healthcheck.
 */
@Controller('health')
export class HealthController {
    @Get()
    healthCheck(): { status: string } {
        return { status: 'ok' };
    }
}
