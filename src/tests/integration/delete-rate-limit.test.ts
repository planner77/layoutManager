import { beforeEach, expect, test } from 'vitest';
import { clearDeleteAttempts, reserveDeleteAttempt, resetDeleteAttemptsForTests } from '../../server/delete-rate-limit';

beforeEach(resetDeleteAttemptsForTests);

test('TC-DELETE-003: five attempts are reserved synchronously and the sixth reports remaining Retry-After',()=>{
  for(let i=0;i<5;i++) expect(()=>reserveDeleteAttempt('one',1_000)).not.toThrow();
  expect(()=>reserveDeleteAttempt('one',1_500)).toThrowError(expect.objectContaining({code:'DELETE_RATE_LIMITED',status:429,retryAfterSeconds:60}));
});

test('successful deletion clears the version-specific window',()=>{
  for(let i=0;i<5;i++) reserveDeleteAttempt('one',1_000);
  clearDeleteAttempts('one');
  expect(()=>reserveDeleteAttempt('one',1_001)).not.toThrow();
});
