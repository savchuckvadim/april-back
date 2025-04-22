export enum EV_PLAN_CODE {
    COLD = 'cold',
    WARM = 'warm',
    PRESENTATION = 'presentation',
    HOT = 'hot',
    PAY = 'moneyAwait',
    SUPPLY = 'supply',
  }
  
  export type EventPlanCall = {
    id: number;
    code: EV_PLAN_CODE;
    name: string;
  };