import { Field } from '@/modules/install/shared/parse-field-excel/type/parse-field.type';
import { Category } from '../../shared';

export interface Smart {
    id: string;
    title: string;
    name: string;
    entityTypeId: string;
    code: string;
    type: string;
    group: string;
    bitrixId: string;
    forStageId: string;
    forFilterId: string;
    crmId: string;
    forStage: string;
    forFilter: string;
    crm: string;
    isActive: boolean;
    isNeedUpdate: boolean;
    order: number;
    categories: Category[];
    fields: Field[];
}
