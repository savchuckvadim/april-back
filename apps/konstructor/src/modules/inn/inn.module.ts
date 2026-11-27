import { Module } from '@nestjs/common';
import { PBXModule } from '@lib/pbx';
import { PortalSessionModule } from '@lib/auth';
import { KonstructorInnController } from './controllers/inn.controller';
import { KonstructorInnSetUseCase } from './use-cases/inn-set.use-case';

/**
 * ИНН клиента из конструктора (`POST konstructor/inn/set`).
 *
 * Модуль живёт в приложении конструктора: ручка нужна его фронту, и в
 * Swagger других приложений ей делать нечего (ai/rules/app-api-surface.md).
 * Доменная логика и единственный писатель `op_inn` / `op_inn_pool` живут в
 * `@lib/portal-lib/pbx-inn`.
 *
 * PortalSessionModule даёт guard сессии портала на ручку записи.
 */
@Module({
    imports: [PBXModule, PortalSessionModule],
    controllers: [KonstructorInnController],
    providers: [KonstructorInnSetUseCase],
})
export class KonstructorInnModule {}
