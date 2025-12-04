import WebSocket from 'ws';

// Test WebSocket connection to CXT box
async function testCXTConnection(host, port = 22223) {
  return new Promise((resolve, reject) => {
    console.log(`Testing connection to ${host}:${port}...`);
    
    const ws = new WebSocket(`ws://${host}:${port}`);
    
    const timeout = setTimeout(() => {
      ws.close();
      resolve({
        success: false,
        error: 'Connection timeout',
        host,
        port
      });
    }, 5000);
    
    ws.on('open', () => {
      console.log(`✅ WebSocket connection established to ${host}:${port}`);
      clearTimeout(timeout);
      
      // Try to send a test command
      const testCommand = {
        action: "GetDeviceList",
        comm: {}
      };
      
      ws.send(JSON.stringify(testCommand));
      console.log(`📤 Sent test command:`, testCommand);
    });
    
    ws.on('message', (data) => {
      console.log(`📥 Received response from ${host}:${port}:`, data.toString());
      clearTimeout(timeout);
      ws.close();
      resolve({
        success: true,
        response: data.toString(),
        host,
        port
      });
    });
    
    ws.on('error', (error) => {
      console.log(`❌ WebSocket error for ${host}:${port}:`, error.message);
      clearTimeout(timeout);
      resolve({
        success: false,
        error: error.message,
        host,
        port
      });
    });
    
    ws.on('close', (code, reason) => {
      console.log(`🔌 Connection closed to ${host}:${port} - Code: ${code}, Reason: ${reason}`);
      clearTimeout(timeout);
      if (code !== 1000) { // Not normal closure
        resolve({
          success: false,
          error: `Connection closed with code ${code}: ${reason}`,
          host,
          port
        });
      }
    });
  });
}

// Test function for scanning multiple IPs
async function scanCXTBoxes() {
  const baseIP = '192.168.44';
  const testIPs = [1, 2, 3, 4, 5, 10, 20, 50, 100]; // Test some common IPs
  
  console.log(`🔍 Scanning for CXT boxes in ${baseIP}.x network...`);
  console.log(`Testing IPs: ${testIPs.map(ip => `${baseIP}.${ip}`).join(', ')}`);
  console.log('');
  
  const results = [];
  
  for (const ip of testIPs) {
    const host = `${baseIP}.${ip}`;
    const result = await testCXTConnection(host);
    results.push(result);
    
    if (result.success) {
      console.log(`🎉 Found CXT box at ${host}:${result.port}!`);
      console.log(`Response: ${result.response}`);
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n📊 Scan Summary:');
  const foundBoxes = results.filter(r => r.success);
  console.log(`Found ${foundBoxes.length} CXT boxes out of ${results.length} tested IPs`);
  
  if (foundBoxes.length > 0) {
    console.log('\n✅ Working CXT boxes:');
    foundBoxes.forEach(box => {
      console.log(`  • ${box.host}:${box.port}`);
    });
  }
  
  const failedBoxes = results.filter(r => !r.success);
  if (failedBoxes.length > 0) {
    console.log(`\n❌ Failed connections (${failedBoxes.length}):`);
    failedBoxes.forEach(box => {
      console.log(`  • ${box.host}:${box.port} - ${box.error}`);
    });
  }
  
  return foundBoxes;
}

// Run the scan if this file is executed directly
if (process.argv[1].endsWith('test-cxt-connection.js')) {
  scanCXTBoxes()
    .then((foundBoxes) => {
      if (foundBoxes.length === 0) {
        console.log('\n💡 No CXT boxes found. This could mean:');
        console.log('   1. No CXT boxes are powered on in this IP range');
        console.log('   2. CXT software is not running on the boxes');
        console.log('   3. WebSocket port 22223 is not open');
        console.log('   4. Boxes are on a different network segment');
        console.log('   5. Different port is being used');
      } else {
        console.log('\n🎯 CXT boxes are accessible via WebSocket!');
        console.log('   The boxes provide WebSocket API directly.');
      }
    })
    .catch(error => {
      console.error('❌ Scan failed:', error);
    });
}

export { testCXTConnection, scanCXTBoxes };