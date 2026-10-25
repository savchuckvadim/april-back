/**
 * Рефакторинг сервиса работы с реквизитами Bitrix24
 *
 * Структура:
 * - services/ - подсервисы для работы с реквизитами, адресами, банками, custom fields
 * - utils/ - утилиты для обработки данных
 * - consts/ - константы
 * - types/ - общие типы (если нужны)
 */

export { BxRqService } from './services/bx-rq.service';
export { BxRqAddressService } from './services/bx-rq-address.service';
export { BxRqBankService } from './services/bx-rq-bank.service';
export { BxRqCustomFieldService } from './services/bx-rq-custom-field.service';

export * from './consts/preset.consts';
export * from './consts/address.consts';
export * from './utils/requisite.utils';
export * from './utils/address.utils';
export * from './utils/bank.utils';
export * from './utils/custom-field.utils';
export * from './utils/preset.utils';
