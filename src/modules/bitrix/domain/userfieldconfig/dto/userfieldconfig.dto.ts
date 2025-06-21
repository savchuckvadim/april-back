import { IUserFieldConfig } from "../interface/userfieldconfig.interface"

class UserFieldConfigBaseDto {
    moduleId: 'crm' | 'rpa'
}

export class UserFieldConfigGetDto extends UserFieldConfigBaseDto {
    id: string | number

}

export class UserFieldConfigListDto extends UserFieldConfigBaseDto {

    select?: Partial<IUserFieldConfig>
    order?: {
        "id": "DESC"
    }
    filter: Partial<IUserFieldConfig>
    start?: -1

}

export class UserFieldConfigAddDto extends UserFieldConfigBaseDto {

    field: Partial<IUserFieldConfig>


}
export class UserFieldConfigUpdateDto extends UserFieldConfigAddDto {
    id: string | number


}
export class UserFieldConfigDeleteDto extends UserFieldConfigBaseDto {
    id: string | number

}

export class UserFieldConfigResponseFieldDto extends UserFieldConfigBaseDto {
    field: IUserFieldConfig
}

export class UserFieldConfigResponseFieldsDto {
    fields: IUserFieldConfig[]
}