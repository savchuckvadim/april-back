import { Module } from "@nestjs/common";
import { BitrixSetupInstallController } from "./controllers/bitrix-setup-install.controller";
import { BitrixSetupAppModule } from "../app/bitrix-setup-app.module";



@Module({
    imports: [BitrixSetupAppModule],
    controllers: [BitrixSetupInstallController],

})
export class BitrixSetupInstallModule { }
