export enum PresentationCountProp {
    COMPANY = 'company',
    SMART = 'smart',
    DEAL = 'deal',
}

export interface PresentationStateCount {
    [PresentationCountProp.COMPANY]: number;
    [PresentationCountProp.SMART]: number;
    [PresentationCountProp.DEAL]: number;
}
