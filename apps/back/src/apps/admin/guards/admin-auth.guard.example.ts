// /**
//  * ПРИМЕР РЕАЛИЗАЦИИ AdminAuthGuard
//  *
//  * Этот файл показывает, как можно реализовать защиту для admin модуля.
//  * Скопируйте и адаптируйте под ваши нужды.
//  */

// import {
//     CanActivate,
//     ExecutionContext,
//     Injectable,
//     UnauthorizedException,
//     ForbiddenException,
// } from '@nestjs/common';
// import { JwtService } from '@nestjs/jwt';
// import { Request } from 'express';
// import { jwtConstants } from '@/apps/bitrix-app-client/auth/constants/jwt.constants';
// import { UserService } from '@/apps/bitrix-app-client/user/services/user.service';

// @Injectable()
// export class AdminAuthGuard implements CanActivate {
//     constructor(
//         private readonly jwtService: JwtService,
//         private readonly userService: UserService,
//     ) { }

//     async canActivate(context: ExecutionContext): Promise<boolean> {
//         const request = context.switchToHttp().getRequest<Request>();

//         // 1️⃣ Извлекаем токен
//         const token = this.extractToken(request);
//         if (!token) {
//             throw new UnauthorizedException('Token not provided');
//         }

//         // 2️⃣ Верифицируем токен
//         let payload: any;
//         try {
//             payload = await this.jwtService.verifyAsync(token, {
//                 secret: jwtConstants.secret,
//             });
//         } catch (error) {
//             throw new UnauthorizedException('Invalid or expired token');
//         }

//         // 3️⃣ Проверяем, что пользователь существует
//         const user = await this.userService.findUserById(payload.sub);
//         if (!user) {
//             throw new UnauthorizedException('User not found');
//         }

//         // 4️⃣ Проверяем роль (пример: role_id === 1 для admin)
//         // TODO: Создать enum или константы для ролей
//         const ADMIN_ROLE_ID = BigInt(1);
//         if (user.role_id !== ADMIN_ROLE_ID) {
//             throw new ForbiddenException('Admin access required');
//         }

//         // 5️⃣ Проверяем, что клиент активен (опционально)
//         // const client = await this.clientService.findById(Number(user.client_id));
//         // if (!client?.is_active) {
//         //     throw new ForbiddenException('Client is inactive');
//         // }

//         // 6️⃣ Добавляем полную информацию о пользователе в request
//         request['user'] = {
//             ...payload,
//             userEntity: user, // Полная информация из БД
//         };

//         return true;
//     }

//     private extractToken(request: Request): string | undefined {
//         // 1️⃣ Сначала проверяем Authorization header
//         const [type, token] = request.headers.authorization?.split(' ') ?? [];
//         if (type === 'Bearer' && token) return token;

//         // 2️⃣ Потом проверяем cookie
//         const cookieToken = request.cookies?.['access_token'];
//         if (cookieToken) return cookieToken;

//         return undefined;
//     }
// }

// /**
//  * ВАРИАНТ 2: Guard с проверкой через декоратор
//  */
// import { SetMetadata } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';

// export const ADMIN_ROLES_KEY = 'admin_roles';
// export const RequireAdminRole = (...roles: string[]) =>
//     SetMetadata(ADMIN_ROLES_KEY, roles);

// @Injectable()
// export class AdminRoleGuard implements CanActivate {
//     constructor(
//         private reflector: Reflector,
//         private readonly jwtService: JwtService,
//         private readonly userService: UserService,
//     ) { }

//     async canActivate(context: ExecutionContext): Promise<boolean> {
//         // Получаем требуемые роли из декоратора
//         const requiredRoles = this.reflector.getAllAndOverride<string[]>(
//             ADMIN_ROLES_KEY,
//             [context.getHandler(), context.getClass()],
//         );

//         if (!requiredRoles) {
//             // Если роли не указаны, разрешаем доступ (базовая аутентификация)
//             return true;
//         }

//         const request = context.switchToHttp().getRequest();
//         const user = request.user;

//         if (!user) {
//             throw new UnauthorizedException();
//         }

//         // Получаем полную информацию о пользователе
//         const userEntity = await this.userService.findUserById(user.sub);
//         if (!userEntity) {
//             throw new UnauthorizedException('User not found');
//         }

//         // Проверяем роль (здесь нужно адаптировать под вашу систему ролей)
//         // Например, если у вас есть таблица roles:
//         // const userRole = await this.roleService.findById(userEntity.role_id);
//         // return requiredRoles.includes(userRole.name);

//         // Простая проверка по role_id
//         const ADMIN_ROLE_ID = BigInt(1);
//         return userEntity.role_id === ADMIN_ROLE_ID;
//     }
// }

// /**
//  * ИСПОЛЬЗОВАНИЕ:
//  *
//  * // В контроллере:
//  * @Controller('admin/garant/infoblocks')
//  * export class AdminGarantInfoblockController {
//  *     @Get()
//  *     @UseGuards(AdminAuthGuard)  // Простая защита
//  *     async findAll() { ... }
//  *
//  *     @Post()
//  *     @UseGuards(AdminAuthGuard, AdminRoleGuard)
//  *     @RequireAdminRole('super-admin')  // Только для super-admin
//  *     async create() { ... }
//  * }
//  */
