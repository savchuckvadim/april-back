/**
 * Домен телефонии Bitrix24: статистика звонков (`voximplant.statistic.get`).
 *
 * Сервис домена НЕ `@Injectable` (создаётся под домен через `new`), поэтому
 * модуля у домена нет — только публичные типы и сам сервис.
 */
export * from './type/bx-voximplant-statistic.type';
export * from './service/bx-voximplant-statistic.service';
