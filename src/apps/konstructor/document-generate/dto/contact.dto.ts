import { ApiProperty } from '@nestjs/swagger';

export class PhoneDto {
    @ApiProperty({ example: '198778' })
    ID: string;

    @ApiProperty({ example: 'WORK' })
    VALUE_TYPE: string;

    @ApiProperty({ example: '+79620027991' })
    VALUE: string;

    @ApiProperty({ example: 'PHONE' })
    TYPE_ID: string;
}

export class ContactDto {
    @ApiProperty({ example: 'vdm' })
    NAME: string;

    @ApiProperty({ example: '17352' })
    ID: string;

    @ApiProperty({ example: '' })
    POST: string;

    @ApiProperty({ example: 'Cfdx' })
    LAST_NAME: string;

    @ApiProperty({ example: '' })
    COMMENTS: string;

    @ApiProperty({ example: '10522' })
    UF_CRM_ORK_IS_LPR: string;

    @ApiProperty({ example: '10594' })
    UF_CRM_CONTACT_CLIENT_STATUS: string;

    @ApiProperty({ example: '10516' })
    UF_CRM_ORK_IS_MOST_USER: string;

    @ApiProperty({ example: '10564' })
    UF_CRM_ORK_CONTACT_GARANT: string;

    @ApiProperty({ example: '10574' })
    UF_CRM_ORK_CONTACT_CONCURENT: string;

    @ApiProperty({ example: '10558' })
    UF_CRM_ORK_NEEDS: string;

    @ApiProperty({ example: '' })
    UF_CRM_ORK_CALL_FREQUENCY: string;

    @ApiProperty({ type: [PhoneDto] })
    PHONE: PhoneDto[];
}

export class FieldItemDto {
    @ApiProperty({ example: 4457 })
    id: number;

    @ApiProperty({ example: '2025-01-04T07:40:59.000000Z' })
    created_at: string;

    @ApiProperty({ example: '2025-01-04T07:40:59.000000Z' })
    updated_at: string;

    @ApiProperty({ example: 2271 })
    bitrixfield_id: number;

    @ApiProperty({ example: 'Ничего не решает' })
    name: string;

    @ApiProperty({ example: 'Ничего не решает' })
    title: string;

    @ApiProperty({ example: 'oil_no' })
    code: string;

    @ApiProperty({ example: 10520 })
    bitrixId: number;
}

export class FieldDto {
    @ApiProperty({ example: 2271 })
    id: number;

    @ApiProperty({ example: 'App\\Models\\BtxContact' })
    entity_type: string;

    @ApiProperty({ example: 3 })
    entity_id: number;

    @ApiProperty({ example: 'service_event' })
    parent_type: string;

    @ApiProperty({ example: '2025-01-04T07:40:59.000000Z' })
    created_at: string;

    @ApiProperty({ example: '2025-01-04T07:40:59.000000Z' })
    updated_at: string;

    @ApiProperty({ example: 'enumeration' })
    type: string;

    @ApiProperty({ example: 'ОРК Принятие решений' })
    title: string;

    @ApiProperty({ example: 'ОРК Принятие решений' })
    name: string;

    @ApiProperty({ example: 'ORK_IS_LPR' })
    bitrixId: string;

    @ApiProperty({ example: 'ufCrmORK_IS_LPR' })
    bitrixCamelId: string;

    @ApiProperty({ example: 'ork_is_lpr' })
    code: string;

    @ApiProperty({ type: [FieldItemDto] })
    items: FieldItemDto[];
}

export class ContactFieldDto {
    @ApiProperty({ example: 'UF_CRM_ORK_IS_LPR' })
    bitrixId: string;

    @ApiProperty({ type: [FieldItemDto] })
    items: FieldItemDto[];

    @ApiProperty({ type: FieldItemDto, nullable: true })
    current: FieldItemDto | null;

    @ApiProperty({ type: FieldDto })
    field: FieldDto;
}

export class ContactResponseDto {
    @ApiProperty({ type: ContactDto })
    contact: ContactDto;

    @ApiProperty({ type: [ContactFieldDto] })
    fields: ContactFieldDto[];
} 