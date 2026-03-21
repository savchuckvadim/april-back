import { PrismaClient } from '@prisma/client';
import { PbxUserEntity } from '../entity/pbx-user.entity';
import { PbxFieldEntity } from '../../field/entity/pbx-field.entity';

type BtxUser = PrismaClient['btxUser'];
export const mapToEntity = (
    user: BtxUser,
    fields: PbxFieldEntity[],
): PbxUserEntity => {
    const result = new PbxUserEntity();
    result.id = String(user.id);
    result.code = user.code;
    result.fields = fields;
    result.createdAt = user.created_at?.toISOString() || '';
    result.updatedAt = user.updated_at?.toISOString() || '';

    return result;
};
