import { Prisma } from 'generated/prisma';

/**
 * Поля привязки шаблона в projection-ах `select`.
 *
 * Вынесено в одну константу намеренно. В репозитории ПЯТЬ проекций
 * OfferTemplate (findMany, findByPortal, findPublic, findUserTemplates,
 * findFullUserTemplates), и забытое поле в любой из них не даёт ни ошибки
 * компиляции, ни ошибки рантайма — просто приходит `undefined`. Один
 * источник правды убирает этот молчаливый режим отказа.
 *
 * `satisfies` (а не аннотация типа) сохраняет литеральный тип: Prisma
 * по-прежнему видит точный набор полей и правильно выводит результат.
 */
export const OFFER_TEMPLATE_BINDING_SELECT = {
    agent_id: true,
    client_types: true,
    supply_types: true,
} satisfies Prisma.OfferTemplateSelect;
