import type { PbxFieldEntity } from '@lib/portal-lib/pbx-domain/field';
import type { PortalContactEntity } from './portal-contact.entity';

/** Контакт портала вместе со всеми PBX-полями, привязанными к `PbxEntityTypePrisma.BTX_CONTACT`. */
export type PortalContactWithFieldsEntity = {
    contact: PortalContactEntity;
    fields: PbxFieldEntity[];
};
