const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');

// Cursor user rules SQLite 数据库路径
// Windows: C:\Users\<username>\AppData\Roaming\Cursor\User\globalStorage\state.vscdb
const CURSOR_DB_PATH = path.join(
  os.homedir(),
  'AppData',
  'Roaming',
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb'
);

// Git 仓库地址
const AI_REPO_URL = 'https://github.com/liumengjian/ai-skills.git';
// Git 分支
const AI_REPO_BRANCH = 'main';

/**
 * 删除目录（回调方式，使用递归删除）
 */
function deleteDir(dirPath, callback) {
  if (!fs.existsSync(dirPath)) {
    callback && callback();
    return;
  }
  
  // 递归删除目录和文件
  function deleteRecursive(dir) {
    if (!fs.existsSync(dir)) {
      return;
    }
    
    try {
      const files = fs.readdirSync(dir);
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const curPath = path.join(dir, file);
        const stat = fs.statSync(curPath);
        
        if (stat.isDirectory()) {
          deleteRecursive(curPath);
          // 删除空目录
          try {
            fs.rmdirSync(curPath);
          } catch (e) {
            // 忽略错误，可能目录不为空
          }
        } else {
          try {
            fs.unlinkSync(curPath);
          } catch (e) {
            // 忽略删除文件错误
          }
        }
      }
      
      // 最后删除根目录
      try {
        fs.rmdirSync(dir);
      } catch (e) {
        // 忽略错误，可能目录不为空或正在使用
      }
    } catch (e) {
      // 忽略错误
    }
  }
  
  deleteRecursive(dirPath);
  
  // 延迟回调，确保删除完成
  setTimeout(() => {
    callback && callback();
  }, 300);
}

/**
 * 复制文件夹（回调方式，改进错误处理）
 */
function copyFolder(srcDir, tarDir, callback) {
  if (!fs.existsSync(srcDir)) {
    callback && callback(new Error(`源目录不存在: ${srcDir}`));
    return;
  }
  
  // 确保目标目录存在
  if (!fs.existsSync(tarDir)) {
    try {
      fs.mkdirSync(tarDir, { recursive: true });
    } catch (e) {
      callback && callback(e);
      return;
    }
  }
  
  // 使用改进的复制函数
  copyFolderRecursive(srcDir, tarDir, callback);
}

/**
 * 递归复制文件夹（带错误处理）
 */
function copyFolderRecursive(srcDir, tarDir, callback) {
  if (!fs.existsSync(srcDir)) {
    callback && callback(new Error(`源目录不存在: ${srcDir}`));
    return;
  }
  
  try {
    const files = fs.readdirSync(srcDir);
    let completed = 0;
    let hasError = false;
    
    if (files.length === 0) {
      callback && callback();
      return;
    }
    
    files.forEach((file) => {
      const srcPath = path.join(srcDir, file);
      const tarPath = path.join(tarDir, file);
      
      try {
        const stat = fs.statSync(srcPath);
        
        if (stat.isDirectory()) {
          // 确保目标目录存在
          if (!fs.existsSync(tarPath)) {
            fs.mkdirSync(tarPath, { recursive: true });
          }
          
          copyFolderRecursive(srcPath, tarPath, (err) => {
            completed++;
            if (err && !hasError) {
              hasError = true;
              console.log(`【Warning】：复制目录失败 ${srcPath}: ${err.message}`);
            }
            if (completed === files.length) {
              callback && callback(hasError ? new Error('部分文件复制失败') : null);
            }
          });
        } else {
          // 复制文件，带重试机制
          copyFileWithRetry(srcPath, tarPath, 3, (err) => {
            completed++;
            if (err && !hasError) {
              hasError = true;
              console.log(`【Warning】：复制文件失败 ${srcPath}: ${err.message}`);
            }
            if (completed === files.length) {
              callback && callback(hasError ? new Error('部分文件复制失败') : null);
            }
          });
        }
      } catch (e) {
        completed++;
        if (!hasError) {
          hasError = true;
          console.log(`【Warning】：处理文件失败 ${srcPath}: ${e.message}`);
        }
        if (completed === files.length) {
          callback && callback(hasError ? new Error('部分文件复制失败') : null);
        }
      }
    });
  } catch (e) {
    callback && callback(e);
  }
}

/**
 * 复制文件（带重试机制）
 */
function copyFileWithRetry(srcPath, tarPath, retries, callback) {
  if (retries <= 0) {
    callback && callback(new Error(`复制文件失败，已重试多次: ${srcPath}`));
    return;
  }
  
  // 确保目标目录存在
  const tarDir = path.dirname(tarPath);
  if (!fs.existsSync(tarDir)) {
    try {
      fs.mkdirSync(tarDir, { recursive: true });
    } catch (e) {
      callback && callback(e);
      return;
    }
  }
  
  const rs = fs.createReadStream(srcPath);
  const ws = fs.createWriteStream(tarPath);
  
  rs.on('error', (err) => {
    callback && callback(err);
  });
  
  ws.on('error', (err) => {
    // 如果是文件被占用或其他临时错误，尝试重试
    if (retries > 1 && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      setTimeout(() => {
        copyFileWithRetry(srcPath, tarPath, retries - 1, callback);
      }, 100);
    } else {
      callback && callback(err);
    }
  });
  
  ws.on('close', () => {
    callback && callback();
  });
  
  rs.pipe(ws);
}

module.exports = () => {
  const root_path = path.resolve('./');
  const tmpDir = os.tmpdir();
  const cloneDir = path.join(tmpDir, 'prina-ai-temp');

  console.log('【prina-cmd ai-pull】：开始执行...');

  // 步骤1: 拉取或更新仓库代码
  console.log('步骤1: 正在拉取 ai-skills 仓库代码...');
  
  // 如果临时目录已存在，先删除
  deleteDir(cloneDir, () => {
    try {
      // 克隆仓库指定分支
      child_process.execSync(`git clone -b ${AI_REPO_BRANCH} ${AI_REPO_URL} "${cloneDir}"`, {
        stdio: 'inherit',
        cwd: tmpDir
      });
      console.log('✓ 仓库代码拉取成功');

      // 步骤2: 复制 .ai 文件夹到当前项目
      console.log('步骤2: 正在复制 .ai 文件夹...');
      const aiSourcePath = path.join(cloneDir, '.ai');
      const aiTargetPath = path.join(root_path, '.ai');

      if (!fs.existsSync(aiSourcePath)) {
        console.log('【Warning】：仓库中未找到 .ai 文件夹');
        step3();
      } else {
        // 如果目标目录已存在，先删除
        if (fs.existsSync(aiTargetPath)) {
          deleteDir(aiTargetPath, () => {
            // 复制 .ai 文件夹
            copyFolder(aiSourcePath, aiTargetPath, (err) => {
              if (err) {
                console.error('【Error】：复制 .ai 文件夹失败', err.message);
                cleanupAndExit(1);
                return;
              }
              console.log('✓ .ai 文件夹复制成功');
              step3();
            });
          });
        } else {
          // 复制 .ai 文件夹
          copyFolder(aiSourcePath, aiTargetPath, (err) => {
            if (err) {
              console.error('【Error】：复制 .ai 文件夹失败', err.message);
              cleanupAndExit(1);
              return;
            }
            console.log('✓ .ai 文件夹复制成功');
            step3();
          });
        }
      }
    } catch (error) {
      console.error('【Error】：拉取仓库失败', error.message);
      cleanupAndExit(1);
    }
  });

  // 步骤3: 复制 prompt.md 到 Cursor user rules (SQLite 数据库)
  function step3() {
    console.log('步骤3: 正在更新 Cursor user rules (SQLite 数据库)...');
    const promptSourcePath = path.join(cloneDir, 'prompt.md');

    try {
      if (!fs.existsSync(promptSourcePath)) {
        console.log('【Warning】：仓库中未找到 prompt.md 文件');
        step4();
        return;
      }

      // 读取 prompt.md 内容
      const promptContent = fs.readFileSync(promptSourcePath, 'utf8');

      // 检查数据库文件是否存在
      if (!fs.existsSync(CURSOR_DB_PATH)) {
        console.log('【Warning】：Cursor 数据库文件不存在，可能 Cursor 未安装或路径不正确');
        console.log(`【路径】：${CURSOR_DB_PATH}`);
        console.log('【建议】：请确保已安装 Cursor 编辑器，或手动复制 prompt.md 内容');
        step4();
        return;
      }

      // 备份数据库文件
      try {
        const dbDir = path.dirname(CURSOR_DB_PATH);
        const dbFileName = path.basename(CURSOR_DB_PATH);
        
        // 查找所有备份文件
        const files = fs.existsSync(dbDir) ? fs.readdirSync(dbDir) : [];
        const backupFiles = files.filter(file => 
          file.startsWith(dbFileName + '.backup.')
        );
        
        // 删除所有旧的备份文件
        backupFiles.forEach(backupFile => {
          try {
            const backupFilePath = path.join(dbDir, backupFile);
            fs.unlinkSync(backupFilePath);
            console.log(`✓ 已删除旧备份文件: ${backupFile}`);
          } catch (e) {
            // 忽略删除错误
          }
        });
        
        // 创建新的备份文件
        const backupPath = CURSOR_DB_PATH + '.backup.' + Date.now();
        fs.copyFileSync(CURSOR_DB_PATH, backupPath);
        console.log(`✓ 已备份数据库文件到 ${path.basename(backupPath)}`);
      } catch (e) {
        console.log('【Warning】：备份数据库文件失败', e.message);
      }

      // 使用 better-sqlite3 或 sqlite3 更新数据库
      try {
        // 尝试使用 better-sqlite3 (同步 API，更简单)
        let Database;
        try {
          Database = require('better-sqlite3');
        } catch (e) {
          console.error('【Error】：未找到 SQLite 模块 (better-sqlite3)');
          console.log('【建议】：请运行 npm install better-sqlite3');
          console.log('【或者】：使用命令行工具手动更新数据库');
          step4();
          return;
        }

        // 使用 better-sqlite3 (同步 API)
        const db = new Database(CURSOR_DB_PATH, { readonly: false });
        
        try {
          console.log(`【调试】：准备更新数据库，内容长度: ${promptContent.length} 字符`);
          
          // 先查询是否存在该键
          const row = db.prepare("SELECT value, length(value) as len FROM ItemTable WHERE key = ?").get('aicontext.personalContext');
          
          if (row) {
            console.log(`【调试】：找到现有记录，当前长度: ${row.len} 字节`);
            
            // 检查内容是否已经相同
            let oldContent = '';
            if (Buffer.isBuffer(row.value)) {
              oldContent = row.value.toString('utf8');
            } else {
              oldContent = String(row.value);
            }
            
            if (oldContent === promptContent) {
              console.log('✓ prompt.md 内容未变化，无需更新');
              console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
              db.close();
              step4();
              return;
            }
            
            // 更新现有记录
            const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
            const result = updateStmt.run(promptContent, 'aicontext.personalContext');
            console.log(`【调试】：更新影响行数: ${result.changes}`);
            
            if (result.changes === 0) {
              console.error('【Error】：更新失败，影响行数为 0，可能数据库被锁定');
              console.log('【建议】：请关闭 Cursor 编辑器后重试');
              db.close();
              step4();
              return;
            }
            
            // 验证更新是否成功
            const verifyRow = db.prepare("SELECT value, length(value) as len FROM ItemTable WHERE key = ?").get('aicontext.personalContext');
            if (verifyRow && verifyRow.value) {
              let verifyContent = '';
              if (Buffer.isBuffer(verifyRow.value)) {
                verifyContent = verifyRow.value.toString('utf8');
              } else {
                verifyContent = String(verifyRow.value);
              }
              
              if (verifyContent === promptContent) {
                console.log(`✓ prompt.md 已更新到 Cursor user rules (${verifyRow.len} 字节)`);
                // 显示前几行内容确认
                const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
              } else {
                console.error(`【Error】：更新后内容不匹配！`);
                console.error(`  期望长度: ${promptContent.length}, 实际长度: ${verifyContent.length}`);
                console.error(`  期望前100字符: ${promptContent.substring(0, 100)}`);
                console.error(`  实际前100字符: ${verifyContent.substring(0, 100)}`);
              }
            } else {
              console.error('【Error】：更新后验证失败，值为空');
            }
          } else {
            console.log('【调试】：记录不存在，将插入新记录');
            // 插入新记录
            const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
            const result = insertStmt.run('aicontext.personalContext', promptContent);
            console.log(`【调试】：插入结果，最后插入ID: ${result.lastInsertRowid}`);
            
            if (!result.lastInsertRowid) {
              console.error('【Error】：插入失败，未返回插入ID');
              db.close();
              step4();
              return;
            }
            
            // 验证插入是否成功
            const verifyRow = db.prepare("SELECT value, length(value) as len FROM ItemTable WHERE key = ?").get('aicontext.personalContext');
            if (verifyRow && verifyRow.value) {
              let verifyContent = '';
              if (Buffer.isBuffer(verifyRow.value)) {
                verifyContent = verifyRow.value.toString('utf8');
              } else {
                verifyContent = String(verifyRow.value);
              }
              
              if (verifyContent === promptContent) {
                console.log(`✓ prompt.md 已添加到 Cursor user rules (${verifyRow.len} 字节)`);
                // 显示前几行内容确认
                const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
              } else {
                console.error(`【Error】：插入后内容不匹配！`);
                console.error(`  期望长度: ${promptContent.length}, 实际长度: ${verifyContent.length}`);
              }
            } else {
              console.error('【Error】：插入后验证失败，值为空');
            }
          }
          
          console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
        } catch (dbError) {
          console.error('【Error】：操作数据库失败', dbError.message);
          if (dbError.code === 'SQLITE_BUSY' || dbError.message.includes('locked')) {
            console.error('【Error】：数据库被锁定，可能是 Cursor 正在使用');
          }
          console.error('【Error】：错误堆栈', dbError.stack);
          console.log('【建议】：请关闭 Cursor 编辑器后重试');
        } finally {
          db.close();
        }
      } catch (dbError) {
        console.error('【Error】：无法打开数据库', dbError.message);
        console.log('【建议】：请关闭 Cursor 编辑器后重试');
      }
      
      step4();
    } catch (error) {
      console.error('【Error】：处理 prompt.md 失败', error.message);
      console.log('【Warning】：可能 Cursor 未安装或路径不正确，请手动复制 prompt.md');
      step4();
    }
  }

  // 步骤4: 检查并更新 .gitignore
  function step4() {
    console.log('步骤4: 正在检查 .gitignore 文件...');
    const gitignorePath = path.join(root_path, '.gitignore');

    try {
      if (fs.existsSync(gitignorePath)) {
        let gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
        const aiIgnorePattern = /^\.ai\s*$/m;

        if (!aiIgnorePattern.test(gitignoreContent)) {
          // 如果文件末尾没有换行，先添加换行
          if (!gitignoreContent.endsWith('\n')) {
            gitignoreContent += '\n';
          }
          gitignoreContent += '.ai\n';
          fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
          console.log('✓ 已在 .gitignore 中添加 .ai 忽略规则');
        } else {
          console.log('✓ .gitignore 中已存在 .ai 忽略规则');
        }
      } else {
        // 如果 .gitignore 不存在，创建它
        fs.writeFileSync(gitignorePath, '.ai\n', 'utf8');
        console.log('✓ 已创建 .gitignore 并添加 .ai 忽略规则');
      }
    } catch (error) {
      console.error('【Error】：更新 .gitignore 失败', error.message);
    }

    cleanupAndExit(0);
  }

  // 清理临时目录并退出
  function cleanupAndExit(exitCode) {
    deleteDir(cloneDir, () => {
      console.log('【prina-cmd ai-pull】：执行完成！');
      process.exit(exitCode);
    });
  }
};
