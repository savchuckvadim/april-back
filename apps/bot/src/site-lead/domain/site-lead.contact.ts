import { isEmail } from 'class-validator';
import { SITE_LEAD_PHONE_PATTERN, type SiteLead } from './site-lead.types';

/**
 * По каким контактам с посетителем можно связаться. Кривой второй контакт
 * не повод терять заявку: если есть телефон из десяти цифр ИЛИ корректная
 * почта — заявка принимается, а сомнительный контакт уходит в чат с
 * пометкой, чтобы менеджер видел, что ввёл человек.
 */

export const isReachablePhone = (phone?: string): boolean =>
    Boolean(phone && SITE_LEAD_PHONE_PATTERN.test(phone));

export const isReachableEmail = (email?: string): boolean =>
    Boolean(email && isEmail(email));

export const hasReachableContact = (
    lead: Pick<SiteLead, 'phone' | 'email'>,
): boolean => isReachablePhone(lead.phone) || isReachableEmail(lead.email);
