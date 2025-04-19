export interface BitrixBatchResult {
    result: {
      [key: string]: number; // например, add_activity_352690: 4035086
    };
    result_error?: Record<string, any>; // если есть ошибки
    result_total?: any[];
    result_next?: any[];
    result_time?: Record<string, any>;
  }
  
  export interface BitrixBatchResponse {
    result: BitrixBatchResult;
    time: {
      start: number;
      finish: number;
      duration: number;
      processing: number;
      date_start: string;
      date_finish: string;
      operating_reset_at: number;
      operating: number;
    };
  }
  