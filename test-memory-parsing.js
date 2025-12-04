import { execSync } from "child_process";
import { CONFIG } from "./config.js";
import { ADB_COMMANDS } from "./adbCommands.js";

async function testMemoryParsing() {
  const deviceId = "192.168.44.41:5555";
  const packageName = CONFIG.PACKAGE;
  
  console.log(`Testing memory parsing for ${deviceId}`);
  console.log(`Package: ${packageName}\n`);
  
  try {
    // Get memory info
    const memCmd = ADB_COMMANDS.MEMINFO(deviceId, packageName);
    console.log(`Memory command: ${memCmd}`);
    
    const memInfoRaw = execSync(memCmd, { timeout: 10000 }).toString();
    console.log(`Memory output length: ${memInfoRaw.length} chars`);
    console.log('\n=== Full Memory Output ===');
    console.log(memInfoRaw);
    console.log('=== End Memory Output ===\n');
    
    // Test current regex patterns
    console.log('=== Testing Current Regex Patterns ===');
    const pssMatch = memInfoRaw.match(/TOTAL PSS:\s+(\d+)/);
    const rssMatch = memInfoRaw.match(/TOTAL RSS:\s+(\d+)/);
    
    console.log(`PSS Regex match: ${pssMatch ? pssMatch[0] : 'No match'}`);
    console.log(`PSS Value: ${pssMatch ? pssMatch[1] : null}`);
    console.log(`RSS Regex match: ${rssMatch ? rssMatch[0] : 'No match'}`);
    console.log(`RSS Value: ${rssMatch ? rssMatch[1] : null}`);
    
    // Try alternative patterns
    console.log('\n=== Testing Alternative Patterns ===');
    
    // Try with case insensitive
    const pssMatchI = memInfoRaw.match(/total\s+pss:\s+(\d+)/i);
    const rssMatchI = memInfoRaw.match(/total\s+rss:\s+(\d+)/i);
    console.log(`PSS Case-insensitive: ${pssMatchI ? pssMatchI[0] : 'No match'}`);
    console.log(`RSS Case-insensitive: ${rssMatchI ? rssMatchI[0] : 'No match'}`);
    
    // Look for any PSS/RSS patterns
    const allPss = memInfoRaw.match(/pss[:\s]+(\d+)/gi);
    const allRss = memInfoRaw.match(/rss[:\s]+(\d+)/gi);
    console.log(`All PSS patterns found: ${allPss ? allPss.join(', ') : 'None'}`);
    console.log(`All RSS patterns found: ${allRss ? allRss.join(', ') : 'None'}`);
    
    // Look for memory values in the output
    const memoryLines = memInfoRaw.split('\n').filter(line => 
      line.toLowerCase().includes('pss') || 
      line.toLowerCase().includes('rss') ||
      line.toLowerCase().includes('total')
    );
    
    console.log('\n=== Lines containing PSS/RSS/TOTAL ===');
    memoryLines.forEach((line, i) => {
      console.log(`${i + 1}: ${line.trim()}`);
    });
    
    // Extract numbers from any line with "Total" 
    const totalLines = memInfoRaw.split('\n').filter(line => 
      line.toLowerCase().includes('total')
    );
    
    console.log('\n=== Total lines with possible memory values ===');
    totalLines.forEach((line, i) => {
      const numbers = line.match(/\d+/g);
      console.log(`${i + 1}: ${line.trim()}`);
      if (numbers) {
        console.log(`   Numbers found: ${numbers.join(', ')}`);
      }
    });
    
  } catch (error) {
    console.error(`Memory test failed: ${error.message}`);
  }
}

testMemoryParsing();