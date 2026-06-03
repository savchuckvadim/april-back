import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString, Matches } from 'class-validator';
import { InstallEntityFieldsBulkDto } from '../../shared';
// import {
//     CompanyAppName,
//     PbxCompanyGroupEnum,
// } from '../services/pbx-company-parse.service';

export class InstallCompanyFieldDto extends InstallEntityFieldsBulkDto {
    @ApiProperty({
        description:
            'Домен Bitrix-портала, на котором выполняется установка полей компании. ' +
            'Передаётся без протокола и завершающего слэша.',
        example: 'example.bitrix24.ru',
        type: String,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^[a-z0-9.-]+\.[a-z]{2,}$/i, {
        message:
            'domain must be a valid hostname without protocol (e.g. example.bitrix24.ru)',
    })
    domain: string;

    // @ApiProperty({
    //     description:
    //         'Группа компании в приложении April. Определяет, какой набор ' +
    //         'полей будет установлен (sales — отдел продаж, service — отдел сервиса).',
    //     example: PbxCompanyGroupEnum.SALES,
    //     enum: PbxCompanyGroupEnum,
    //     enumName: 'PbxCompanyGroupEnum',
    // })
    // @IsEnum(PbxCompanyGroupEnum)
    // group: PbxCompanyGroupEnum;

    // @ApiProperty({
    //     description:
    //         'Имя приложения, для которого устанавливаются поля компании. ' +
    //         '`event` — event-sales, `konstructor` — модуль КП/документов, ' +
    //         '`all` — установить поля сразу для обоих приложений.',
    //     example: CompanyAppName.EVENT,
    //     enum: CompanyAppName,
    //     enumName: 'CompanyAppName',
    // })
    // @IsEnum(CompanyAppName)
    // appName: CompanyAppName;
}
