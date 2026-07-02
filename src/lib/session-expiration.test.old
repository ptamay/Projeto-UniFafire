import assert from 'assert';
import { jwtVerify } from 'jose';

async function runTest() {
  console.log('Testing JWT Expiration (7 days)...');
  
  // Ensure JWT_SECRET is present
  process.env.JWT_SECRET = 'c8e6f1f4-3e9a-4c92-b43a-f11a43a0d7f9-db43a0d7f9';
  
  const { signSession } = await import('./session');
  
  const token = await signSession({ id: 1, username: 'test', role: 'ADMIN' });
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  
  const { payload } = await jwtVerify(token, secret);
  
  assert.ok(payload.exp, 'JWT should have an exp claim');
  assert.ok(payload.iat, 'JWT should have an iat claim');
  
  const diffInSeconds = payload.exp! - payload.iat!;
  assert.strictEqual(diffInSeconds, 7 * 24 * 60 * 60, 'Expiration should be exactly 7 days from iat');
  
  console.log('✅ Test passed: JWT expiration is exactly 7 days');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
