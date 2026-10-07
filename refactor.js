const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

const replacements = [
  { regex: /gap-\[clamp\([^)]+\)\]/g, replace: 'gap-section' },
  { regex: /min-h-\[44px\]/g, replace: 'min-h-btn' },
  { regex: /min-h-\[46px\]/g, replace: 'min-h-btn' },
  { regex: /min-h-\[50px\]/g, replace: 'min-h-btn' },
  { regex: /text-\[10px\]/g, replace: 'text-xs' },
  { regex: /text-\[11px\]/g, replace: 'text-xs sm:text-sm' },
  { regex: /text-\[13px\]/g, replace: 'text-sm' },
  { regex: /text-\[15px\]/g, replace: 'text-md' },
  { regex: /text-\[17px\]/g, replace: 'text-lg' },
  { regex: /px-1\b/g, replace: 'px-screen-x' },
  { regex: /p-2\.5\b/g, replace: 'p-card' },
  { regex: /gap-2\.5\b/g, replace: 'gap-card-gap' },
  { regex: /rounded-\[1\.25rem\]/g, replace: 'rounded-card' },
  { regex: /px-2\.5\b/g, replace: 'px-4' },
  { regex: /py-1\.5\b/g, replace: 'py-2' },
];

walkDir('./src', function(filePath) {
  if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    
    replacements.forEach(({regex, replace}) => {
      if (regex.test(content)) {
        content = content.replace(regex, replace);
        changed = true;
      }
    });

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log('Updated:', filePath);
    }
  }
});
