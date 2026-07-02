import assert from 'assert';

async function runTest() {
  console.log('Testing Security Profile (Rate Limit and Lockout)...');
  
  const { checkRateLimit, recordLoginAttempt, checkLockout, clearLoginAttempts } = await import('./security-profile');

  // Test 1: Rate Limit 30 req/min
  const testIp = '127.0.0.1';
  for (let i = 0; i < 30; i++) {
     const ok = checkRateLimit(testIp);
     assert.strictEqual(ok, true, `Req ${i + 1} should be allowed`);
  }
  const block = checkRateLimit(testIp);
  assert.strictEqual(block, false, 'Req 31 should be blocked');

  // Test 2: Account Lockout 5 attempts / 15 min
  const testUser = 'lockout_test_user';
  clearLoginAttempts(testUser, testIp); // clean up before test
  
  for (let i = 0; i < 5; i++) {
     const isLocked = checkLockout(testUser, testIp);
     assert.strictEqual(isLocked, false, `Attempt ${i + 1} should not be locked`);
     recordLoginAttempt(testUser, testIp, false); // record failure
  }
  
  const isLockedNow = checkLockout(testUser, testIp);
  assert.strictEqual(isLockedNow, true, 'User should be locked after 5 failures');

  console.log('✅ Todos os testes passaram!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
