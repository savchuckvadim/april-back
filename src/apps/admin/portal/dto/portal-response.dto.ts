import { ClientResponseDto } from '@/modules/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Portal } from 'generated/prisma';
import { MeasureResponseDto } from '../../measures/dto/measure-response.dto';
import { TimezoneResponseDto } from '../timezones/dto/timezone-response.dto';
import { ContractResponseDto } from '../../contracts/dto/contract-response.dto';
import { PortalContractResponseDto } from '../portal-contracts/dto/portal-contract-response.dto';
import { PortalMeasureResponseDto } from '../portal-measures/dto/portal-measure-response.dto';
import { SmartResponseDto } from '../smarts/dto/smart-response.dto';
import { AdminPortalWithRelations } from '../type/admin-portal.type';


export class AdminPortalResponseDto {
    constructor(portal: Portal) {
        this.id = Number(portal.id);
        this.domain = portal.domain;
        this.key = portal.key;
        this.client_id = portal.client_id ? Number(portal.client_id) : null;
        this.C_REST_CLIENT_ID = portal.C_REST_CLIENT_ID;
        this.C_REST_CLIENT_SECRET = portal.C_REST_CLIENT_SECRET;
        this.C_REST_WEB_HOOK_URL = portal.C_REST_WEB_HOOK_URL;
        this.number = portal.number;
        this.created_at = portal.created_at;
        this.updated_at = portal.updated_at;
    }
    @ApiProperty({
        description: 'Portal ID',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiPropertyOptional({
        description: 'Portal domain',
        example: 'example.bitrix24.ru',
        type: String,
    })
    domain?: string | null;

    @ApiPropertyOptional({
        description: 'Portal key',
        example: 'key123',
        type: String,
    })
    key?: string | null;

    @ApiPropertyOptional({
        description: 'Client ID',
        example: 1,
        type: Number,
    })
    client_id?: number | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_ID',
        example: 'client_id_123',
        type: String,
    })
    C_REST_CLIENT_ID?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_CLIENT_SECRET',
        example: 'client_secret_123',
        type: String,
    })
    C_REST_CLIENT_SECRET?: string | null;

    @ApiPropertyOptional({
        description: 'C_REST_WEB_HOOK_URL',
        example: 'https://example.bitrix24.ru/rest/1/webhook',
        type: String,
    })
    C_REST_WEB_HOOK_URL?: string | null;

    @ApiPropertyOptional({
        description: 'Portal number',
        example: 1,
        type: Number,
    })
    number?: number;

    @ApiPropertyOptional({
        description: 'Created at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    created_at?: Date | null;

    @ApiPropertyOptional({
        description: 'Updated at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    updated_at?: Date | null;
}



export class AdminPortalWithRelationsResponseDto extends AdminPortalResponseDto {
    constructor(
        portal: AdminPortalWithRelations
    
    ) {
        super(portal);
        this.client = portal.client ? new ClientResponseDto(portal.client) : null;
        this.agents = portal.agents;
        this.templates = portal.portal_templates;
        this.contracts = portal.portal_contracts?.map(contract => new PortalContractResponseDto(contract)) ?? null;
        this.smarts = portal.portal_smarts?.map(smart => new SmartResponseDto(smart)) ?? null;
        this.timezones = portal.portal_timezones?.map(timezone => new TimezoneResponseDto(timezone)) ?? null;



        this.portalMeasures = portal.portal_measures?.map(measure => new PortalMeasureResponseDto(measure)) ?? null;
        this.smarts = portal.portal_smarts?.map(smart => new SmartResponseDto(smart)) ?? null;

    
        // this.regions = portal.portal_regions?.map(region => new PortalRegionResponseDto(region)) ?? null;
        this.templates = portal.portal_templates;
        // this.apps = portal.bitrix_apps;
        // this.lists = portal.bitrixlists;
        // this.companies = portal.btx_companies;
        // this.contacts = portal.btx_contacts;
        // this.deals = portal.btx_deals;
        // this.leads = portal.btx_leads;
        // this.rpas = portal.btx_rpas;
        // this.callings = portal.callings;
        // this.departaments = portal.departaments;
        // this.offerTemplatePortal = portal.offerTemplatePortal;
        // this.offer_zakupki_settings = portal.offer_zakupki_settings;
        // this.provider_currents = portal.provider_currents;
        // this.bx_document_deals = portal.bx_document_deals;
        // this.deals = portal.deals;
        // this.ais = portal.ais;
        // this.bx_rqs = portal.bx_rqs;
        // this.transcriptions = portal.transcriptions;




    }
    @ApiPropertyOptional({
        description: 'Client',
        example: { id: 1, name: 'John Doe', email: 'john.doe@example.com' },
        type: ClientResponseDto,
    })
    client?: ClientResponseDto | null;

    @ApiPropertyOptional({
        description: 'Agents',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],

    })
    agents?: any[] | null;

    @ApiPropertyOptional({
        description: 'Templates',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],

    })
    templates?: any[] | null;

    @ApiPropertyOptional({
        description: 'Contracts',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [PortalContractResponseDto],
    })
    contracts?: PortalContractResponseDto[] | null;



    @ApiPropertyOptional({
        description: 'Smarts',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [SmartResponseDto],
    })
    smarts?: SmartResponseDto[] | null;

    @ApiPropertyOptional({
        description: 'Timezones',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [TimezoneResponseDto],
    })
    timezones?: TimezoneResponseDto[] | null;

    @ApiPropertyOptional({
        description: 'Portal Contracts',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [PortalContractResponseDto],
    })
    portalContracts?: PortalContractResponseDto[] | null;

    @ApiPropertyOptional({
        description: 'Portal Measures',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [PortalMeasureResponseDto],
    })
    portalMeasures?: PortalMeasureResponseDto[] | null;


    // @ApiPropertyOptional({
    //     description: 'Regions',
    //     example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
    //     type: [RegionResponseDto],
    // })

    // regions?: PortalRegionResponseDto[] | null;


    // @ApiPropertyOptional({
    //     description: 'Bitrix Apps',
    //     example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
    //     type: [BitrixAppResponseDto],
    // })
    // apps?: BitrixAppResponseDto[] | null;

    // @ApiPropertyOptional({
    //     description: 'Bitrix Lists',
    //     example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
    //     type: [BitrixListResponseDto],
    // })
    // lists?: BitrixListResponseDto[] | null;
    
    // @ApiPropertyOptional({
    //     description: 'Btx Companies',
    //     example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
    //     type: [BtxCompanyResponseDto],
    // })
    // companies?: BtxCompanyResponseDto[] | null;

    // @ApiPropertyOptional({
    //     description: 'Btx Contacts',
    //     example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
    //     type: [BtxContactResponseDto],
    // })
    // contacts?: BtxContactResponseDto[] | null;


}