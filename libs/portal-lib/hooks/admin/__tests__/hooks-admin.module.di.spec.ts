import { Test } from '@nestjs/testing';
import { PrismaService } from '@/core/prisma';
import { RedisService } from '@/core/redis/redis.service';
import { HooksAdminModule } from '../hooks-admin.module';
import { HooksAdminController } from '../hooks-admin.controller';
import { HookReadinessService } from '../../readiness/hook-readiness.service';
import { HookOperationsService } from '../../monitoring/hook-operations.service';

/**
 * Граф зависимостей админ-модуля хуков собирается: все сервисы,
 * которые нужны готовности (лид/сделка/компания, категории, стадии,
 * настройки), экспортируются импортированными модулями. Redis и БД
 * подменены — тест не открывает соединений.
 */
describe('HooksAdminModule: DI', () => {
    it('модуль компилируется, контроллер и сервисы резолвятся', async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [HooksAdminModule],
        })
            .overrideProvider(RedisService)
            .useValue({ getClient: () => ({}) })
            .overrideProvider(PrismaService)
            .useValue({})
            .compile();

        expect(moduleRef.get(HooksAdminController)).toBeInstanceOf(
            HooksAdminController,
        );
        expect(moduleRef.get(HookReadinessService)).toBeInstanceOf(
            HookReadinessService,
        );
        expect(moduleRef.get(HookOperationsService)).toBeInstanceOf(
            HookOperationsService,
        );
        await moduleRef.close();
    });
});
