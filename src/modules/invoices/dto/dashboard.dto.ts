import { IsIn, IsOptional } from 'class-validator';

export const DASHBOARD_PERIODS = ['month', 'quarter', 'year'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

export class DashboardQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS)
  period?: DashboardPeriod;
}
