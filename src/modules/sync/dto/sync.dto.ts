import {
  IsIn,
  IsObject,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class PushSyncDto {
  @IsString()
  @MinLength(8)
  @MaxLength(120)
  operationId!: string;
  @IsString()
  @IsIn(['invoice'])
  entity!: 'invoice';
  @IsString()
  @IsIn(['create', 'update'])
  action!: 'create' | 'update';
  @IsObject()
  payload!: Record<string, unknown>;
}
