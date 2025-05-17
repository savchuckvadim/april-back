
export enum EBXTaskMark {
    NONE = '',
    GOOD = 'P',
    BAD = 'N'

}
export interface IBXDepartment {
    ID: number
    NAME: string
    PARENT: string // "1"
    SORT: number
    UF_HEAD?: number // "1"
    USERS?: IBXUser[] | null
}

export interface IBXTask {

    accomplices: []
    accomplicesData: []
    activityDate: "2017-12-29T13:07:19+03:00"
    addInReport: "N"
    allowChangeDeadline: "Y"
    allowTimeTracking: "N"
    auditors: []
    auditorsData: []
    changedBy: "1"
    changedDate: "2017-12-29T13:07:19+03:00"
    closedBy: "81"
    closedDate: "2017-12-29T13:06:18+03:00"
    commentsCount: null
    createdBy: "1"
    createdDate: "2017-12-29T12:15:42+03:00"
    creator: IBXUser
    dateStart: "2017-12-29T13:04:29+03:00"
    deadline: "2017-12-29T15:00:00+03:00"
    description: string
    descriptionInBbcode: "Y"
    durationFact: null
    durationPlan: null
    durationType: "days"
    endDatePlan: null
    exchangeId: null
    exchangeModified: null
    favorite: "N"
    forkedByTemplateId: null
    forumId: null
    forumTopicId: null
    group: []
    groupId: number
    guid: "{9bd11fb5-8e76-4379-b3be-1f4cbe9bae1d}"
    id: number
    isMuted: "N"
    isPinned: "N"
    isPinnedInGroup: "N"
    mark: EBXTaskMark
    matchWorkTime: "N"
    multitask: "N"
    newCommentsCount: 0
    notViewed: "N"
    outlookVersion: "4"
    parentId: null
    priority: "0"
    replicate: "N"
    responsible: IBXUser
    responsibleId: "81"
    serviceCommentsCount: null
    siteId: "s1"
    sorting: null
    stageId: "0"
    startDatePlan: null
    status: "5"
    statusChangedBy: "81"
    statusChangedDate: "2017-12-29T13:06:18+03:00"
    subStatus: "5"
    subordinate: "N"
    taskControl: "N"
    timeEstimate: "0"
    timeSpentInLogs: null
    title: string
    viewedDate: "2017-12-29T19:44:28+03:00"
    xmlId: null
    ufCrmTask: Array<string>
}
export interface IBXUser {
    ACTIVE: boolean
    DATE_REGISTER: string
    EMAIL?: string
    ID: number | string
    IS_ONLINE?: string
    LAST_ACTIVITY_DATE?: string
    LAST_LOGIN?: string
    LAST_NAME: string
    NAME: string
    PERSONAL_BIRTHDAY?: string
    PERSONAL_CITY?: string
    PERSONAL_GENDER?: string
    PERSONAL_MOBILE?: string
    PERSONAL_PHOTO?: string
    PERSONAL_WWW?: string
    SECOND_NAME?: string
 
    TIMESTAMP_X?: Array<string>
    TIME_ZONE_OFFSET?: string
    UF_DEPARTMENT: Array<number>
    UF_EMPLOYMENT_DATE?: string
    UF_PHONE_INNER?: string
    // UF_USR_1570437798556: boolean
    USER_TYPE?: string
    WORK_PHONE?: string
    WORK_POSITION?: string

    // XML_ID: string
}

export interface IBXLead {
    ID: number
    TITLE: string
    UF_CRM_LEAD_QUEST_URL: string
    [key: string]: string | number
}
export interface IBXCompany {
    ASSIGNED_BY_ID: string
    ID: number
    TITLE: string
    UF_CRM_PRES_COUNT: number
    UF_CRM_USER_CARDNUM: string  //регистрационный лист номер
    COMMENTS: string
}
export interface IBXSmart {
    ID: number
    TITLE: string
}

export interface IBXDeal {
    [key: string]: string | number | string[] | number[] | boolean | undefined
    ID: number
    TITLE: string
    CONTACT_IDS?: string[] | number[]
    CATEGORY_ID: string
    STAGE_ID: string
    COMPANY_ID: string
    COMMENTS: string
    ASSIGNED_BY_ID: string
    CREATED_BY_ID: string
    UF_CRM_OP_MHISTORY?: string[]
    UF_CRM_OP_CURRENT_STATUS?: string
    UF_CRM_UC_ID?: string[] //id комплекта арм Garant
    UF_CRM_RPA_ARM_COMPLECT_ID?: string[] //id комплекта арм RPA April
   
}


export interface IBXList {
    NAME: number
    TITLE: string
    BP_PUBLISHED: string
    CODE: string
    CREATED_BY: string
    IBLOCK_ID: string
    IBLOCK_SECTION_ID: string



}

export interface IBXContact {
    ASSIGNED_BY_ID?: string | number
    ID?: number
    NAME?: string
    COMPANY_ID?: string | number
    LAST_NAME?: string
    // TYPE_ID: 'client'
    // SOURCE_ID: number
    // PHONE: string //wrong
    PHONE?: {
        VALUE: string,
        TYPE: string
    }[]
    EMAIL?: {
        VALUE: string,
        TYPE: string
    }[]
    POST?: string
    COMMENTS?: string
}



export interface IBXProductRow {
    ownerType: "D",
    ownerId: string | number,
    productRows: IBXProductRowRow[]

}

export interface IBXProductRowRow {
    id?: number
    priceNetto?: number
    price?: number
    discountSum?: number
    discountTypeId?: number

    productName?: string
    quantity?: number
    customized?: string
    supply?: string
    measureCode?: string
    measureId?: number | string
    sort?: number


}
