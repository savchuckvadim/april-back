// import { PBXService } from "@/modules/pbx";

// export class SmartFiledDto {

//     id: number | null = null
//     is_rewrite: string | boolean | null = null
//     isNeedUpdate: boolean = false
//     name: string
//     appType: string
//     type: string
//     items: GDealFieldItemDTO[] | null = []
//     code: string
//     lead: string
//     company: string | number
//     contact: string | null = null
//     deal: string | number
//     smart: string
//     order: number
//     multiple: boolean | null = false
//     isMultiple: boolean | null = false

// }
// export class GDealFieldItemDTO {
//     bitrixId: number | null = null
//     value: string | number
//     xml_id: string
//     code: string
//     sort: number
// }
// export class SmartFieldService {

//     constructor(private readonly pbx: PBXService) { }

//     async addToBitrix(domain, fields: SmartFiledDto[]) {
//         const { bitrix } = await this.pbx.init(domain)
//     }
// }