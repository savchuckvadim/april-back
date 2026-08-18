import { Module } from '@nestjs/common';
import { PBXModule } from '@/modules/pbx';
import { RedisModule } from '@/core/redis/redis.module';
import { SsRestoreController } from './controllers/ss-restore.controller';
import { SsRestoreUseCase } from './use-cases/ss-restore.use-case';

/**
 * Восстановление потерянных записей «Сервисный сигнал Состоялся»
 * (потери мая-августа 2026, см. dto/use-case). Двухфазник scan/apply/discard.
 */
@Module({
    imports: [PBXModule, RedisModule],
    controllers: [SsRestoreController],
    providers: [SsRestoreUseCase],
})
export class SsRestoreModule {}
