import { PbxFieldEntity } from '../../field/entity/pbx-field.entity';

export class PbxUserEntity {
    id: string;
    code: string;
    createdAt: string;
    updatedAt: string;
    fields: PbxFieldEntity[];
}
