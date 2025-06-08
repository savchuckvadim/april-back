import { IsNumber } from "class-validator";
import { IsString } from "class-validator";
import { IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SupplyDto {
    
    @ApiProperty({ description: 'Contract prop supplies quantity' })
    @IsNumber() 
    contractPropSuppliesQuantity: number;
   
    @ApiProperty({ description: 'Contract prop 2' })
    @IsOptional() @IsString() 
    lcontractProp2: string;
    
    @ApiProperty({ description: 'Contract name' })
    @IsString() 
    lcontractName: string;
    
    @ApiProperty({ description: 'Contract prop email' })
    @IsString() 
    lcontractPropEmail: string;
    @ApiProperty({ description: 'Type' })
    @IsString() type: string;
    
    @ApiProperty({ description: 'Contract prop logins quantity' })
    @IsString() 
    contractPropLoginsQuantity: string;
    
    @ApiProperty({ description: 'Number' })
    @IsNumber() 
    number: number;
    
    @ApiProperty({ description: 'Acontract name' })
    @IsString() 
    acontractName: string;
    
    @ApiProperty({ description: 'Contract prop comment' })
    @IsString() 
    contractPropComment: string;
    
    @ApiProperty({ description: 'Contract prop email' })
    @IsString() 
    contractPropEmail: string;
    
    @ApiProperty({ description: 'Quantity for KP' })
    @IsString() 
    quantityForKp: string;
    
    @ApiProperty({ description: 'Name' })
    @IsString() 
    name: string;
    @ApiProperty({ description: 'Coefficient' })
    @IsNumber() coefficient: number;
    
    @ApiProperty({ description: 'Acontract prop comment' })
    @IsString() 
    acontractPropComment: string;
    
    @ApiProperty({ description: 'Contract name' })
    @IsString() 
    contractName: string;
    
    @ApiProperty({ description: 'Contract prop comment' })
    @IsString() 
    lcontractPropComment: string;
    @ApiProperty({ description: 'Contract prop 1' })
    @IsOptional() @IsString() contractProp1: string;
}
