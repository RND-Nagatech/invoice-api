import { Injectable, NotFoundException } from '@nestjs/common';

export interface InvoiceTemplateDefinition {
  id: string;
  name: string;
  category: 'MODERN' | 'MINIMAL' | 'CORPORATE' | 'ELEGANT';
  description: string;
  accent: string;
  preview: string;
  profession: string;
  version: number;
  accessTier: 'FREE' | 'PRO';
  layout: string;
  active: boolean;
}

const TEMPLATE_DEFINITIONS: InvoiceTemplateDefinition[] = [
  [
    'modern-purple',
    'Modern Purple',
    'MODERN',
    '#5B31F4',
    'Service',
    'FREE',
    'classic',
  ],
  [
    'clean-minimal',
    'Clean Minimal',
    'MINIMAL',
    '#27364B',
    'Freelancer',
    'FREE',
    'minimal',
  ],
  [
    'corporate-blue',
    'Corporate Blue',
    'CORPORATE',
    '#1769AA',
    'Agency',
    'PRO',
    'corporate',
  ],
  [
    'elegant-dark',
    'Elegant Dark',
    'ELEGANT',
    '#1E1E2E',
    'Creative',
    'PRO',
    'elegant',
  ],
  [
    'lavender-studio',
    'Lavender Studio',
    'MODERN',
    '#7C5CFC',
    'Designer',
    'FREE',
    'classic',
  ],
  [
    'sunset-orange',
    'Sunset Orange',
    'MODERN',
    '#E86A33',
    'Event',
    'FREE',
    'classic',
  ],
  [
    'forest-green',
    'Forest Green',
    'MODERN',
    '#2D7A56',
    'Agribusiness',
    'PRO',
    'classic',
  ],
  [
    'ocean-teal',
    'Ocean Teal',
    'MODERN',
    '#0B8291',
    'Consultant',
    'FREE',
    'classic',
  ],
  [
    'mono-black',
    'Mono Black',
    'MINIMAL',
    '#222222',
    'Photographer',
    'FREE',
    'minimal',
  ],
  [
    'paper-slate',
    'Paper Slate',
    'MINIMAL',
    '#52616B',
    'Writer',
    'FREE',
    'minimal',
  ],
  ['soft-pink', 'Soft Pink', 'ELEGANT', '#C25B7C', 'MUA', 'PRO', 'elegant'],
  [
    'royal-navy',
    'Royal Navy',
    'CORPORATE',
    '#243B6B',
    'Contractor',
    'PRO',
    'corporate',
  ],
  [
    'skyline',
    'Skyline',
    'CORPORATE',
    '#3A78B8',
    'Technology',
    'PRO',
    'corporate',
  ],
  [
    'warm-sand',
    'Warm Sand',
    'ELEGANT',
    '#A77B5D',
    'Interior',
    'FREE',
    'elegant',
  ],
  [
    'mint-fresh',
    'Mint Fresh',
    'MINIMAL',
    '#4FAF91',
    'Wellness',
    'FREE',
    'minimal',
  ],
  ['berry-bold', 'Berry Bold', 'MODERN', '#9E315D', 'Retail', 'PRO', 'classic'],
  [
    'construction-yellow',
    'Construction Yellow',
    'CORPORATE',
    '#D89516',
    'Teknisi',
    'FREE',
    'corporate',
  ],
  [
    'legal-charcoal',
    'Legal Charcoal',
    'MINIMAL',
    '#36454F',
    'Legal',
    'PRO',
    'minimal',
  ],
  [
    'indigo-consult',
    'Indigo Consult',
    'CORPORATE',
    '#4A4CC7',
    'Consultant',
    'PRO',
    'corporate',
  ],
  [
    'coral-market',
    'Coral Market',
    'MODERN',
    '#E85D5D',
    'UMKM',
    'FREE',
    'classic',
  ],
].map(([id, name, category, accent, profession, accessTier, layout]) => ({
  id,
  name,
  category: category as InvoiceTemplateDefinition['category'],
  description: `Template ${name} untuk bisnis ${profession}.`,
  accent,
  preview: id,
  profession,
  version: 1,
  accessTier: accessTier as 'FREE' | 'PRO',
  layout,
  active: true,
}));

@Injectable()
export class TemplatesService {
  list(category?: string): InvoiceTemplateDefinition[] {
    const normalized = category?.trim().toUpperCase();
    return (
      normalized
        ? TEMPLATE_DEFINITIONS.filter(
            (template) => template.category === normalized,
          )
        : TEMPLATE_DEFINITIONS
    ).filter((template) => template.active);
  }

  get(id: string): InvoiceTemplateDefinition {
    const template = TEMPLATE_DEFINITIONS.find((item) => item.id === id);
    if (!template)
      throw new NotFoundException('Template invoice tidak ditemukan.');
    return template;
  }

  exists(id: string): boolean {
    return TEMPLATE_DEFINITIONS.some(
      (template) => template.id === id && template.active,
    );
  }

  categories() {
    return [
      ...new Set(
        TEMPLATE_DEFINITIONS.filter((template) => template.active).map(
          (template) => template.category,
        ),
      ),
    ];
  }
  professions() {
    return [
      ...new Set(
        TEMPLATE_DEFINITIONS.filter((template) => template.active).map(
          (template) => template.profession,
        ),
      ),
    ];
  }
}
