import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module.js';
import { ItemRepository } from './repository/item.repository.js';
import { Item, ItemSchema } from './schemas/item.schema.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';

@Module({
  imports: [
    AuthModule,
    MongooseModule.forFeature([{ name: Item.name, schema: ItemSchema }]),
  ],
  controllers: [ItemsController],
  providers: [ItemsService, ItemRepository],
})
export class ItemsModule {}
