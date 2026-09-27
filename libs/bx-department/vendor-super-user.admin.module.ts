import { Module } from '@nestjs/common';
import { RedisModule } from 'src/core/redis/redis.module';
import { VendorSuperUserController } from './controllers/vendor-super-user.controller';
import { VendorSuperUserRepository } from './repositories/vendor-super-user.repository';
import { VendorSuperUserPrismaRepository } from './repositories/vendor-super-user.prisma.repository';
import { BxSuperUserService } from './services/bx-super-user.service';

/**
 * Админ-слой суперпользователей вендора
 * (`admin/portal/:portalId/vendor-super-users`).
 *
 * Отдельный модуль, а не часть {@link BxDepartmentModule}: тот тянет PBX,
 * Bitrix V3 и настройки портала и импортируется прикладными приложениями
 * ради расчёта прав — админ-роуты в их Swagger не нужны
 * (см. ai/rules/app-api-surface.md). Здесь только репозиторий, сервис
 * (ради сброса кэша после правок) и контроллер.
 *
 * Подключать в приложении админки.
 */
@Module({
    imports: [RedisModule],
    controllers: [VendorSuperUserController],
    providers: [
        {
            provide: VendorSuperUserRepository,
            useClass: VendorSuperUserPrismaRepository,
        },
        BxSuperUserService,
    ],
})
export class VendorSuperUserAdminModule {}
