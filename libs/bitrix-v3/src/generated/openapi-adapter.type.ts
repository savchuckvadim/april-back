import type { paths } from './openapi';

/**
 * Адаптер сгенерированных OpenAPI-типов к формату BxV3MethodMap.
 *
 * Ключ карты методов = path спеки без ведущего слэша, поэтому
 * домен может подключить сгенерированный тип одной строкой:
 *
 *   interface SomeMethods {
 *       'humanresources.node.communication.list':
 *           TBxV3GenEntryByMethod<'humanresources.node.communication.list'>;
 *   }
 *
 * ВНИМАНИЕ: спека Битрикса пока сырая (нет enum'ов, местами неверная
 * форма result) — для рабочих методов предпочитайте рукописные схемы,
 * сверенные с живыми ответами. Детали: BITRIX_V3_DOMAIN_MODULE_GUIDE.md.
 */
export type TBxV3OpenApiPath = keyof paths;

/** Имена методов из спеки (path без ведущего слэша) */
export type TBxV3OpenApiMethodName = TBxV3OpenApiPath extends `/${infer M}`
    ? M
    : never;

type PostOf<P extends TBxV3OpenApiPath> = paths[P] extends { post: infer X }
    ? X
    : never;

type JsonContent<X> = X extends { content: { 'application/json': infer R } }
    ? R
    : never;

/** Тип тела запроса метода по path из спеки */
export type TBxV3GenRequest<P extends TBxV3OpenApiPath> =
    PostOf<P> extends { requestBody?: infer B }
        ? JsonContent<NonNullable<B>>
        : never;

/** Тип распакованного result по path из спеки */
export type TBxV3GenResult<P extends TBxV3OpenApiPath> =
    PostOf<P> extends {
        responses: { 200: infer OK };
    }
        ? JsonContent<OK> extends { result?: infer R }
            ? NonNullable<R>
            : JsonContent<OK>
        : never;

/** Готовая запись для BxV3MethodMap по имени метода */
export type TBxV3GenEntryByMethod<M extends TBxV3OpenApiMethodName> = {
    request: TBxV3GenRequest<`/${M}` & TBxV3OpenApiPath>;
    response: TBxV3GenResult<`/${M}` & TBxV3OpenApiPath>;
};
