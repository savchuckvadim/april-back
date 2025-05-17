import { EBxMethod } from "../../core";
import { IBXFile } from "./bx-file.interface";

export type FileSchema = {
    [EBxMethod.GET]: {
        request: { id: number | string };
        response: IBXFile;
    };
}