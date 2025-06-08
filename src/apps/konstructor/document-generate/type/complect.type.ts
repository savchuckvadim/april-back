// export type ComplectFromBackType = {
//     number: ComplectNumberType,
//     name: ComplectTitlesEnum,
//     fullName: ComplectFullTitlesEnum,
//     shortName: ComplectShortitlesEnum,
//     abs: AbsType,
//     weight: ComplectWeightType,
//     isChanging: boolean,
//     withConsalting: boolean,
//     type: ComplectTypes,

// }




export type ComplectType = {

    name: ComplectNamesEnum  //name for development on english
    fullTitle: ComplectFullTitlesEnum //Полное официальное наименование - Итоговое , идет в документацию и в название Product и Product Row
    title: ComplectTitlesEnum  //обычное отображаемое имя
    shortTitle: ComplectNamesEnum  //сокращенное наименование для верстки например ГЛ. Бух

    tag: string,
    className: string,
    number: ComplectNumberType
    weight: ComplectWeightType

    withConsalting: boolean
    isChanging: boolean

    filling: Array<string>
    ers: Array<number>
    packetsEr: Array<number>
    ersInPacket: Array<number>
    lt: Array<number>
    ltInPacket: Array<number>
    withStar: boolean
    star: Array<number>
    freeBlocks: Array<number>
    consalting: Array<number>
    consaltingProduct: Array<number>
    type: ComplectTypes
    abs: false | number
    msk?: number
    regions?: number
}




export type ComplectNumberType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18
export type ComplectWeightType = 1 | 1.5 | 2 | 2.5 | 3 | 3.5 | 4 | 6 | 7 | 8 | 9 | 12 | 12.5 | 15.5
type AbsType = 1 | 2 | 3 | 4 | 4.5 | 5 | 6 | 8 | 10 | 14

export enum ComplectNamesEnum {

    ProfBuh = 'buh',
    ProfBuhgos = 'buhgos',
    ProfUr = 'ur',
    ProfExpert = 'expert',
    ProfOffice = 'office',
    ProfGlavbuh = 'glavbuh',
    ProfGlavbuhgos = 'glavbuhgos',
    ProfPred = 'company',
    ProfPredPro = 'companyPro',
    Classic = 'classic',
    ClassicPlus = 'classicPlus',
    Universal = 'un',
    UniversalPlus = 'unPlus',
    Professional = 'professional',
    Master = 'master',
    Analitik = 'analitik',
    AnalitikPlus = 'analitikPlus',
    Maximum = 'maximum',
    Default = 'default'
}


export enum ComplectTitlesEnum {

    ProfBuh = 'Бухгалтер',
    ProfBuhgos = 'Бухгалтер госсектора',
    ProfUr = 'Юрист',
    ProfExpert = 'Эксперт PRO',
    ProfOffice = 'Офис',
    ProfGlavbuh = 'Главный Бухгалтер',
    ProfGlavbuhgos = 'Главный Бухгалтер госсектора',
    ProfPred = 'Предприятие',
    ProfPredPro = 'Предприятие PRO',
    Classic = 'Классик',
    ClassicPlus = 'Классик+',
    Universal = 'Универсал',
    UniversalPlus = 'Универсал+',
    Professional = 'Профессионал',
    Master = 'Мастер',
    Analitik = 'Аналитик',
    AnalitikPlus = 'Аналитик+',
    Maximum = 'Максимум',
    Default = 'Универсальный комплект'
}


export enum ComplectFullTitlesEnum {

    ProfBuh = 'Гарант-Бухгалтер',
    ProfBuhgos = 'Гарант-Бухгалтер госсектора',
    ProfUr = 'Гарант-Юрист',
    ProfExpert = 'Гарант-Эксперт PRO',
    ProfOffice = 'Гарант-Офис',
    ProfGlavbuh = 'Гарант-Главный Бухгалтер',
    ProfGlavbuhgos = 'Гарант-Главный Бухгалтер госсектора',
    ProfPred = 'Гарант-Предприятие',
    ProfPredPro = 'Гарант-Предприятие PRO',
    Classic = 'Гарант-Классик',
    ClassicPlus = 'Гарант-Классик+',
    Universal = 'Гарант-Универсал',
    UniversalPlus = 'Гарант-Универсал+',
    Professional = 'Гарант-Профессионал',
    Master = 'Гарант-Мастер',
    Analitik = 'Гарант-Аналитик',
    AnalitikPlus = 'Гарант-Аналитик+',
    Maximum = 'Гарант-Максимум',
}

export enum ComplectShortitlesEnum {

    ProfBuh = 'Бухгалтер',
    ProfBuhgos = 'Бухгалтер госсектора',
    ProfUr = 'Юрист',
    ProfExpert = 'Эксперт PRO',
    ProfOffice = 'Офис',
    ProfGlavbuh = 'Гл. Бухгалтер',
    ProfGlavbuhgos = 'Гл. Бухгалтер госсектора',
    ProfPred = 'Предприятие',
    ProfPredPro = 'Предприятие PRO',
    Classic = 'Классик',
    ClassicPlus = 'Классик+',
    Universal = 'Универсал',
    UniversalPlus = 'Универсал+',
    Professional = 'Профессионал',
    Master = 'Мастер',
    Analitik = 'Аналитик',
    AnalitikPlus = 'Аналитик+',
    Maximum = 'Максимум',
}






////////////////////////CONSALTING

export type ConsaltingType = {

    //TODO : name:  'experts' | 'premium'  //name for development on english
    name: ConsaltingTitlesEnum,
    fullTitle: ConsaltingFullTitlesEnum //Полное официальное наименование - Итоговое , идет в документацию и в название Product и Product Row
    title: ConsaltingFullTitlesEnum  //обычное отображаемое имя
    shortTitle: ConsaltingFullTitlesEnum  //сокращенное наименование для верстки например ГЛ. Бух



    number: ComplectNumberType
    weight: ComplectWeightType

    withConsalting: boolean
    isChanging: boolean


    // CONSALTING CONTRACT COMMENTS

    contractProp: string
    contractComment: string
    acontractProp: string
    acontractComment: string
    lcontractProp: string
    lcontractComment: string


    type: ConsaltingComplectType
    abs: number
    msk: false
    regions: false
}


export type ConsaltingFromBackType = {

    //TODO : name:  'experts' | 'premium'  //name for development on english

    abs: 0 | 1 | 3
    acontractComment: string
    // | "*Информационный блок «База знаний службы Правового консалтинга. Советы экспертов. Проверки, налоги, право» содержит отобранные Продавцом для включения в данный информационный блок заключения по практическим ситуациям, возникшим  у Покупателей."
    acontractProp: string
    // | "Содержит информационный блок «Советы экспертов. Проверки, налоги, право»*"
    contractComment: string
    // | "Выбранный комплект дополняется информационным блоком «База знаний службы Правового консалтинга. Советы экспертов. Проверки, налоги, право» * \n*Информационный блок «База знаний службы Правового консалтинга» предоставляется в соответствии с Правилами предоставления информационного блока «База знаний службы Правового консалтинга», подписываемыми сторонами и являющимися неотъемлемой частью настоящего Договора."
    contractProp: string
    // "Правовой Консалтинг. Советы экспертов. Проверки, налоги, право" | "Правовой консалтинг. Премиум"
    description: string
    lcontractComment: string
    // | "* Информационный блок «База знаний службы Правового консалтинга» содержит отобранные Лицензиаром для включения в данный информационный блок заключения по практическим ситуациям, возникшим  у пользователей ЭПС «Система ГАРАНТ»."
    lcontractProp: string
    // | "Выбранный комплект дополняется информационным блоком «База знаний службы Правового консалтинга. Советы экспертов»" | "Выбранный комплект дополняется информационным блоком «База знаний службы Правового консалтинга» "
    name: ConsaltingTitlesEnum
    number: 0 | 1 | 2
    price: 0
    title: ConsaltingFullTitlesEnum
    isNoService?: boolean

}


export enum ConsaltingTitlesEnum {
    Small = 'Советы Экспертов',
    Medium = 'Правовой Консалтинг',
}
export enum ConsaltingFullTitlesEnum {
    Small = 'Правовой Консалтинг. Советы экспертов. Проверки, налоги, право',
    Medium = 'Правовой консалтинг. Премиум',
}







///////////////////LEGAL TECH

export type LegalTechType = {

    name: 'small' | 'medium' | 'big'  //name for development on english
    fullTitle: LtFullTitlesEnum //Полное официальное наименование - Итоговое , идет в документацию и в название Product и Product Row
    title: LtFullTitlesEnum  //обычное отображаемое имя
    shortTitle: LtTitlesEnum  //сокращенное наименование для верстки например ГЛ. Бух
    fullName: LtTitlesEnum
    index: 0 | 1 | 2,
    weight: 2 | 5 | 10,
    number: 13 | 14 | 15
    withConsalting: false
    isChanging: boolean
    isPackage: boolean
    type: LegalTechComplectType
    abs: false
    msk: number
    regions: number
}

export type LegalTechFromBackType = {
    description: string
    eleven: number  //не используем
    fullName: LtFullTitlesEnum
    msk: number
    name: LtTitlesEnum
    number: 13 | 14 | 15
    productId: number | null
    regions: number
    six: number  //не используем
    type: "package"
    weight: 2 | 5 | 10
    isNoService?: boolean

}


export enum LtFullTitlesEnum {
    Small = 'Гарант Legal-Tech. Малый Пакет',
    Medium = 'Гарант Legal-Tech. Средний Пакет',
    Big = 'Гарант Legal-Tech. Большой Пакет',
}
export enum LtTitlesEnum {
    Small = 'Малый Пакет',
    Medium = 'Средний Пакет',
    Big = 'Большой Пакет',
}




export enum ComplectsAndServicesTypeNamesEnum {
    PROF = 'prof',
    UNIVERSAL = 'universal',
    // LEGALTECH = 'legalTech',
    LT = 'lt',
    LT_PACKAGE = 'package',
    CONSALTING = 'consalting',
    STAR ='star'
}




//////////////////STAR

// export type StarType = {

//     name: 'СТАР'  //name for development on english
//     fullTitle: LtFullTitlesEnum //Полное официальное наименование - Итоговое , идет в документацию и в название Product и Product Row
//     title: LtFullTitlesEnum  //обычное отображаемое имя
//     shortTitle: LtTitlesEnum  //сокращенное наименование для верстки например ГЛ. Бух
//     fullName: LtTitlesEnum

//     index: 0 | 1 | 2,
//     weight: 2 | 5 | 10,


//     number: 13 | 14 | 15


//     withConsalting: false
//     isChanging: boolean
//     isPackage: boolean

//     type: LegalTechComplectType
//     abs: false
//     msk: number
//     regions: number
// }

// export type StarFromBackType = {
//     number: 0 | 1
//     name: StarTitlesEnum.STAR
//     description: string
//     fullName: StarFullTitlesEnum.STAR
//     msk: number
//     regions: number
//     type: StarComplectType
//     weight: 10
//     isNoService?: boolean

// }


export enum StarFullTitlesEnum {
    STAR = 'Система торговых аналитических решений',

}
export enum StarTitlesEnum {
    STAR = 'Стар',

}












export type ComplectsAndServicesTitlesType = ComplectTitlesEnum | LtTitlesEnum | ConsaltingTitlesEnum | StarTitlesEnum

export type ComplectsAndServicesFullTitlesType = ComplectFullTitlesEnum | LtFullTitlesEnum | ConsaltingFullTitlesEnum | StarFullTitlesEnum




type LegalTechComplectType = ComplectsAndServicesTypeNamesEnum.LT | ComplectsAndServicesTypeNamesEnum.LT_PACKAGE
type ConsaltingComplectType = ComplectsAndServicesTypeNamesEnum.CONSALTING
type StarComplectType = ComplectsAndServicesTypeNamesEnum.STAR




export type ComplectTypes = ComplectsTypesEnum.PROF | ComplectsTypesEnum.UNIVERSAL
export enum ComplectsTypesEnum {
    PROF = 'prof',
    UNIVERSAL = 'universal',
}






