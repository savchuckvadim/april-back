import { ApiProperty } from '@nestjs/swagger';
import { AppRole, APP_ROLE_VALUES } from '../../bootstrap/app-role';

/** Ответ проверки живости приложения. */
export class HealthResponseDto {
    @ApiProperty({
        description:
            'Состояние приложения. Всегда «ok», если процесс отвечает на запросы.',
        type: String,
        example: 'ok',
    })
    status: string;

    @ApiProperty({
        description:
            'Роль процесса: «active» — рабочий прод; «standby» — тёплый резерв на зеркале, кроны и воркеры очередей остановлены.',
        type: String,
        enum: [...APP_ROLE_VALUES],
        example: 'active',
    })
    role: AppRole;
}
