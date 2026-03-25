const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');
const MAX_AGE_DAYS = 30;

function cleanOldLogs() {
  if (!fs.existsSync(LOG_DIR)) {
    console.log('Log directory does not exist');
    return;
  }

  const files = fs.readdirSync(LOG_DIR);
  const now = Date.now();
  let deletedCount = 0;

  files.forEach(file => {
    const filePath = path.join(LOG_DIR, file);
    const stats = fs.statSync(filePath);
    const ageDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    
    if (ageDays > MAX_AGE_DAYS) {
      fs.unlinkSync(filePath);
      deletedCount++;
      console.log(`Deleted old log: ${file} (${ageDays.toFixed(1)} days old)`);
    }
  });

  console.log(`Cleaned up ${deletedCount} old log files`);
}

cleanOldLogs();