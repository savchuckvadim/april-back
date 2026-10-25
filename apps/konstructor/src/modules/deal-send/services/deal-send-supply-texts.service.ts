import { Injectable } from '@nestjs/common';
import { ResolvedSupplyTexts, SupplyTextService } from '@lib/garant';
import { DealSendContractKind, DealSendFieldDto } from '../dto/deal-send.dto';

/**
 * Тексты поставки в полях сделки (решение владельца 2): новый фронт шлёт
 * `supplyCode` (+ `contractKind`), а договорные тексты — supply_for_contract,
 * note, note_3, hdd, way, logins_quantity, contract_supply_prop_q,
 * quantity_for_kp — подставляет бэк из шаблонов `supplies`. Легаси-фронт
 * присылает их готовыми — присланные поля сильнее.
 */
@Injectable()
export class DealSendSupplyTextsService {
    constructor(private readonly supplyTexts: SupplyTextService) {}

    async enrich(
        fields: DealSendFieldDto[],
        supplyCode: string | null | undefined,
        contractKind: DealSendContractKind | undefined,
    ): Promise<DealSendFieldDto[]> {
        if (!supplyCode) return fields;
        const texts = await this.supplyTexts.resolve(supplyCode);
        if (!texts) return fields;
        return mergeSupplyTextFields(
            fields,
            buildSupplyTextFields(texts, contractKind ?? 'service'),
        );
    }
}

/** Договор услуг / лицензионный / абонентский — у каждого свои тексты поставки. */
const pick = (
    texts: ResolvedSupplyTexts,
    kind: DealSendContractKind,
    service: keyof ResolvedSupplyTexts,
    lic: keyof ResolvedSupplyTexts,
    abon: keyof ResolvedSupplyTexts = service,
): string | number | null => {
    const key = kind === 'lic' ? lic : kind === 'abon' ? abon : service;
    const value = texts[key];
    return typeof value === 'string' || typeof value === 'number'
        ? value
        : null;
};

/** Поля сделки из текстов поставки под вид договора. */
export const buildSupplyTextFields = (
    texts: ResolvedSupplyTexts,
    kind: DealSendContractKind,
): DealSendFieldDto[] => {
    const suppliesQuantity = texts.contractPropSuppliesQuantity;
    const candidates: Array<
        [DealSendFieldDto['code'], string | number | null]
    > = [
        ['supply', texts.name],
        [
            'supply_for_contract',
            pick(texts, kind, 'contractName', 'lcontractName', 'acontractName'),
        ],
        [
            'note',
            pick(
                texts,
                kind,
                'contractPropComment',
                'lcontractPropComment',
                'acontractPropComment',
            ),
        ],
        [
            'note_3',
            pick(texts, kind, 'contractPropEmail', 'lcontractPropEmail'),
        ],
        ['hdd', texts.contractProp1],
        ['way', pick(texts, kind, 'contractProp2', 'lcontractProp2')],
        ['logins_quantity', texts.contractPropLoginsQuantity],
        // «Флэш» и прочие нечисловые значения в легаси уходили как 1
        [
            'contract_supply_prop_q',
            suppliesQuantity === null
                ? null
                : Number.isFinite(Number(suppliesQuantity))
                  ? Number(suppliesQuantity)
                  : 1,
        ],
        ['quantity_for_kp', texts.quantityForKp],
    ];
    return candidates
        .filter(
            (entry): entry is [DealSendFieldDto['code'], string | number] => {
                const value = entry[1];
                return value !== null && value !== '';
            },
        )
        .map(([code, value]) => ({ code, appType: 'product', value }));
};

/** Присланное фронтом поле сильнее резолва бэка. */
export const mergeSupplyTextFields = (
    fields: DealSendFieldDto[],
    resolved: DealSendFieldDto[],
): DealSendFieldDto[] => [
    ...fields,
    ...resolved.filter(
        candidate =>
            !fields.some(
                field =>
                    field.code === candidate.code &&
                    (field.appType ?? 'product') === 'product',
            ),
    ),
];
