import assert from 'assert';

async function runTest() {
  console.log('Testing JWT_SECRET validation...');
  
  // Backup real env
  const realEnv = process.env.JWT_SECRET;
  
  try {
    // 1. Remove JWT_SECRET and expect it to throw when importing/running session logic
    delete process.env.JWT_SECRET;
    
    // We clear require cache if we were using CJS, but with dynamic import in ESM/Node we can't easily without tricks.
    // Instead, let's just assert that importing session.ts throws.
    try {
      const { signSession } = await import('./session');
      // If it doesn't throw on import, it's failing the test (it SHOULD throw on boot)
      assert.fail('Expected importing session.ts to throw an error when JWT_SECRET is missing');
    } catch (err: any) {
      if (err.code === 'ERR_ASSERTION') throw err;
      assert.ok(err.message.includes('JWT_SECRET'), 'Error message should mention JWT_SECRET');
      console.log('✅ Test passed: Throws explicit error when JWT_SECRET is missing');
    }

  } finally {
    // Restore env
    process.env.JWT_SECRET = realEnv;
  }
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
