import type { PbxFieldEntity } from '@/modules/pbx-domain/field';
import type { PortalDealEntity } from './portal-deal.entity';

/** Сделка портала вместе со всеми PBX-полями, привязанными к `PbxEntityTypePrisma.DEAL`. */
export type PortalDealWithFieldsEntity = {
    deal: PortalDealEntity;
    fields: PbxFieldEntity[];
};
