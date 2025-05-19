import { Controller } from "@nestjs/common";
import { TemplateService } from "../services/template-service";

@Controller('template')
export class TemplateController {
    constructor(private readonly templateService: TemplateService) { }
}
