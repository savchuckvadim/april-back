import { PbxEntityType } from '@/shared/enums';
import { PbxCategoryDefinition, PbxStageDefinition } from '../../interfaces';

import dataBase from '@/modules/install/install-data/deals/sales/categories/data-base.json';
import dataCold from '@/modules/install/install-data/deals/sales/categories/data-cold.json';
import dataPresentation from '@/modules/install/install-data/deals/sales/categories/data-presentation.json';

interface LegacyStage {
    code: string;
    name: string;
    color: string;
    order: number;
    isDefault?: string;
    bitrixId?: string;
}

interface LegacyCategory {
    code: string;
    name: string;
    order: number;
    isDefault?: string;
    entityType?: string;
    stages: LegacyStage[];
}

interface LegacyCategoryFile {
    categories: LegacyCategory[];
}

function convertLegacyCategory(
    legacy: LegacyCategory,
    entityType: PbxEntityType,
): PbxCategoryDefinition {
    return {
        code: legacy.code,
        name: legacy.name,
        sort: legacy.order,
        entityType,
        isDefault: legacy.isDefault === 'Y',
        stages: legacy.stages.map(
            (s): PbxStageDefinition => ({
                code: s.code,
                name: s.name,
                color: s.color,
                sort: s.order,
                isDefault: s.isDefault === 'Y',
            }),
        ),
    };
}

function loadFromJson(
    data: LegacyCategoryFile[],
    entityType: PbxEntityType,
): PbxCategoryDefinition[] {
    return data.flatMap(entry =>
        entry.categories.map(c => convertLegacyCategory(c, entityType)),
    );
}

export const SALES_DEAL_CATEGORIES: PbxCategoryDefinition[] = [
    ...loadFromJson(dataBase as LegacyCategoryFile[], PbxEntityType.DEAL),
    ...loadFromJson(dataCold as LegacyCategoryFile[], PbxEntityType.DEAL),
    ...loadFromJson(
        dataPresentation as LegacyCategoryFile[],
        PbxEntityType.DEAL,
    ),
];
