export * from './domain';
// calendar.settings.get — домен вне barrel'а './domain' (см. domain/index.ts):
// подключён здесь, чтобы не трогать общий barrel доменов.
export * from './domain/calendar';
export * from './core';
export * from './bitrix.service';
export * from './bitrix-service.factory';
export * from './core/base/bitrix-base-api';
export * from './core/interface/bitrix-credentials.interface';
export * from './auth/bitrix-token-provider.port';
export * from './consts/';
