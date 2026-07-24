import { Global, Module } from '@nestjs/common';
import { RedisModule } from '@/core/redis/redis.module';
import { AppCacheService } from './services/app-cache.service';
import { AppCacheController } from './controllers/app-cache.controller';

/**
 * Сервисная часть центрального кэша — БЕЗ контроллера.
 *
 * @Global: импортируется один раз в root-модуль приложения, после чего
 * AppCacheService инжектится в любом модуле без повторных импортов.
 * PrismaService приходит из глобального PrismaModule приложения.
 *
 * Используй этот модуль, когда приложению нужен только сервис —
 * иначе Nest затянет контроллер и его роуты утекут в Swagger приложения
 * (см. предупреждение в root-модулях).
 */
@Global()
@Module({
    imports: [RedisModule],
    providers: [AppCacheService],
    exports: [AppCacheService],
})
export class AppCacheServiceModule {}

/**
 * Полный модуль центрального кэша: сервис + эндпоинты инспекции
 * (POST /app-cache/list|entry|set|delete|reset|purge-expired).
 */
@Module({
    imports: [AppCacheServiceModule],
    controllers: [AppCacheController],
})
export class AppCacheModule {}
