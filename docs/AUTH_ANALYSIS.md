# Анализ системы аутентификации проекта

## 📋 Обзор архитектуры

### Текущая структура
- **Модуль**: `src/apps/bitrix-app-client/auth/`
- **Тип аутентификации**: JWT (JSON Web Tokens)
- **Хранение токенов**: Stateless (токены НЕ сохраняются в БД)
- **Механизм**: Cookie-based + Bearer token в заголовках

---

## 🔐 Как работает аутентификация

### 1. Регистрация и вход

#### Регистрация клиента (`POST /api/auth/register-client`)
- Создается `Client` в БД
- Создается первый пользователь-владелец (`User` с `client_id`)
- Отправляется email для подтверждения
- **НЕ создается JWT токен** (только токен подтверждения email)

#### Вход (`POST /api/auth/login`)
```typescript
// auth.service.ts:83-94
async login(dto: LoginDto): Promise<LoginResponseCookieDto> {
    // 1. Проверка email и пароля
    const user = await this.userService.findUserByEmail(dto.email);
    const valid = compare(dto.password, user?.password ?? '');

    // 2. Проверка клиента
    const client = await this.clientService.findById(userDto.client_id);
    if (!client?.is_active) throw new ForbiddenException('Client is inactive');

    // 3. Генерация JWT токена
    const token = this.jwtService.sign({
        sub: userDto.id,      // ID пользователя
        client_id: userDto.client_id  // ID клиента
    });

    return { token, user: userDto, client };
}
```

**Payload JWT токена:**
```json
{
  "sub": 123,           // user.id
  "client_id": 456,     // client.id
  "iat": 1234567890,    // issued at
  "exp": 1234654290     // expires in 24h
}
```

### 2. Хранение токенов

**❌ Токены НЕ сохраняются в БД!**

Токены хранятся:
1. **В cookie браузера** (`access_token`) - через `CookieService`
2. **В памяти клиента** (если используется Bearer token)

**Cookie настройки:**
```typescript
// cookie.service.ts:20-27
res.cookie('access_token', token, {
    httpOnly: true,        // Защита от XSS
    secure: true,          // Только HTTPS
    sameSite: 'none',      // Для кросс-доменных запросов
    domain: '.april-app.ru', // Общий домен для subdomain
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
});
```

### 3. Защита эндпоинтов

#### Guard: `AuthGuard` (`jwt-auth.guard.ts`)

**Как работает:**
1. Извлекает токен из:
   - `Authorization: Bearer <token>` header
   - `access_token` cookie
2. Верифицирует токен через `JwtService.verifyAsync()`
3. Добавляет payload в `request.user`

**Защищенные эндпоинты:**
- `GET /api/auth/me` - получение текущего пользователя
- `POST /api/auth/logout` - выход

**⚠️ Проблема:** Большинство эндпоинтов в `/admin/*` **НЕ защищены!**

---

## 🛡️ Какие эндпоинты защищены

### ✅ Защищенные (с `@UseGuards(AuthGuard)`):
1. `GET /api/auth/me` - получение текущего пользователя
2. `POST /api/auth/logout` - выход

### ❌ НЕ защищенные:
- **Все эндпоинты в `/admin/*`** - открыты для всех!
- `POST /api/auth/register-client` - регистрация (это нормально)
- `POST /api/auth/login` - вход (это нормально)
- `GET /api/auth/confirm/:token` - подтверждение email
- `POST /api/auth/resend-confirmation`
- `DELETE /api/auth/delete-client/:id` - **КРИТИЧНО!**
- `DELETE /api/auth/delete-user/:id` - **КРИТИЧНО!**
- `GET /api/auth/get-all-clients` - **КРИТИЧНО!**
- `POST /api/auth/get-all-clients-users` - **КРИТИЧНО!**
- `GET /api/auth/get-all-users` - **КРИТИЧНО!**
- `GET /api/auth/get-all-portls` - **КРИТИЧНО!**

---

## 👥 Логика привязки к клиенту

### Структура данных:
```
Client (1) ──< (N) User
  ├─ id
  ├─ name
  ├─ email
  ├─ is_active
  └─ status

User (N) ──> (1) Client
  ├─ id
  ├─ email
  ├─ password (encrypted)
  ├─ client_id (FK)
  └─ role_id
```

### Проверки при входе:
1. ✅ Пользователь существует
2. ✅ Пароль верный
3. ✅ Клиент существует
4. ✅ Клиент активен (`is_active === true`)

### В JWT токене:
- `sub` - ID пользователя
- `client_id` - ID клиента (для изоляции данных)

**Логика изоляции:** Пользователи видят только данные своего клиента через `client_id` в токене.

---

## 🔓 Слабые места безопасности

### 1. **КРИТИЧНО: Нет защиты admin эндпоинтов**
```typescript
// ❌ ПЛОХО: Нет защиты
@Controller('admin/garant/infoblocks')
export class AdminGarantInfoblockController {
    @Get()  // Открыт для всех!
    async findAll() { ... }
}
```

### 2. **КРИТИЧНО: Stateless JWT без blacklist**
- Токены нельзя отозвать до истечения срока
- Если токен скомпрометирован, он валиден 24 часа
- Нет механизма logout на сервере

### 3. **Средне: Нет refresh tokens**
- Только access token на 24 часа
- Нет механизма обновления без повторного входа
- `RefreshGuard` существует, но не используется

### 4. **Средне: Слабая валидация ролей**
- Есть `role_id` в User, но нет проверки ролей в guards
- Нет системы permissions/abilities

### 5. **Низко: Console.log в production**
```typescript
// jwt-auth.guard.ts:23,34
console.log('token', token);
console.log('payload', payload);
```

### 6. **Низко: Hardcoded secret fallback**
```typescript
// jwt.constants.ts:3
secret: process.env.APP_SECRET_KEY || 'super-secret'
```

### 7. **Низко: Нет rate limiting**
- Нет защиты от brute force на `/login`
- Нет защиты от массовой регистрации

### 8. **Низко: Нет проверки email verification**
- Пользователь может войти без подтверждения email
- Проверяется только `is_active` клиента

---

## 🚀 Как расширить для admin модуля

### Вариант 1: Отдельный Admin Guard (рекомендуется)

#### 1. Создать `AdminAuthGuard`
```typescript
// src/apps/admin/guards/admin-auth.guard.ts
@Injectable()
export class AdminAuthGuard extends AuthGuard {
    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 1. Проверяем базовую аутентификацию
        const isAuthenticated = await super.canActivate(context);
        if (!isAuthenticated) return false;

        const request = context.switchToHttp().getRequest();
        const user = request.user;

        // 2. Проверяем роль (например, role_id === 1 для admin)
        const userEntity = await this.userService.findUserById(user.sub);
        if (!userEntity || userEntity.role_id !== BigInt(1)) {
            throw new ForbiddenException('Admin access required');
        }

        // 3. Дополнительные проверки для admin
        // - Проверка IP whitelist
        // - Проверка 2FA
        // - Проверка временных ограничений

        return true;
    }
}
```

#### 2. Создать декоратор для удобства
```typescript
// src/apps/admin/decorators/admin-only.decorator.ts
export const AdminOnly = () => UseGuards(AdminAuthGuard);
```

#### 3. Использовать в контроллерах
```typescript
@Controller('admin/garant/infoblocks')
export class AdminGarantInfoblockController {
    @Get()
    @AdminOnly()  // Просто и понятно
    async findAll() { ... }
}
```

### Вариант 2: Глобальный Guard для `/admin/*`

#### В `main.ts` или через `APP_GUARD`:
```typescript
// app.module.ts
@Module({
    providers: [
        {
            provide: APP_GUARD,
            useClass: AdminGlobalGuard,  // Применяется ко всем /admin/*
        },
    ],
})
```

### Вариант 3: Отдельная система аутентификации для admin

#### Создать отдельный модуль:
```
src/apps/admin/auth/
├── admin-auth.module.ts
├── guards/
│   └── admin-jwt.guard.ts
├── services/
│   └── admin-auth.service.ts
└── controllers/
    └── admin-auth.controller.ts
```

**Преимущества:**
- Полная изоляция от client auth
- Отдельные токены и секреты
- Своя логика ролей и permissions

---

## 📝 Рекомендации по улучшению

### 1. **Добавить Token Blacklist (Redis)**
```typescript
// При logout
async logout(user: any, res: Response) {
    const token = this.extractToken(req);
    // Сохраняем в Redis с TTL = время до истечения токена
    await redis.set(`blacklist:${token}`, '1', 'EX', tokenExpiry);
    this.cookieService.clearAuthCookie(res);
}
```

### 2. **Добавить Refresh Tokens**
```typescript
// При login
const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' });
const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

// Сохранить refreshToken в БД или Redis
await this.tokenRepository.create({
    user_id: user.id,
    refresh_token: refreshToken,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});
```

### 3. **Добавить Role-Based Access Control (RBAC)**
```typescript
// guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
    constructor(private reflector: Reflector) {}

    canActivate(context: ExecutionContext): boolean {
        const requiredRoles = this.reflector.get<string[]>('roles', context.getHandler());
        const user = context.switchToHttp().getRequest().user;

        return requiredRoles.includes(user.role);
    }
}

// Использование
@Roles('admin', 'super-admin')
@UseGuards(AuthGuard, RolesGuard)
@Get('admin-only')
```

### 4. **Добавить Rate Limiting**
```typescript
// Использовать @nestjs/throttler
@Throttle(5, 60)  // 5 запросов в минуту
@Post('login')
async login() { ... }
```

### 5. **Улучшить валидацию email**
```typescript
async login(dto: LoginDto) {
    const user = await this.userService.findUserByEmail(dto.email);

    // Проверка подтверждения email
    if (!user.email_verified_at) {
        throw new ForbiddenException('Email not verified');
    }

    // ... остальная логика
}
```

### 6. **Добавить логирование безопасности**
```typescript
// Логировать все попытки входа, изменения прав и т.д.
this.logger.warn('Failed login attempt', { email: dto.email, ip: req.ip });
```

---

## 📊 Сравнительная таблица

| Аспект | Текущее состояние | Рекомендуемое |
|--------|------------------|---------------|
| Хранение токенов | Stateless (cookie) | Stateless + Redis blacklist |
| Refresh tokens | ❌ Нет | ✅ Да |
| Защита admin | ❌ Нет | ✅ Guard + RBAC |
| Роли и права | ❌ Только role_id | ✅ RBAC система |
| Rate limiting | ❌ Нет | ✅ Throttler |
| Email verification | ⚠️ Частично | ✅ Обязательно |
| Логирование | ⚠️ Минимальное | ✅ Полное |

---

## 🎯 План действий

### Приоритет 1 (Критично):
1. ✅ Добавить `AdminAuthGuard` для всех `/admin/*` эндпоинтов
2. ✅ Защитить критические эндпоинты в `AuthController`
3. ✅ Убрать `console.log` из production кода

### Приоритет 2 (Важно):
4. ✅ Добавить Token Blacklist через Redis
5. ✅ Реализовать Refresh Tokens
6. ✅ Добавить проверку email verification при входе

### Приоритет 3 (Желательно):
7. ✅ Добавить RBAC систему
8. ✅ Добавить Rate Limiting
9. ✅ Улучшить логирование безопасности

---

## 📚 Полезные ссылки

- [NestJS Authentication](https://docs.nestjs.com/security/authentication)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
