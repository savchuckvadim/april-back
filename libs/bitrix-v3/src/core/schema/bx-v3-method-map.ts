import { HrEmployeeMethods } from '../../domain/humanresources/employee/schema/hr-employee.schema';
import { HrNodeMemberMethods } from '../../domain/humanresources/node-member/schema/hr-node-member.schema';
import { HrNodeMethods } from '../../domain/humanresources/node/schema/hr-node.schema';

/**
 * Единая карта методов REST 3.0.
 *
 * Ключ — строка метода как в API (`humanresources.node.list`),
 * она же совпадает с path OpenAPI-спеки без ведущего слэша.
 * Значение — пара `{ request, response }`.
 *
 * Новый домен подключается одной строкой в extends —
 * см. BITRIX_V3_DOMAIN_MODULE_GUIDE.md.
 */
export interface BxV3MethodMap
    extends HrNodeMethods,
        HrNodeMemberMethods,
        HrEmployeeMethods {}

/** Все известные методы REST 3.0 */
export type BxV3Method = keyof BxV3MethodMap;

/** Тип запроса метода M */
export type TBxV3Request<M extends BxV3Method> = BxV3MethodMap[M]['request'];

/** Тип распакованного result метода M */
export type TBxV3Response<M extends BxV3Method> = BxV3MethodMap[M]['response'];

/** Списочные методы — те, чей result имеет вид `{ items: [...] }` */
export type BxV3ListMethod = {
    [M in BxV3Method]: TBxV3Response<M> extends { items: unknown[] }
        ? M
        : never;
}[BxV3Method];

/** Тип элементов items списочного метода M */
export type TBxV3Items<M extends BxV3ListMethod> =
    TBxV3Response<M> extends { items: infer I extends unknown[] } ? I : never;
