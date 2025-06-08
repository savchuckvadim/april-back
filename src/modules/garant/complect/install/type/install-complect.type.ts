export enum ProfComplectCode {
    BUH = 'buh',
    BUHGOS = 'buhgos',
    UR = 'ur',
    EXPERT = 'expert',
    OFFICE = 'office',
    EXZAK = 'exzak',
    GLAVBUH = 'glavbuh',
    GLAVBUHGOS = 'glavbuhgos',
    COMPANY = 'company',
    COMPANY_PRO = 'companyPro',
    EXBUILD = 'exbuild',
    EXJOBSEC = 'exjobsec'
}

export enum ProfComplectNumber {
    BUH = 0,
    BUHGOS = 1,
    UR = 2,
    EXPERT = 3,
    OFFICE = 4,
    EXZAK = 18,
    GLAVBUH = 5,
    GLAVBUHGOS = 6,
    COMPANY = 7,
    COMPANY_PRO = 8,
    EXBUILD = 19,
    EXJOBSEC = 20
}

export enum ProfComplectName {
    BUH = 'Бухгалтер',
    BUHGOS = 'Бухгалтер госсектора',
    UR = 'Юрист',
    EXPERT = 'Эксперт PRO',
    OFFICE = 'Офис',
    EXZAK = 'Эксперт в Закупках',
    GLAVBUH = 'Главный Бухгалтер',
    GLAVBUHGOS = 'Главный Бухгалтер госсектора',
    COMPANY = 'Предприятие',
    COMPANY_PRO = 'Предприятие PRO',
    EXBUILD = 'Стройэксперт',
    EXJOBSEC = 'Эксперт по охране труда'
}

export enum UniversalComplectCode {
    CLASSIC = 'classic',
    CLASSIC_PLUS = 'classicPlus',
    UN = 'un',
    UNLUS = 'unlus',
    PROFESSIONAL = 'professional',
    MASTER = 'master',
    ANALITIK = 'analitik',
    ANALITIK_PLUS = 'analitikPlus',
    MAXIMUM = 'maximum'
}

export enum UniversalComplectNumber {
    CLASSIC = 9,
    CLASSIC_PLUS = 10,
    UN = 11,
    UNLUS = 12,
    PROFESSIONAL = 13,
    MASTER = 14,
    ANALITIK = 15,
    ANALITIK_PLUS = 16,
    MAXIMUM = 17
}

export enum UniversalComplectName {
    CLASSIC = 'Классик',
    CLASSIC_PLUS = 'Классик+',
    UN = 'Универсал',
    UNLUS = 'Универсал+',
    PROFESSIONAL = 'Профессионал',
    MASTER = 'Мастер',
    ANALITIK = 'Аналитик',
    ANALITIK_PLUS = 'Аналитик+',
    MAXIMUM = 'Максимум'
}

export interface IInstallComplectBase {
    name: string;
    title: string;
    fullTitle: string;
    shortTitle: string;
    isChanging: boolean;
    weight: number;
    className: string;
    number: number;
    withConsalting: boolean;
    consaltingProduct: any[];
    type: string;
    withStar: boolean;
    star: any[];
    regions: any[];
}

export interface IInstallProfComplect extends IInstallComplectBase {
    tag: string;
    filling?: string[];
    ers?: number[];
    packetsEr?: number[];
    ersInPacket?: number[];
    lt?: number[];
    ltInPacket?: number[];
    freeBlocks?: number[];
    consalting?: number[];
    noChanged?: string[];
}

export interface IInstallUniversalComplect extends IInstallComplectBase {
    filling?: string[];
    packetsEr?: number[];
    ersInPacket?: number[];
    ers?: number[];
    lt?: number[];
    ltInPacket?: number[];
    currentStatusInputComplectName?: boolean;
    freeBlocks?: number[];
    consalting?: number[];
}
