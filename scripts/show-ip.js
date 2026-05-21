const os = require('os');

function getIPAddress() {
  const interfaces = os.networkInterfaces();
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '0.0.0.0';
}

console.log('\n=================================================');
console.log('🚀 Sistema UniFAFIRE pronto para iniciar!');
console.log(`🌐 Endereço IP na rede: http://${getIPAddress()}:3000`);
console.log('=================================================\n');
