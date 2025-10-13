import { Module } from "@nestjs/common";
import { BitrixSetupInstallController } from "./controllers/bitrix-setup-install.controller";
import { AppModule } from "../app/app.module";



@Module({
    imports: [AppModule],
    controllers: [BitrixSetupInstallController],

})
export class BitrixSetupInstallModule { }
