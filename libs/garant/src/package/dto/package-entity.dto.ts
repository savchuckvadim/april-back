import { ApiProperty } from '@nestjs/swagger';
import { PackageEntity } from '../entity/package.entity';
import { PackageProductTypeEnum, PackageTypeEnum } from '../types/package.type';
import { PackageCreateDto } from './package-create.dto';

export class PackageEntityDto extends PackageCreateDto {
    constructor(packageEntity: PackageEntity) {
        super();
        this.id = packageEntity.id;
        this.name = packageEntity.name;
        this.fullName = packageEntity.fullName;
        this.shortName = packageEntity.shortName;
        this.description = packageEntity.description ?? '';
        this.code = packageEntity.code;
        this.type = packageEntity.type;
        this.color = packageEntity.color ?? '';
        this.weight = packageEntity.weight ?? 0;
        this.abs = packageEntity.abs ?? 0;
        this.number = packageEntity.number;
        this.productType =
            packageEntity.productType ?? PackageProductTypeEnum.GARANT;
        this.withABS = packageEntity.withABS;
        this.isChanging = packageEntity.isChanging;
        this.withDefault = packageEntity.withDefault;
        this.infoblock_id = packageEntity.infoblock_id ?? '';
        this.info_group_id = packageEntity.info_group_id ?? '';
    }
    @ApiProperty({
        description: 'ID пакета',
        example: '1',
        type: String,
    })
    id: string;
    // @ApiProperty({
    //     description: 'Название пакета',
    //     example: 'Гарант Пакет',
    //     type: String,
    // })
    // name: string;
    // @ApiProperty({
    //     description: 'Полное название пакета',
    //     example: 'Гарант Пакет',
    //     type: String,
    // })
    // fullName: string;
    // @ApiProperty({
    //     description: 'Короткое название пакета',
    //     example: 'Пакет',
    //     type: String,
    // })
    // shortName: string;
    // @ApiProperty({
    //     description: 'Описание пакета',
    //     example: 'Описание пакета',
    //     type: String,
    // })
    // description: string;
    // @ApiProperty({
    //     description: 'Код пакета',
    //     example: 'package',
    //     type: String,
    // })
    // code: string;
    // @ApiProperty({
    //     description: 'Тип пакета',
    //     example: PackageTypeEnum.PROF,
    //     enum: PackageTypeEnum,
    //     enumName: 'PackageTypeEnum',
    // })
    // type: PackageTypeEnum;
    // @ApiProperty({
    //     description: 'Цвет пакета',
    //     example: '#FF0000',
    //     type: String,
    // })
    // color: string;
    // @ApiProperty({
    //     description: 'Вес пакета',
    //     example: 3.5,
    //     type: Number,
    // })
    // weight: number;
    // @ApiProperty({
    //     description: 'ABS пакета',
    //     example: 1.5,
    //     type: Number,
    // })
    // abs: number;
    // @ApiProperty({
    //     description: 'Номер пакета',
    //     example: 1,
    //     type: Number,
    // })
    // number: number;
    // @ApiProperty({
    //     description: 'Тип продукта',
    //     example: PackageProductTypeEnum.GARANT,
    //     enum: PackageProductTypeEnum,
    //     enumName: 'PackageProductTypeEnum',
    // })
    // productType: PackageProductTypeEnum;
    // @ApiProperty({
    //     description: 'Наличие ABS',
    //     example: false,
    //     type: Boolean,
    // })
    // withABS: boolean;
    // @ApiProperty({
    //     description: 'Изменяемый пакет',
    //     example: true,
    //     type: Boolean,
    // })
    // isChanging: boolean;
    // @ApiProperty({
    //     description: 'Есть ли наполнение по умолчанию',
    //     example: false,
    //     type: Boolean,
    // })
    // withDefault: boolean;
    @ApiProperty({
        description: 'ID инфоблока',
        example: '1',
        type: String,
    })
    infoblock_id: string;
    @ApiProperty({
        description: 'ID группы инфоблоков',
        example: '1',
        type: String,
    })
    info_group_id: string;
}
