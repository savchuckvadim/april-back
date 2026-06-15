import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../config/auth.constants';

/**
 * Помечает эндпоинт (или весь контроллер) как открытый: {@link JwtAuthGuard}
 * пропускает запрос без проверки токена. Используйте для login, health-check и т.п.
 *
 * @example
 * ```ts
 * @Public()
 * @Post('login')
 * login() { ... }
 * ```
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
