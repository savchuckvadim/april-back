export enum EnumEventPlanCode {
    COLD = 'cold',
    WARM = 'warm',
    PRESENTATION = 'presentation',
    HOT = 'hot',
    PAY = 'moneyAwait',
    SUPPLY = 'supply',
}

export type EventPlanCall = {
    id: number;
    code: EnumEventPlanCode;
    name: string;
};
