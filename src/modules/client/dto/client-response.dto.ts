import { PortalResponseDto } from '@/apps/admin/portal/dto/portal-response.dto';
import { UserResponseDto } from '@/apps/bitrix-app-client/user/dto/user-response.dto';
import { BitrixAppDto } from '@/modules/bitrix-setup/app/dto/bitrix-app.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientResponseDto {
    @ApiProperty({
        description: 'Client ID',
        example: 1,
        type: Number,
    })
    id: number;

    @ApiProperty({
        description: 'Client name',
        example: 'Acme Corp',
        type: String,
    })
    name: string;

    @ApiPropertyOptional({
        description: 'Client email',
        example: 'contact@acme.com',
        type: String,
    })
    email?: string | null;

    @ApiPropertyOptional({
        description: 'Client status',
        example: 'active',
        type: String,
    })
    status?: string | null;

    @ApiPropertyOptional({
        description: 'Client is active',
        example: true,
        type: Boolean,
    })
    is_active?: boolean | null;

    @ApiPropertyOptional({
        description: 'Client created at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    created_at?: Date | string | null;

    @ApiPropertyOptional({
        description: 'Client updated at',
        example: '2024-01-01T00:00:00.000Z',
        type: String,
    })
    updated_at?: Date | string | null;
}


export class ClientWithRelationsResponseDto extends ClientResponseDto {
    @ApiPropertyOptional({
        description: 'Client portal',
        example: 'https://portal.example.com',
        type: PortalResponseDto,
    })
    portal?: PortalResponseDto | null;

    @ApiPropertyOptional({
        description: 'Client users',
        example: [{ id: 1, name: 'John Doe', email: 'john.doe@example.com' }],
        type: [UserResponseDto],
    })
    users: UserResponseDto[] | null;
}