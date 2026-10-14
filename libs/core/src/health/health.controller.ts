import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { currentAppRole } from '../bootstrap/app-role';
import { HealthResponseDto } from './dto/health-response.dto';

/**
 * Общий health-контроллер для всех приложений монорепо.
 * С глобальным префиксом 'api' доступен по GET /api/health
 * и используется в docker healthcheck.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
    @Get()
    @ApiOperation({
        summary: 'Проверка живости приложения',
        description:
            'Отвечает «ok», пока процесс жив; это проверяет docker healthcheck. ' +
            'Поле role показывает, рабочий это прод («active») или тёплый резерв ' +
            'на зеркале («standby» — кроны и воркеры очередей остановлены).',
    })
    @ApiOkResponse({
        type: HealthResponseDto,
        description: 'Приложение живо; в ответе его роль.',
    })
    healthCheck(): HealthResponseDto {
        return { status: 'ok', role: currentAppRole() };
    }
}
