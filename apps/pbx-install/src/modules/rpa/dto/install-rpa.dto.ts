/** Имя RPA-процесса (совпадает с папкой шаблона `install/<group>/rpa/<rpaName>` и с `btx_rpas.code`). */
export enum RpaNameEnum {
    SUPPLY = 'supply',
    PRESENTATION = 'presentation',
}

/** Группа шаблонов RPA (сегмент пути `install/<group>/rpa/...`). */
export enum RpaGroupEnum {
    GENERAL = 'general',
    SERVICE = 'service',
    SALES = 'sales',
}

export class InstallRpaDto {
    rpaName: RpaNameEnum;
    group: RpaGroupEnum;
    domain: string;
}
