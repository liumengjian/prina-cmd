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
const AI_REPO_URL = 'git@github.com:liumengjian/ai-skills.git';
// Git 分支/标签（默认值）
const DEFAULT_BRANCH = 'main';

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

module.exports = (branch) => {
  const root_path = path.resolve('./');
  const tmpDir = os.tmpdir();
  const cloneDir = path.join(tmpDir, 'jjb-ai-temp');
  
  // 使用传入的分支参数，如果没有则使用默认值
  const targetBranch = branch || DEFAULT_BRANCH;

  console.log('【jjb-cmd ai-pull】：开始执行...');
  console.log(`【分支】：${targetBranch}`);

  // 步骤1: 拉取或更新仓库代码
  console.log(`步骤1: 正在拉取 jjb-ai 仓库代码（分支: ${targetBranch}）...`);
  
  // 如果临时目录已存在，先删除
  deleteDir(cloneDir, () => {
    try {
      // 克隆仓库指定分支/标签
      child_process.execSync(`git clone -b ${targetBranch} ${AI_REPO_URL} "${cloneDir}"`, {
        stdio: 'inherit',
        cwd: tmpDir
      });
      console.log(`✓ 仓库代码拉取成功（分支: ${targetBranch}）`);

      // 步骤2: 将仓库 admin 下所有子文件夹同步到当前项目 .cursor/（与 admin 同名的子目录）
      console.log('步骤2: 正在复制 admin 下的文件夹到 .cursor/...');
      const adminPath = path.join(cloneDir, 'admin');
      const cursorDir = path.join(root_path, '.cursor');

      if (!fs.existsSync(adminPath)) {
        console.log('【Warning】：仓库中未找到 admin 文件夹');
        step3();
      } else {
        let subdirs;
        try {
          subdirs = fs.readdirSync(adminPath).filter((name) => {
            const p = path.join(adminPath, name);
            try {
              return fs.statSync(p).isDirectory();
            } catch (e) {
              return false;
            }
          });
        } catch (e) {
          console.error('【Error】：读取 admin 目录失败', e.message);
          cleanupAndExit(1);
          return;
        }

        if (subdirs.length === 0) {
          console.log('【Warning】：admin 下没有子文件夹可同步');
          step3();
        } else {
          try {
            if (!fs.existsSync(cursorDir)) {
              fs.mkdirSync(cursorDir, { recursive: true });
            }
          } catch (e) {
            console.error('【Error】：创建 .cursor 目录失败', e.message);
            cleanupAndExit(1);
            return;
          }

          function copyAdminDirAt(i) {
            if (i >= subdirs.length) {
              console.log(`✓ 已将 admin 下 ${subdirs.length} 个文件夹复制到 .cursor/（${subdirs.join(', ')}）`);
              step3();
              return;
            }
            const name = subdirs[i];
            const srcPath = path.join(adminPath, name);
            const destPath = path.join(cursorDir, name);
            const afterCopy = (err) => {
              if (err) {
                console.error(`【Error】：复制 admin/${name} 失败`, err.message);
                cleanupAndExit(1);
                return;
              }
              copyAdminDirAt(i + 1);
            };
            if (fs.existsSync(destPath)) {
              deleteDir(destPath, () => {
                copyFolder(srcPath, destPath, afterCopy);
              });
            } else {
              copyFolder(srcPath, destPath, afterCopy);
            }
          }

          copyAdminDirAt(0);
        }
      }
    } catch (error) {
      console.error('【Error】：拉取仓库失败', error.message);
      cleanupAndExit(1);
    }
  });

  // 步骤3: 将 admin/rules/PROJECT.md 写入 Cursor user rules (SQLite 数据库)
  function step3() {
    console.log('步骤3: 正在更新 Cursor user rules (SQLite 数据库)...');
    const projectRulesPath = path.join(cloneDir, 'admin', 'rules', 'PROJECT.md');

    try {
      if (!fs.existsSync(projectRulesPath)) {
        console.log('【Warning】：仓库中未找到 admin/rules/PROJECT.md 文件');
        step4();
        return;
      }

      // 读取 PROJECT.md 内容
      const rulesContent = fs.readFileSync(projectRulesPath, 'utf8');

      // 检查数据库文件是否存在
      if (!fs.existsSync(CURSOR_DB_PATH)) {
        console.log('【Warning】：Cursor 数据库文件不存在，可能 Cursor 未安装或路径不正确');
        console.log(`【路径】：${CURSOR_DB_PATH}`);
        console.log('【建议】：请确保已安装 Cursor 编辑器，或手动复制 admin/rules/PROJECT.md 内容');
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
          // 如果 better-sqlite3 不存在，尝试使用 sqlite3
          try {
            const sqlite3 = require('sqlite3');
            // sqlite3 是异步的，需要使用回调或 Promise
            console.log(`【调试】：准备更新数据库，内容长度: ${rulesContent.length} 字符`);
            
            const db = new sqlite3.Database(CURSOR_DB_PATH, (err) => {
              if (err) {
                console.error('【Error】：无法打开数据库', err.message);
                console.log('【建议】：请关闭 Cursor 编辑器后重试');
                step4();
                return;
              }

              // 先查询是否存在该键
              db.get("SELECT value, length(value) as len FROM ItemTable WHERE key = ?", ['aicontext.personalContext'], (err, row) => {
                if (err) {
                  console.error('【Error】：查询数据库失败', err.message);
                  db.close();
                  step4();
                  return;
                }

                // 更新或插入数据
                if (row) {
                  console.log(`【调试】：找到现有记录，当前长度: ${row.len} 字节`);
                  
                  // 检查内容是否已经相同
                  let oldContent = '';
                  if (Buffer.isBuffer(row.value)) {
                    oldContent = row.value.toString('utf8');
                  } else {
                    oldContent = String(row.value);
                  }
                  
                  if (oldContent === rulesContent) {
                    console.log('✓ admin/rules/PROJECT.md 内容未变化，无需更新');
                    console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
                    db.close();
                    step4();
                    return;
                  }
                  
                  // 更新现有记录
                  db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [rulesContent, 'aicontext.personalContext'], function(err) {
                    if (err) {
                      console.error('【Error】：更新数据库失败', err.message);
                      if (err.code === 'SQLITE_BUSY' || err.message.includes('locked')) {
                        console.error('【Error】：数据库被锁定，可能是 Cursor 正在使用');
                      }
                      console.log('【建议】：请关闭 Cursor 编辑器后重试');
                      db.close();
                      step4();
                      return;
                    }
                    
                    console.log(`【调试】：更新影响行数: ${this.changes}`);
                    
                    if (this.changes === 0) {
                      console.error('【Error】：更新失败，影响行数为 0，可能数据库被锁定');
                      console.log('【建议】：请关闭 Cursor 编辑器后重试');
                      db.close();
                      step4();
                      return;
                    }
                    
                    // 验证更新是否成功
                    db.get("SELECT value, length(value) as len FROM ItemTable WHERE key = ?", ['aicontext.personalContext'], (err, verifyRow) => {
                      if (err) {
                        console.error('【Error】：验证更新失败', err.message);
                      } else if (verifyRow && verifyRow.value) {
                        let verifyContent = '';
                        if (Buffer.isBuffer(verifyRow.value)) {
                          verifyContent = verifyRow.value.toString('utf8');
                        } else {
                          verifyContent = String(verifyRow.value);
                        }
                        
                        if (verifyContent === rulesContent) {
                          console.log(`✓ PROJECT.md 已更新到 Cursor user rules (${verifyRow.len} 字节)`);
                          // 显示前几行内容确认
                          const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                          console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
                        } else {
                          console.error(`【Error】：更新后内容不匹配！`);
                          console.error(`  期望长度: ${rulesContent.length}, 实际长度: ${verifyContent.length}`);
                          console.error(`  期望前100字符: ${rulesContent.substring(0, 100)}`);
                          console.error(`  实际前100字符: ${verifyContent.substring(0, 100)}`);
                        }
                      } else {
                        console.error('【Error】：更新后验证失败，值为空');
                      }
                      
                      console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
                      db.close();
                      step4();
                    });
                  });
                } else {
                  console.log('【调试】：记录不存在，将插入新记录');
                  // 插入新记录
                  db.run("INSERT INTO ItemTable (key, value) VALUES (?, ?)", ['aicontext.personalContext', rulesContent], function(err) {
                    if (err) {
                      console.error('【Error】：插入数据库失败', err.message);
                      if (err.code === 'SQLITE_BUSY' || err.message.includes('locked')) {
                        console.error('【Error】：数据库被锁定，可能是 Cursor 正在使用');
                      }
                      console.log('【建议】：请关闭 Cursor 编辑器后重试');
                      db.close();
                      step4();
                      return;
                    }
                    
                    console.log(`【调试】：插入结果，最后插入ID: ${this.lastInsertRowid}`);
                    
                    if (!this.lastInsertRowid) {
                      console.error('【Error】：插入失败，未返回插入ID');
                      db.close();
                      step4();
                      return;
                    }
                    
                    // 验证插入是否成功
                    db.get("SELECT value, length(value) as len FROM ItemTable WHERE key = ?", ['aicontext.personalContext'], (err, verifyRow) => {
                      if (err) {
                        console.error('【Error】：验证插入失败', err.message);
                      } else if (verifyRow && verifyRow.value) {
                        let verifyContent = '';
                        if (Buffer.isBuffer(verifyRow.value)) {
                          verifyContent = verifyRow.value.toString('utf8');
                        } else {
                          verifyContent = String(verifyRow.value);
                        }
                        
                        if (verifyContent === rulesContent) {
                          console.log(`✓ PROJECT.md 已添加到 Cursor user rules (${verifyRow.len} 字节)`);
                          // 显示前几行内容确认
                          const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                          console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
                        } else {
                          console.error(`【Error】：插入后内容不匹配！`);
                          console.error(`  期望长度: ${rulesContent.length}, 实际长度: ${verifyContent.length}`);
                        }
                      } else {
                        console.error('【Error】：插入后验证失败，值为空');
                      }
                      
                      console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
                      db.close();
                      step4();
                    });
                  });
                }
              });
            });
            return; // 异步操作，提前返回
          } catch (e2) {
            console.error('【Error】：未找到 SQLite 模块 (better-sqlite3 或 sqlite3)');
            console.log('【建议】：请运行 npm install better-sqlite3 或 npm install sqlite3');
            console.log('【或者】：使用命令行工具手动更新数据库');
            step4();
            return;
          }
        }

        // 使用 better-sqlite3 (同步 API)
        const db = new Database(CURSOR_DB_PATH, { readonly: false });
        
        try {
          console.log(`【调试】：准备更新数据库，内容长度: ${rulesContent.length} 字符`);
          
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
            
            if (oldContent === rulesContent) {
              console.log('✓ admin/rules/PROJECT.md 内容未变化，无需更新');
              console.log('【提示】：请重启 Cursor 编辑器以使规则生效');
              db.close();
              step4();
              return;
            }
            
            // 更新现有记录
            const updateStmt = db.prepare("UPDATE ItemTable SET value = ? WHERE key = ?");
            const result = updateStmt.run(rulesContent, 'aicontext.personalContext');
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
              
              if (verifyContent === rulesContent) {
                console.log(`✓ PROJECT.md 已更新到 Cursor user rules (${verifyRow.len} 字节)`);
                // 显示前几行内容确认
                const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
              } else {
                console.error(`【Error】：更新后内容不匹配！`);
                console.error(`  期望长度: ${rulesContent.length}, 实际长度: ${verifyContent.length}`);
                console.error(`  期望前100字符: ${rulesContent.substring(0, 100)}`);
                console.error(`  实际前100字符: ${verifyContent.substring(0, 100)}`);
              }
            } else {
              console.error('【Error】：更新后验证失败，值为空');
            }
          } else {
            console.log('【调试】：记录不存在，将插入新记录');
            // 插入新记录
            const insertStmt = db.prepare("INSERT INTO ItemTable (key, value) VALUES (?, ?)");
            const result = insertStmt.run('aicontext.personalContext', rulesContent);
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
              
              if (verifyContent === rulesContent) {
                console.log(`✓ PROJECT.md 已添加到 Cursor user rules (${verifyRow.len} 字节)`);
                // 显示前几行内容确认
                const previewLines = verifyContent.split('\n').slice(0, 3).join('\n');
                console.log(`【预览】：内容前3行:\n${previewLines}${verifyContent.split('\n').length > 3 ? '...' : ''}`);
              } else {
                console.error(`【Error】：插入后内容不匹配！`);
                console.error(`  期望长度: ${rulesContent.length}, 实际长度: ${verifyContent.length}`);
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
      console.error('【Error】：处理 admin/rules/PROJECT.md 失败', error.message);
      console.log('【Warning】：可能 Cursor 未安装或路径不正确，请手动复制 admin/rules/PROJECT.md 内容');
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
        const cursorIgnorePattern = /^\.cursor\/?\s*$/m;

        if (!cursorIgnorePattern.test(gitignoreContent)) {
          // 如果文件末尾没有换行，先添加换行
          if (!gitignoreContent.endsWith('\n')) {
            gitignoreContent += '\n';
          }
          gitignoreContent += '.cursor/\n';
          fs.writeFileSync(gitignorePath, gitignoreContent, 'utf8');
          console.log('✓ 已在 .gitignore 中添加 .cursor/ 忽略规则');
        } else {
          console.log('✓ .gitignore 中已存在 .cursor 忽略规则');
        }
      } else {
        // 如果 .gitignore 不存在，创建它
        fs.writeFileSync(gitignorePath, '.cursor/\n', 'utf8');
        console.log('✓ 已创建 .gitignore 并添加 .cursor/ 忽略规则');
      }
    } catch (error) {
      console.error('【Error】：更新 .gitignore 失败', error.message);
    }

    cleanupAndExit(0);
  }

  // 清理临时目录并退出
  function cleanupAndExit(exitCode) {
    deleteDir(cloneDir, () => {
      console.log('【jjb-cmd ai-pull】：执行完成！');
      process.exit(exitCode);
    });
  }
};
