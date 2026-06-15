/**
 * Публичный API библиотеки авторизации `@lib/auth`.
 *
 * Наружу отдаём только то, что нужно приложениям-потребителям: модуль для
 * подключения, декораторы, типы и (на случай точечного применения) гарды.
 * Внутренние сервисы токена/входа доступны через экспорт модуля.
 */
export { AuthModule } from './auth.module';

// Декораторы
export { Public } from './decorators/public.decorator';
export { Roles } from './decorators/roles.decorator';
export { CurrentUser } from './decorators/current-user.decorator';

// Гарды (на случай точечного @UseGuards; обычно подключаются глобально модулем)
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { RolesGuard } from './guards/roles.guard';

// Сервисы (для приложений, которым нужно выпускать токены, напр. будущая клиентская auth)
export { AuthService } from './services/auth.service';
export { AuthTokenService } from './services/auth-token.service';

// Типы и конфигурация
export { Role, ROLE_VALUES } from './types/role.enum';
export type { AuthUser, AuthJwtPayload } from './types/auth-user.interface';
export type { AuthenticatedRequest } from './types/auth-request.interface';
export type {
    AuthModuleOptions,
    AuthForRootOptions,
} from './config/auth.config';

// DTO
export { LoginDto } from './dto/login.dto';
export { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
