#! /usr/bin/env node

const commander = require('commander');
const path = require('path');
const fs = require('fs');

commander.command('v').description('-- 查看版本').action(() => {
  const package_json_file = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json')).toString());
  const {
    version
  } = package_json_file;
  console.log(`当前版本: v${version}`);
});

commander.command('help').description('-- 帮助').action(() => {
  console.log('prina-cmd <command>');
  console.log('');
  console.log('使用:');
  console.log('');
  console.log('prina-cmd help                       帮助');
  console.log('prina-cmd v                          查看版本');
  console.log('prina-cmd ai-pull                    拉取 AI 配置文件和规则');
});

// ai-pull 命令
commander.command('ai-pull').description('-- 拉取 AI 配置文件和规则').action(() => {
  require('../src/ai-pull.js')();
});

commander.parse(process.argv);
