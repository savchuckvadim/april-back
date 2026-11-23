import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { XoLaunchRegistryService } from './xo-launch-registry.service';

/**
 * Реестр запусков холодного обзвона: приём хука и обработчик окна
 * (`ColdHookV2Module`), крон подстраховки (`XoDispatchRescueModule`).
 *
 * RedisModule не глобальный — импорт обязателен, иначе приложение не
 * поднимется (UnknownDependenciesException).
 */
@Module({
    imports: [RedisModule],
    providers: [XoLaunchRegistryService],
    exports: [XoLaunchRegistryService],
})
export class XoLaunchRegistryModule {}
