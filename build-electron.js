const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 删除旧的 dist-electron
const distPath = path.join(__dirname, 'dist-electron');
if (fs.existsSync(distPath)) {
  fs.rmSync(distPath, { recursive: true });
  console.log('Deleted old dist-electron');
}

// 创建新的 dist-electron
fs.mkdirSync(distPath, { recursive: true });

// 编译 TypeScript
try {
  execSync('npx tsc -p tsconfig.electron.json', { stdio: 'inherit', cwd: __dirname });
  console.log('TypeScript compilation completed');
} catch (e) {
  console.error('Compilation failed:', e.message);
  process.exit(1);
}

// 列出编译结果
function listDir(dir, prefix = '') {
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      console.log(prefix + item + '/');
      listDir(fullPath, prefix + '  ');
    } else {
      console.log(prefix + item);
    }
  }
}

console.log('\nCompiled files:');
listDir(distPath);
