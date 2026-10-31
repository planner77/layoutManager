import { expect, test } from 'vitest';
import { OperationLogRateLimiter } from '../../server/logging/access';

test('TC-R1-006: rotating forged tokens hit aggregate cap before durable authorization/audit',()=>{
  const limiter=new OperationLogRateLimiter(2,3,10);
  limiter.reserve('forged-a',1000);
  limiter.reserve('forged-b',1000);
  limiter.reserve('forged-c',1000);
  expect(()=>limiter.reserve('forged-d',1000)).toThrowError('LOG_RATE_LIMITED');
  limiter.reserve('forged-d',61000);
  limiter.reserve('forged-d',61000);
  expect(()=>limiter.reserve('forged-d',61000)).toThrowError('LOG_RATE_LIMITED');
});
