/**
 * Публичный API библиотеки `@lib/cabinet` — кабинет клиента-портала:
 * учётки и доступы к порталам (владелец/участники), вход с сайта и
 * пароли по ссылкам, доступ из фрейма Битрикса, привязка Telegram.
 */
export { CabinetModule } from './cabinet.module';
export {
    CabinetApiModule,
    CabinetAdminModule,
    CabinetTelegramWebhookModule,
} from './cabinet-api.module';
export { CabinetMailTransportModule } from './infrastructure/cabinet-mail-transport.module';

// Доставка в Telegram — для продуктов (отчёт собственнику, карточки, алерты)
export { CabinetTelegramDeliveryService } from './telegram/cabinet-telegram-delivery.service';
export type { TelegramPerson } from './persistence/cabinet-telegram-binding.repository';

// Доступ — для ручек других модулей, которым нужен контекст кабинета
export { CabinetAccess, CabinetCtx } from './access/cabinet-access.decorator';
export type { CabinetContext } from './domain/cabinet-context';
export {
    CABINET_ROLES,
    CABINET_ACCESS_LEVELS,
    type CabinetRole,
    type CabinetAccessLevel,
} from './domain/cabinet.constants';
