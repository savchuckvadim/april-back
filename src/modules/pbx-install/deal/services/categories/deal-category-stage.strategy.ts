import { Injectable } from '@nestjs/common';
import { BitrixCategoryStageStrategy } from '@/modules/pbx-install/category/strategy/bitrix-category-stage.strategy';
import { Stage } from '@/modules/pbx-install/shared';

/**
 * Стратегия идентификаторов и семантики для сделки (legacy CRM Deal, `entityTypeId = 2`).
 *
 * Особенности:
 * - Default-воронка сделки в Bitrix имеет `bxCategoryId = 0` и работает через `ENTITY_ID = 'DEAL_STAGE'`;
 *   у её стадий `STATUS_ID` не имеет префикса (например, `NEW`, `WON`, `LOSE`).
 * - Остальные воронки используют `ENTITY_ID = 'DEAL_STAGE_<bxCategoryId>'`
 *   и `STATUS_ID = 'C<bxCategoryId>:<bitrixId>'`.
 * - Семантика стадии приходит уже распаршенной в `stage.type` (`'P' | 'S' | 'F'`),
 *   так что эвристика по `bitrixId` не нужна. `'P'` (intermediate) — это дефолт Bitrix,
 *   мы возвращаем пустую строку, чтобы `SEMANTICS` не отправлялся в payload.
 */
@Injectable()
export class DealCategoryStageStrategy implements BitrixCategoryStageStrategy {
    statusEntityId(_entityTypeId: number, bxCategoryId: number): string {
        return bxCategoryId === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${bxCategoryId}`;
    }

    statusId(
        _entityTypeId: number,
        bxCategoryId: number,
        bitrixId: string,
    ): string {
        const id = String(bitrixId);
        return bxCategoryId === 0 ? id : `C${bxCategoryId}:${id}`;
    }

    categoryCamelId(_entityTypeId: number, bxCategoryId: number): string {
        return String(bxCategoryId);
    }

    resolveStageSemantics(stage: Stage): string {
        const t = String(stage.type).toUpperCase();
        if (t === 'S' || t === 'F') {
            return t;
        }
        return '';
    }
}
