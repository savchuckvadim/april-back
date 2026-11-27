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

/** Строка платного пакета Legal Tech: название или состав (бесплатные коды сюда не входят). */
export const isLtPaidSpecificationCode = (code: string): boolean =>
    code.startsWith(ContractSpecificationCodeEnum.LT_PACKET) ||
    code.startsWith(ContractSpecificationCodeEnum.LT_SERVICES);

/**
 * Название платного пакета, когда пришёл только его состав: без строки с
 * названием платный Legal Tech печатался бы одним составом, без заголовка.
 */
export const LT_PAID_FALLBACK_NAME = 'Legal Tech';

const textOf = (value: unknown): string =>
    typeof value === 'string' ? value.trim() : '';

/**
 * Платные пакеты из строк спецификации по порядку номеров. Пустая пара
 * строк (легаси кладёт её, когда платных нет) пропускается; пакет с составом
 * и без названия печатается под названием по умолчанию.
 */
export const readLtPaidPackets = (
    items: SpecificationRow[],
): LtPaidPacketRow[] => {
    const result: LtPaidPacketRow[] = [];
    for (let index = 0; ; index += 1) {
        const packet = items.find(item => item.code === ltPaidPacketCode(index));
        if (!packet) break;
        const services = textOf(
            items.find(item => item.code === ltPaidServicesCode(index))?.value,
        )
            .split('\n')
            .map(service => service.trim())
            .filter(Boolean);
        const name =
            textOf(packet.value) ||
            (services.length ? LT_PAID_FALLBACK_NAME : '');
        if (!name) continue;
        result.push({ name, services });
    }
    return result;
};

/** Строка спецификации, которую читают блоки таймлайна: код и значение. */
export interface LtSpecificationRow {
    code: string;
    value: string;
}

/**
 * Строки спецификации Legal Tech: бесплатный пакет (если он есть) со
 * составом и каждый платный пакет парой «название + состав». Коды те же, что
 * у спецификации договора, поэтому читатели (readLtPaidPackets, блок Legal
 * Tech в таймлайне) разбирают их одинаково.
 */
export const buildLtSpecificationRows = (lt: {
    freePacket: string;
    freeServices: string[];
    paidPackets: LtPaidPacketRow[];
}): LtSpecificationRow[] => [
    ...(lt.freePacket
        ? [
              {
                  code: ContractSpecificationCodeEnum.LT_FREE,
                  value: lt.freePacket,
              },
              {
                  code: ContractSpecificationCodeEnum.LT_FREE_SERVICES,
                  value: lt.freeServices.join('\n'),
              },
          ]
        : []),
    ...lt.paidPackets.flatMap((packet, index) => [
        { code: ltPaidPacketCode(index), value: packet.name },
        { code: ltPaidServicesCode(index), value: packet.services.join('\n') },
    ]),
];
