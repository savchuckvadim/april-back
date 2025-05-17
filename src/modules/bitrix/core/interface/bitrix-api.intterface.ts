
export interface IBitrixBatchResponse {

    result: IBitrixBatchResponseResult;


}
export interface IBitrixBatchResponseResult {

    result: {
        [key: string]: any;
    };
    result_error: {
        [key: string]: IBitrixBatchError;
    } | [];
    result_total: {
        [key: string]: any;
    }[];
    result_next: {
        [key: string]: any;
    }[];


}
export interface IBitrixBatchError {
    error: string;
    error_description: string;
}

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


export interface IBitrixResponse<T> {

    result: T;
    next: number;
    total: number;
    time: {
        "start": string;
        "finish": string;
        "duration": string;
        "processing": string;
        "date_start": string;
        "date_finish": string;
        "operating_reset_at": string;
        "operating": string;
    }

}
// export interface IBitrixResponseResult<T> {

//     [key: string]: T;


// }