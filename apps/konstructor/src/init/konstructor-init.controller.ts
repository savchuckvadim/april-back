import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PortalSessionProtected } from '@lib/auth';
import { KonstructorInitUseCase } from './konstructor-init.use-case';
import { KonstructorInitDataDto } from './dto/response-init-data.dto';
import { GetInitDataDto } from './dto/request-init-data.dto';

/**
 * Каталог конструктора с ценами. Отдаётся только сессии того портала, чей
 * домен в теле: фрейм получает токен через POST auth/portal-session. Режим —
 * PORTAL_SESSION_GUARD_MODE (report — только лог, enforce — 401/403).
 * Публичная ссылка берёт каталог своей ручкой по токену ссылки.
 */
@ApiTags('Konstructor')
@Controller('konstructor/init')
export class KonstructorInitController {
    constructor(private readonly useCase: KonstructorInitUseCase) {}

    @Post('data')
    @PortalSessionProtected()
    @ApiOperation({
        summary: 'Инициализационные данные для констркутора',
        description:
            'Нужен Bearer сессии портала (POST auth/portal-session), домен ' +
            'сессии должен совпадать с domain тела.',
    })
    @ApiResponse({
        status: 200,
        description: 'Инициализационные данные для констркутора',
        type: KonstructorInitDataDto,
    })
    async init(@Body() body: GetInitDataDto): Promise<KonstructorInitDataDto> {
        return await this.useCase.init(body.domain);
    }
}
