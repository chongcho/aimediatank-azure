const { execSync } = require('child_process');
const path = require('path');

console.log('Setting up database...');

const prismaCmd = path.join(__dirname, 'node_modules', '.bin', 'prisma.cmd');

try {
  console.log('Running prisma generate...');
  const genOutput = execSync(`"${prismaCmd}" generate`, { 
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./dev.db' },
    cwd: __dirname
  });
  console.log('Generate output:', genOutput.toString());
} catch (error) {
  console.error('Generate error:', error.message);
  if (error.stdout) console.log('stdout:', error.stdout.toString());
  if (error.stderr) console.log('stderr:', error.stderr.toString());
}

try {
  console.log('Running prisma db push...');
  const pushOutput = execSync(`"${prismaCmd}" db push --accept-data-loss`, {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./dev.db' },
    cwd: __dirname
  });
  console.log('Push output:', pushOutput.toString());
} catch (error) {
  console.error('Push error:', error.message);
  if (error.stdout) console.log('stdout:', error.stdout.toString());
  if (error.stderr) console.log('stderr:', error.stderr.toString());
}

console.log('Done!');
