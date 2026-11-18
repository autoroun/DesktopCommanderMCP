import { z } from 'zod';
export const UltraArgsSchema = z.object({
  action: z.enum(['status','enable','disable','task_start','task_status','task_cancel',
    'project_scan','dashboard_start','dashboard_stop','power']),
  commands: z.array(z.string().min(1)).min(1).max(25).optional(),
  cwd: z.string().optional(),
  retries: z.number().int().min(0).max(3).optional(),
  job_id: z.string().optional(),
  port: z.number().int().min(1024).max(65535).optional(),
  operation: z.enum(['shutdown','restart','abort']).optional()
});