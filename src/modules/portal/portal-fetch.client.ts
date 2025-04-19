// import { Injectable } from '@nestjs/common';
// import { HttpService } from '@nestjs/axios';
// import { firstValueFrom } from 'rxjs';
// import { IPortalResponse } from './interfaces/portal.interface';
// import { PortalDto } from './dto/portal.dto';

// @Injectable()
// export class PortalFetchClient {
//     constructor(private readonly httpService: HttpService) { }

//     async fetch(domain: string): Promise<PortalDto> {
//         const res = await firstValueFrom(
//             this.httpService.post('https://external-server/client/portal', { domain })
//         );

//         return res.data.data.portal;
//     }

//     async fetchPortalData(domain: string): Promise<IPortalResponse> {
//         try {
//             const portal = await this.fetch(domain);
//             return {
//                 success: true,
//                 data: portal
//             };
//         } catch (error) {
//             return {
//                 success: false,
//                 error: error.message
//             };
//         }
//     }
// } 