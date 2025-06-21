import { BxParticipantsData } from "./bx-participants-data";

export enum BxDealDataKeys {
    prefix = 'prefix',
    inn = 'inn',
    companyName = 'companyName',
    directorPosition = 'directorPosition',
    directorName = 'directorName',
    directorBased = 'directorBased',
    directorPhone = 'directorPhone',
    contact_up_doc = 'contact_up_doc',
    contact_exchange_doc_email = 'contact_exchange_doc_email',
    contact_exchange_doc_phone = 'contact_exchange_doc_phone',
    organization_type = 'organization_type',
    organizationfiz_fio = 'organizationfiz_fio',
    seminar_format = 'seminar_format',
    seminar_up_packet = 'seminar_up_packet',
    participants = 'participants'
}
export const BxDealData: TDealData = {
    [BxDealDataKeys.prefix]: {
        code: BxDealDataKeys.prefix as const,
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1750061186' as const,
        name: 'ПРЕФИКС' as const,
        type: 'enumeration' as const,
        group: 'company' as const,
        value: '' as string,
        list: [
            {
                bitrixId: '0',
                name: 'Нет' as const,
                sort: '10'
            },
           
        ]
    },
    [BxDealDataKeys.inn]: {
        code: 'inn' as const,
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1687845131' as const,
        name: 'ИНН' as const,
        type: 'string' as const,
        group: 'company' as const,
        value: '' as string
    },
    [BxDealDataKeys.companyName]: {
        code: 'companyName' as const,
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414243' as const,
        name: 'Наименование компании' as const,
        type: 'string' as const,
        group: 'company' as const,
        value: '' as string
    },
    [BxDealDataKeys.directorPosition]: {
        code: 'directorPosition' as const,
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414340' as const,
        name: 'Должность директора' as const,
        type: 'string' as const,
        group: 'company' as const,
        value: '' as string
    },
    [BxDealDataKeys.directorName]: {
       
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414391' as const,
        name: 'ФИО директора' as const,
        type: 'string' as const,
        code: 'directorName' as const,
        group: 'company' as const,
        value: '' as string
    },
    [BxDealDataKeys.directorBased]: {
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414441' as const,
        name: 'Руководитель действует на основании' as const,
        type: 'string' as const,
        code: 'directorBased' as const,
        group: 'company' as const,
        value: '' as string
    },
    [BxDealDataKeys.directorPhone]: {
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414493' as const,
        name: 'Телефон директора' as const,
        code: 'directorPhone' as const,
        group: 'company' as const,
        type: 'string' as const,
        value: '' as string
    },

    [BxDealDataKeys.contact_up_doc]: {
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1743414644' as const,
        name: 'Контактное лицо для направления комплекта документов \"Учетная политика\" (ФИО, мобильный телефон, e-mail)' as const,
        type: 'string' as const,
        code: 'contact_up_doc' as const,
        group: 'contacts' as const,
        value: '' as string
    },
    [BxDealDataKeys.contact_exchange_doc_email]: {
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1744112127' as const,
        name: 'Контактное лицо для обмена документами (E-mail))' as const,
        type: 'string' as const,
        code: 'exchange_doc_email' as const,
        group: 'contacts' as const,
        value: '' as string
    },
    [BxDealDataKeys.contact_exchange_doc_phone]: {
        multiple: false as const,
        mandatory: false as const,
        bitrixId: 'UF_CRM_1744112153' as const,
        name: 'Контактное лицо для обмена документами (Телефон)' as const,
        type: 'string' as const,
        code: 'exchange_doc_phone' as const,
        group: 'contacts' as const,
        value: '' as string
    },


    [BxDealDataKeys.organization_type]: {
        id: "8430" as const,
        bitrixId: "UF_CRM_1744358047" as const,
        type: "enumeration" as const,
        list: [
            {
                bitrixId: "18030",
                name: "Физическое лицо",
                sort: "10"
            },
            {
                bitrixId: "18032",
                name: "Юридическое лицо",
                sort: "20"
            }
        ] as TFieldItem[],
        name: "Вы являетесь физическим или юридическим лицом?" as const,
        code: 'organization_type' as const,
        multiple: false as const,
        mandatory: false as const,
        group: 'organization' as const,
        value: '' as string
    },
    [BxDealDataKeys.organizationfiz_fio]    : {

        id: "8432" as const,
        bitrixId: "UF_CRM_1744358668" as const,
        type: "string" as const,
        name: "ФИО (Физлцо)" as const,
        code: 'fiz_fio' as const,
        multiple: false as const,
        mandatory: false as const,
        group: 'organization' as const,
        value: '' as string

    },



    [BxDealDataKeys.seminar_format]: {
        id: "8322",
        bitrixId: "UF_CRM_1743997299",
        type: "enumeration",
        list: [
            {
                bitrixId: "17822",
                name: "Семинар",
                sort: "10"
            },
            {
                bitrixId: "17824",
                name: "ППК",
                sort: "20"
            },
            {
                bitrixId: "17826",
                name: "Семинар + ППК",
                sort: "30"
            },
            {
                bitrixId: "17828",
                name: "УП",
                sort: "40"
            }
        ],
        name: "Форма регистрации",
        code: null,
        multiple: false,
        mandatory: false,
        group: 'seminar',
        value: '' as string
    },
    [BxDealDataKeys.seminar_up_packet]: {
        id: "8468",
        bitrixId: "UF_CRM_1744363400",
        type: "enumeration",
        code: 'up_packet',
        list: [
            {
                bitrixId: "18038",
                name: "Учетная политика 2025",
                sort: "10"
            },
            {
                bitrixId: "18040",
                name: "Учетная политика 2024/2025",
                sort: "20"
            }
        ],
        name: "Пакет",
        multiple: false,
        mandatory: false,
        group: 'seminar',
        value: '' as string
    },

    [BxDealDataKeys.participants]: BxParticipantsData

} 

export type TFieldItem = {
    bitrixId: string,
    name: string,
    sort: string
}
export type TField = {
    id?: string
    bitrixId: string
    name: string
    code: string | null
    multiple: boolean
    mandatory: boolean
    group: string
    value: string
    type: 'enumeration' | 'string' | 'boolean' | 'date' | 'number' | 'datetime'
}
export type TFieldSelect = TField & {
    type: 'enumeration',
    list: TFieldItem[],


}
export interface TDealData {
    [BxDealDataKeys.prefix]: TFieldSelect
    [BxDealDataKeys.inn]: TField
    [BxDealDataKeys.companyName]: TField
    [BxDealDataKeys.directorPosition]: TField
    [BxDealDataKeys.directorName]: TField
    [BxDealDataKeys.directorBased]: TField
    [BxDealDataKeys.directorPhone]: TField
    [BxDealDataKeys.contact_up_doc]: TField
    [BxDealDataKeys.contact_exchange_doc_email]: TField
    [BxDealDataKeys.contact_exchange_doc_phone]: TField
    [BxDealDataKeys.organization_type]: TFieldSelect
    [BxDealDataKeys.organizationfiz_fio]: TField
    [BxDealDataKeys.seminar_format]: TFieldSelect
    [BxDealDataKeys.seminar_up_packet]: TFieldSelect
    [BxDealDataKeys.participants]: {
        1: typeof BxParticipantsData[1]
        2: typeof BxParticipantsData[2]
        3: typeof BxParticipantsData[3]
        4: typeof BxParticipantsData[4]
        5: typeof BxParticipantsData[5]
        6: typeof BxParticipantsData[6]
        7: typeof BxParticipantsData[7]
        8: typeof BxParticipantsData[8]
        9: typeof BxParticipantsData[9]
        10: typeof BxParticipantsData[10]
    }
};


// Example usage:
// const bitrixResponse = await fetchBitrixData();
// const updatedDealData = updateDealDataFromBitrixResponse(bitrixResponse);
