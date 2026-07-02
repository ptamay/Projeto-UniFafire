import assert from 'assert';

async function runTest() {
  console.log('Testing Zod Password Policy...');
  
  const { UserSchema, ChangePasswordSchema } = await import('./schemas');

  // Test 1: UserSchema with short password
  const result1 = UserSchema.safeParse({ username: 'testuser', password: '123' });
  assert.strictEqual(result1.success, false, 'UserSchema deve rejeitar senha com menos de 8 caracteres');
  if (!result1.success) {
      assert.ok(result1.error.issues[0].message.includes('8'), 'A mensagem de erro do UserSchema deve mencionar 8 caracteres');
  }

  // Test 2: UserSchema with exact 8 chars
  const result2 = UserSchema.safeParse({ username: 'testuser', password: '12345678' });
  assert.strictEqual(result2.success, true, 'UserSchema deve aceitar senha com 8 caracteres');

  // Test 3: ChangePasswordSchema with short password
  const result3 = ChangePasswordSchema.safeParse({ userId: 1, currentPassword: '123', newPassword: '1234567' });
  assert.strictEqual(result3.success, false, 'ChangePasswordSchema deve rejeitar senha com menos de 8 caracteres');
  if (!result3.success) {
      assert.ok(result3.error.issues[0].message.includes('8'), 'A mensagem de erro do ChangePasswordSchema deve mencionar 8 caracteres');
  }

  // Test 4: ChangePasswordSchema with 8 chars
  const result4 = ChangePasswordSchema.safeParse({ userId: 1, currentPassword: '123', newPassword: '12345678' });
  assert.strictEqual(result4.success, true, 'ChangePasswordSchema deve aceitar senha com 8 caracteres');

  console.log('✅ Todos os testes passaram!');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
