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

// Portal-context сессия фрейма Bitrix24: обмен AUTH_ID на JWT и guard
// мутирующих ручек (kpi-report-sales и другие витрины во фрейме).
export {
    PortalSessionModule,
    PortalSessionApiModule,
} from './portal-session/portal-session.module';
export { PortalSessionService } from './portal-session/portal-session.service';
export {
    PortalSessionGuard,
    type PortalSessionRequest,
} from './portal-session/portal-session.guard';
export {
    PortalSessionProtected,
    PORTAL_SESSION_UNAUTHORIZED_DESCRIPTION,
    PORTAL_SESSION_FORBIDDEN_DESCRIPTION,
} from './portal-session/portal-session.decorator';
export { BitrixProfileClient } from './portal-session/bitrix-profile.client';
export {
    PortalSessionOpenDto,
    PortalSessionDto,
    PortalSessionUserDto,
} from './portal-session/dto/portal-session.dto';
export {
    PORTAL_SESSION_GUARD_MODES,
    PORTAL_SESSION_GUARD_MODE_DEFAULT,
    PORTAL_SESSION_GUARD_MODE_ENV,
    PORTAL_SESSION_ROUTE,
    PORTAL_SESSION_SWAGGER_TAG,
    PORTAL_SESSION_REJECT_REASONS,
    PORTAL_SESSION_OPEN_FAILURES,
    parsePortalSessionGuardMode,
    normalizePortalDomain,
    type PortalSessionGuardMode,
    type PortalSessionRejectReason,
    type PortalSessionOpenFailure,
} from './portal-session/portal-session.const';
export type {
    PortalSession,
    PortalSessionUser,
    PortalSessionOpenInput,
    PortalSessionOpenResult,
} from './portal-session/portal-session.types';

// DTO
export { LoginDto } from './dto/login.dto';
export { AuthResponseDto, AuthUserDto } from './dto/auth-response.dto';
