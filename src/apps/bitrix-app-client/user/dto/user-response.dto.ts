import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'generated/prisma';

export class UserResponseDto {
    constructor(user: User) {
        this.id = Number(user.id);
        this.name = user.name;
        this.surname = user.surname;
        this.email = user.email ?? '';
        this.password = user.password ?? '';
        this.photo = user.photo ?? '';
        this.role_id = Number(user.role_id);
        this.email_verified_at = user.email_verified_at ?? undefined;
        this.bitrix_id = user.bitrix_id ?? '';
        this.client_id = Number(user.client_id);
        this.created_at = user.created_at ?? undefined;
        this.updated_at = user.updated_at ?? undefined;
    }
    @ApiProperty({ description: 'User ID', example: 1 })
    id: number;

    @ApiProperty({ description: 'User name', example: 'John' })
    name: string;

    @ApiProperty({ description: 'User surname', example: 'Doe' })
    surname: string;

    @ApiProperty({ description: 'User email', example: 'john.doe@example.com' })
    email: string;

    @ApiPropertyOptional({ description: 'User password', example: 'password123' })
    password?: string;

    @ApiPropertyOptional({ description: 'User photo URL', example: 'https://example.com/photo.jpg' })
    photo?: string;

    @ApiProperty({ description: 'Role ID', example: 1 })
    role_id: number;

    @ApiPropertyOptional({ description: 'Email verified at', example: '2024-01-01T00:00:00.000Z' })
    email_verified_at?: Date;

    @ApiPropertyOptional({ description: 'Bitrix user ID', example: '12345' })
    bitrix_id?: string;

    @ApiProperty({ description: 'Client ID', example: 1 })
    client_id: number;

    @ApiProperty({ description: 'Created at', example: '2024-01-01T00:00:00.000Z' })
    created_at?: Date;

    @ApiProperty({ description: 'Updated at', example: '2024-01-01T00:00:00.000Z' })
    updated_at?: Date;
}
