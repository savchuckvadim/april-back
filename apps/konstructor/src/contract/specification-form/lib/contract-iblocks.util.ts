import { ComplectDto } from '@app/konstructor/document-generate/dto/complect/complect.dto';
import { INFOBLOCK_GROUP_TYPE } from '@app/konstructor/document-generate/dto/complect/complect.type';

/**
 * Инфоблоки договора по группам наполнения — порт Laravel
 * `ContractController::getContractIBlocks` (строки 3539-3650).
 *
 * Группа определяется по `type` (INFOBLOCK_GROUP_TYPE); легаси-фронт
 * присылал только `groupsName`, поэтому названия групп остаются запасным
 * ключом. Многострочные значения заканчиваются переводом строки — так их
 * ждёт docx-шаблон.
 */
export interface ContractIBlocks {
    allIBlocks: string;
    bigIBlocks: string;
    smallIBlocks: string;
    freeIBlocks: string;
    starLtBlocks: string;
    ers: string;
    erPackets: string;
    ersInPacket: string;
}

const LEGACY_GROUP_TYPE: Record<string, INFOBLOCK_GROUP_TYPE> = {
    'Без дополнительной оплаты': INFOBLOCK_GROUP_TYPE.FREE,
    'Legal Tech': INFOBLOCK_GROUP_TYPE.LT,
    'Пакет Энциклопедий решений': INFOBLOCK_GROUP_TYPE.PER,
    'Энциклопедии решений': INFOBLOCK_GROUP_TYPE.ER,
    'Дополнительные программные продукты': INFOBLOCK_GROUP_TYPE.STAR,
    'Правовая Поддержка': INFOBLOCK_GROUP_TYPE.CONSULTING,
};

/** Содержательные группы: только они дают «Информационные блоки» договора. */
const CONTENT_GROUPS = new Set<INFOBLOCK_GROUP_TYPE>([
    INFOBLOCK_GROUP_TYPE.NPA,
    INFOBLOCK_GROUP_TYPE.LA,
    INFOBLOCK_GROUP_TYPE.CONS,
    INFOBLOCK_GROUP_TYPE.SP,
]);

const groupTypeOf = (group: ComplectDto): INFOBLOCK_GROUP_TYPE | null =>
    group.type ?? LEGACY_GROUP_TYPE[group.groupsName] ?? null;

export const getContractIBlocks = (groups: ComplectDto[]): ContractIBlocks => {
    const result: ContractIBlocks = {
        allIBlocks: '',
        bigIBlocks: '',
        smallIBlocks: '',
        freeIBlocks: '',
        starLtBlocks: '',
        ers: '',
        erPackets: '',
        ersInPacket: '',
    };
    const seenAll = new Set<string>();
    const seenSmall = new Set<string>();
    const seenBig = new Set<string>();

    for (const group of groups) {
        // легаси: без type и с незнакомым groupsName группа считалась содержательной
        const type = groupTypeOf(group) ?? INFOBLOCK_GROUP_TYPE.NPA;
        for (const block of group.value) {
            if (block.checked === false) continue;
            const value = block.title || block.name;
            if (!value) continue;

            if (CONTENT_GROUPS.has(type)) {
                if (block.weight === 0.5 || block.weight === 0) {
                    if (!seenAll.has(value)) {
                        seenAll.add(value);
                        result.allIBlocks += `${value}\n`;
                    }
                    if (!seenSmall.has(value)) {
                        seenSmall.add(value);
                        result.smallIBlocks += `${value}\n`;
                    }
                } else if (block.weight >= 1) {
                    if (!seenAll.has(value)) {
                        seenAll.add(value);
                        result.allIBlocks += `${value}\n`;
                    }
                    if (!seenBig.has(value)) {
                        seenBig.add(value);
                        result.bigIBlocks += `${value}\n`;
                    }
                }
            } else if (type === INFOBLOCK_GROUP_TYPE.FREE) {
                result.freeIBlocks += `${value}\n`;
            } else if (type === INFOBLOCK_GROUP_TYPE.STAR) {
                result.starLtBlocks += `${value}\n`;
            } else if (type === INFOBLOCK_GROUP_TYPE.ER) {
                if (block.weight === 0.5) result.ers += `${value}\n`;
                else if (block.weight === 0) result.ersInPacket += `${value}\n`;
            } else if (type === INFOBLOCK_GROUP_TYPE.PER) {
                result.erPackets += result.erPackets ? `, ${value}` : value;
            }
            // lt / consulting / academy — отдельные строки спецификации, не инфоблоки
        }
    }
    return result;
};
