export interface Initializable<TParam = unknown> {
    init(param: TParam): void;
}
