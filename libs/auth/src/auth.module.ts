import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_OPTIONS } from './config/auth.constants';
import { AuthForRootOptions, buildAuthOptions } from './config/auth.config';
import { AuthTokenService } from './services/auth-token.service';
import { AuthService } from './services/auth.service';
import { AuthController } from './controllers/auth.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

/**
 * Переиспользуемый модуль авторизации для приложений монорепо.
 *
 * Подключается один раз в корневом модуле приложения:
 * ```ts
 * imports: [AuthModule.forRoot()]
 * ```
 *
 * Регистрирует глобальные гарды ({@link JwtAuthGuard} → {@link RolesGuard}),
 * поэтому ВСЕ эндпоинты приложения по умолчанию защищены. Открытые эндпоинты
 * помечаются `@Public()`. Полное отключение — через `AUTH_ENABLED=false`.
 */
@Global()
@Module({})
export class AuthModule {
    /**
     * Опции собираются из переменных окружения приложения-потребителя;
     * `override` позволяет точечно их переопределить (напр. в тестах).
     */
    static forRoot(override?: AuthForRootOptions): DynamicModule {
        return {
            module: AuthModule,
            imports: [JwtModule.register({})],
            controllers: [AuthController],
            providers: [
                // useFactory (а не useValue): опции читают process.env на этапе DI —
                // после того как ConfigModule приложения загрузил .env.
                {
                    provide: AUTH_OPTIONS,
                    useFactory: () => buildAuthOptions(override),
                },
                AuthTokenService,
                AuthService,
                // Порядок важен: JwtAuthGuard кладёт user в request,
                // RolesGuard его читает.
                { provide: APP_GUARD, useClass: JwtAuthGuard },
                { provide: APP_GUARD, useClass: RolesGuard },
            ],
            exports: [AuthService, AuthTokenService, AUTH_OPTIONS],
        };
    }
}
