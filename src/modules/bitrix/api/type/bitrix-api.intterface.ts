
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