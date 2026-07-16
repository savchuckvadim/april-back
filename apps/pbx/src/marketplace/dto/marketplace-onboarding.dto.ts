import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsNotEmpty,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';
import { PortalSessionState } from '../services/marketplace-session.service';

export class OnboardingApplicationDto {
    @ApiProperty({
        description: 'Название организации клиента',
        example: 'ООО «Ромашка»',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(2)
    @MaxLength(255)
    organizationName: string;

    @ApiProperty({
        description: 'Контактный email клиента (для связи вендора)',
        example: 'director@romashka.ru',
        type: String,
    })
    @IsEmail()
    contactEmail: string;
}

export class OnboardingOrganizationDto {
    @ApiPropertyOptional({
        description: 'Название организации из заявки',
        example: 'ООО «Ромашка»',
        type: String,
    })
    name?: string;

    @ApiPropertyOptional({
        description: 'Контактный email из заявки',
        example: 'director@romashka.ru',
        type: String,
    })
    email?: string;
}

export class OnboardingStateDto {
    @ApiProperty({
        description: 'Состояние допуска портала',
        example: PortalSessionState.PENDING,
        enum: PortalSessionState,
    })
    state: PortalSessionState;

    @ApiPropertyOptional({
        description: 'Поданная заявка (если клиент уже привязан)',
        type: OnboardingOrganizationDto,
    })
    organization?: OnboardingOrganizationDto;
}
