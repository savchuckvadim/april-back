import { Module } from '@nestjs/common';
import { RedisModule } from '@lib/core/redis/redis.module';
import { OpenCardOnceGuard } from './open-card-once.guard';

/** Страж «недавно уже делали» для действий при открытии карточки. */
@Module({
    imports: [RedisModule],
    providers: [OpenCardOnceGuard],
    exports: [OpenCardOnceGuard],
})
export class OpenCardOnceModule {}
