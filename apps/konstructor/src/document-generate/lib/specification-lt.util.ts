import { ContractSpecificationCodeEnum } from '../dto/specification/specification.dto';

/** Строка спецификации — ровно то, что читают помощники Legal Tech. */
interface SpecificationRow {
    code: string;
    value?: unknown;
}

/** Платный пакет Legal Tech, собранный из строк спецификации. */
export interface LtPaidPacketRow {
    name: string;
    services: string[];
}

/**
 * Код строки названия платного пакета по его номеру: первый — легаси
 * specification_lt_packet (его читают старые шаблоны и потребители), второй и
 * следующие — с номером (specification_lt_packet_2, …).
 */
export const ltPaidPacketCode = (index: number): string =>
    index === 0
        ? ContractSpecificationCodeEnum.LT_PACKET
        : `${ContractSpecificationCodeEnum.LT_PACKET}_${index + 1}`;

/** Код строки состава платного пакета: пара к ltPaidPacketCode. */
export const ltPaidServicesCode = (index: number): string =>
    index === 0
        ? ContractSpecificationCodeEnum.LT_SERVICES
        : `${ContractSpecificationCodeEnum.LT_SERVICES}_${index + 1}`;

/** Строка Legal Tech: бесплатный пакет, его состав или любой платный пакет. */
export const isLtSpecificationCode = (code: string): boolean =>
    code.startsWith('specification_lt_');

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

/**
 * Платные пакеты из строк спецификации по порядку номеров. Пакет без
 * названия (пустая легаси-строка, когда платных нет) пропускается.
 */
export const readLtPaidPackets = (
    items: SpecificationRow[],
): LtPaidPacketRow[] => {
    const result: LtPaidPacketRow[] = [];
    for (let index = 0; ; index += 1) {
        const packet = items.find(item => item.code === ltPaidPacketCode(index));
        if (!packet) break;
        const name = textOf(packet.value);
        if (!name) continue;
        const services = textOf(
            items.find(item => item.code === ltPaidServicesCode(index))?.value,
        )
            .split('\n')
            .map(service => service.trim())
            .filter(Boolean);
        result.push({ name, services });
    }
    return result;
};
