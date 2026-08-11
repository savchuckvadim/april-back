import { AICALL_SMART_DESCRIPTOR } from '../pbx-aicall-smart/type/pbx-aicall-smart.descriptor';
import { SKAP_SMART_DESCRIPTOR } from '../pbx-skap-smart/type/pbx-skap-smart.descriptor';
import { ConstSmartDescriptor } from './type/const-smart-descriptor.type';

/**
 * Реестр const-смартов (устанавливаются из констант, без Excel).
 *
 * Добавление нового смарта в галерею админки:
 * 1) descriptor в его pbx-модуле (libs/portal-lib/pbx/pbx-<entity>);
 * 2) одна строка здесь;
 * 3) одна строка kind→use-case в ConstSmartInstallerResolver (apps/admin).
 */
export const CONST_SMART_REGISTRY = [
    AICALL_SMART_DESCRIPTOR,
    SKAP_SMART_DESCRIPTOR,
] as const satisfies readonly ConstSmartDescriptor[];

export type ConstSmartKind = (typeof CONST_SMART_REGISTRY)[number]['kind'];

export function findConstSmartDescriptor(
    kind: string,
): ConstSmartDescriptor | undefined {
    return CONST_SMART_REGISTRY.find(descriptor => descriptor.kind === kind);
}

/** Descriptor по паре (type, group) — матчинг с установленной строкой smarts. */
export function findConstSmartByTypeGroup(
    type: string,
    group: string,
): ConstSmartDescriptor | undefined {
    return CONST_SMART_REGISTRY.find(
        descriptor => descriptor.type === type && descriptor.group === group,
    );
}
