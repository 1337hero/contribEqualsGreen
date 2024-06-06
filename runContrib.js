import { exec } from 'child_process';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the full path to the contrib.sh script
const scriptPath = path.join(__dirname, 'contrib.sh');

exec(scriptPath, (error, stdout, stderr) => {
  if (error) {
    console.error(`Error executing script: ${error.message}`);
    return;
  }

  if (stderr) {
    console.error(`Error output: ${stderr}`);
    return;
  }

  console.log(`Output: ${stdout}`);
});
