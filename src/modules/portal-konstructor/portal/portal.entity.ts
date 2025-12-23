import { ApiProperty } from '@nestjs/swagger';
import { ProviderEntity } from '../provider/provider.entity';
import { TemplateBaseEntity } from '../template-base';


export class PortalEntity {
    constructor(
        public readonly id: string,
        public readonly createdAt: Date | null,
        public readonly updatedAt: Date | null,
        public readonly domain: string | null,
        public readonly key: string | null,
        public readonly cRestClientId: string | null,
        public readonly cRestClientSecret: string | null,
        public readonly cRestWebHookUrl: string | null,
        public readonly number: number,
        public readonly providers: ProviderEntity[] | null,
        public readonly templates: TemplateBaseEntity[] | null,
        public readonly clientId?: number | null | undefined,
    ) {}
}


export class PortalDto {
    constructor(portal: PortalEntity) {
        this.id = String(portal?.id) || '';

        this.domain = portal.domain || '';
        this.key = portal.key || '';
        this.cRestClientId = portal.cRestClientId || '';
        this.cRestClientSecret = portal.cRestClientSecret || '';

        this.number = portal.number;

    }
    @ApiProperty({
        description: 'ID портала',
        example: '1',
        type: String,
    })
    id: string;

    @ApiProperty({
        description: 'Домен портала',
        example: 'example.com',
        type: String,
    })
    domain?: string;
    @ApiProperty({
        description: 'Ключ портала',
        example: '1234567890',
        type: String,
    })
    key?: string;
    @ApiProperty({
        description: 'ID клиента',
        example: 1,
        type: Number,
    })
    clientId?: number;
    @ApiProperty({
        description: 'Номер портала',
        example: 1,
        type: Number,
    })
    number?: number;


    @ApiProperty({
        description: 'ID клиента',
        example: '1234567890',
        type: String,
    })
    cRestClientId?: string;
    @ApiProperty({
        description: 'ID клиента',
        example: '1234567890',
        type: String,
    })
    cRestClientSecret?: string;

}
