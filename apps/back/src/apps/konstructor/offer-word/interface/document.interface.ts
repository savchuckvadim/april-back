export interface IResultDocumentLink {
    link: string;
    name: string;
    type: 'offer' | 'invoice';
}

export interface IPreparedDocument extends IResultDocumentLink {
    absolutePath: string;
}
