import { GUARDS_METADATA } from '@nestjs/common/constants';
import { InternalKeyGuard } from './internal-key.guard';

type ControllerClass = abstract new (...args: never[]) => object;

const guardsOf = (target: object): unknown[] =>
    (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[] | undefined) ??
    [];

/**
 * Закрыт ли обработчик контроллера служебным ключом — guard'ом на самом
 * методе или на всём классе. Для проверок поверхности API: ручка, которую
 * закрыли, не должна открыться при правке контроллера.
 */
export function isInternalKeyProtected(
    controller: ControllerClass,
    handler: string,
): boolean {
    const method: unknown = Reflect.get(controller.prototype, handler);
    if (typeof method !== 'function') {
        throw new Error(`${controller.name}.${handler} — нет такого метода`);
    }
    return [...guardsOf(controller), ...guardsOf(method)].includes(
        InternalKeyGuard,
    );
}
