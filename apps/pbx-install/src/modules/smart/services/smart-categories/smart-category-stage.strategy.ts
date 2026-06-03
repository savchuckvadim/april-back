import { Injectable } from '@nestjs/common';
import { BitrixCategoryStageStrategy } from '@app/pbx-install/category/strategy/bitrix-category-stage.strategy';
import { Stage } from '@app/pbx-install/shared';

/**
 * Стратегия идентификаторов и семантики для смарт-процессов.
 *
 * Формат соответствует тому, как Bitrix выдаёт `crm.status.*` для динамических сущностей:
 * `ENTITY_ID = DYNAMIC_<entityTypeId>_STAGE_<bxCategoryId>`,
 * `STATUS_ID = DT<entityTypeId>_<bxCategoryId>:<bitrixId>`.
 *
 * Семантика стадии в шаблоне смарта не приходит явно — берётся эвристически из `bitrixId`
 * (SUCCESS/FAIL/...), а если суффикс не распознан — из `code` (`*success*` / `*fail*`).
 */
@Injectable()
export class SmartCategoryStageStrategy implements BitrixCategoryStageStrategy {
    statusEntityId(entityTypeId: number, bxCategoryId: number): string {
        return `DYNAMIC_${entityTypeId}_STAGE_${bxCategoryId}`;
    }

    statusId(
        entityTypeId: number,
        bxCategoryId: number,
        bitrixId: string,
    ): string {
        return `DT${entityTypeId}_${bxCategoryId}:${String(bitrixId)}`;
    }

    categoryCamelId(entityTypeId: number, bxCategoryId: number): string {
        return `DT${entityTypeId}_${bxCategoryId}`;
    }

    resolveStageSemantics(stage: Stage): string {
        const fromBitrixId = semanticsFromBitrixId(String(stage.bitrixId));
        if (fromBitrixId) {
            return fromBitrixId;
        }
        if (stage.code.includes('success')) {
            return 'S';
        }
        if (stage.code.includes('fail')) {
            return 'F';
        }
        return '';
    }
}

/** Семантика Bitrix по суффиксу STATUS_ID (поле шаблона `bitrixId`). */
function semanticsFromBitrixId(bitrixId: string): string {
    const id = bitrixId.toUpperCase();
    if (id === 'SUCCESS' || id === 'WON') {
        return 'S';
    }
    if (
        id === 'FAIL' ||
        id === 'LOSE' ||
        id === 'LOST' ||
        id === 'APOLOGY' ||
        id === 'DECLINED'
    ) {
        return 'F';
    }
    return '';
}
