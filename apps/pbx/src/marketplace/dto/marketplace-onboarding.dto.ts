import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEmail,
    IsNotEmpty,
    IsOptional,
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
        description:
            'Фамилия контактного лица (предзаполняется из профиля Bitrix)',
        example: 'Иванов',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    lastName: string;

    @ApiProperty({
        description: 'Имя контактного лица (предзаполняется из профиля Bitrix)',
        example: 'Пётр',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    firstName: string;

    @ApiProperty({
        description:
            'Контактный email клиента: адрес организации, на него по умолчанию уходит код подключения',
        example: 'director@romashka.ru',
        type: String,
    })
    @IsEmail()
    contactEmail: string;
}

/**
 * Запрос кода подключения (повторная отправка или отправка на другой адрес).
 *
 * Контактный email организации этой ручкой НЕ переписывается: адрес доставки
 * относится к конкретному коду. Подробности — ai/tasks/
 * bitrix-marketplace-client-identity.md, раздел «доставка ≠ идентичность».
 */
export class RequestInviteCodeDto {
    @ApiPropertyOptional({
        description:
            'Адрес доставки кода. Если не передан — код уйдёт на контактный email организации. ' +
            'Отправку на другой адрес вправе запросить только администратор портала.',
        example: 'new-director@romashka.ru',
        type: String,
    })
    @IsOptional()
    @IsEmail()
    @MaxLength(255)
    deliveryEmail?: string;
}

export class RequestInviteCodeResultDto {
    @ApiProperty({
        description: 'Запрос принят и передан вендору',
        example: true,
        type: Boolean,
    })
    accepted: boolean;

    @ApiProperty({
        description:
            'Маскированный адрес, на который вендор отправит код (email целиком наружу не отдаём)',
        example: 'd***r@romashka.ru',
        type: String,
    })
    deliveryEmailMasked: string;
}

export class OnboardingOrganizationDto {
    @ApiPropertyOptional({
        description: 'Название организации из заявки',
        example: 'ООО «Ромашка»',
        type: String,
    })
    name?: string;

    /**
     * Наружу отдаём МАСКИРОВАННЫЙ адрес: кабинет открывает любой сотрудник
     * портала, а полный контактный email организации ему видеть незачем —
     * для экрана «код уйдёт на …» достаточно узнаваемого огрызка.
     */
    @ApiPropertyOptional({
        description:
            'Маскированный контактный email организации (полный адрес наружу не отдаётся)',
        example: 'd***r@romashka.ru',
        type: String,
    })
    emailMasked?: string;
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
