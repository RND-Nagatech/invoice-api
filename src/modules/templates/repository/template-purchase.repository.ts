import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TemplatePurchase,
  TemplatePurchaseDocument,
} from '../schemas/template-purchase.schema.js';

@Injectable()
export class TemplatePurchaseRepository {
  constructor(
    @InjectModel(TemplatePurchase.name)
    private readonly purchases: Model<TemplatePurchase>,
  ) {}
  list(businessId: string) {
    return this.purchases.find({ businessId }).sort({ purchasedAt: -1 }).exec();
  }
  find(
    businessId: string,
    templateId: string,
  ): Promise<TemplatePurchaseDocument | null> {
    return this.purchases.findOne({ businessId, templateId }).exec();
  }
  create(input: Record<string, unknown>): Promise<TemplatePurchaseDocument> {
    return this.purchases.create(input);
  }
}
