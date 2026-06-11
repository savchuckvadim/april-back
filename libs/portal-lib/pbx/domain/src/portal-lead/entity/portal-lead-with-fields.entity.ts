import type { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import type { PortalLeadEntity } from './portal-lead.entity';

/** Лид портала вместе со всеми PBX-полями, привязанными к `PbxEntityTypePrisma.LEAD`. */
export type PortalLeadWithFieldsEntity = {
    lead: PortalLeadEntity;
    fields: PbxFieldEntity[];
};
