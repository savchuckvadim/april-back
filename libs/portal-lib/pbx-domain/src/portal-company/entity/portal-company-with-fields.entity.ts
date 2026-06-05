import type { PbxFieldEntity } from '@/modules/pbx-domain/field';
import type { PortalCompanyEntity } from './portal-company.entity';

/** Компания портала вместе со всеми PBX-полями, привязанными к `PbxEntityTypePrisma.BTX_COMPANY`. */
export type PortalCompanyWithFieldsEntity = {
    company: PortalCompanyEntity;
    fields: PbxFieldEntity[];
};
