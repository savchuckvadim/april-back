import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreatePortalContactDto {
    @ApiProperty({
        description: 'ID портала в нашей БД',
        example: 1,
        type: Number,
    })
    @IsNumber()
    @Min(1)
    portalId!: number;

    @ApiProperty({
        description: 'Системное имя контакта',
        example: 'contact_main',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    name!: string;

    @ApiProperty({
        description: 'Заголовок',
        example: 'Контакт портала',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    title!: string;

    @ApiProperty({
        description: 'Код',
        example: 'PORTAL_CONTACT',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    code!: string;
}
