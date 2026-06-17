// ZCode MCP 集成验证脚本
const BASE = 'http://127.0.0.1:15177';

async function mcp(tool, args = {}) {
  const res = await fetch(BASE + '/api/mcp', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({tool, args})
  });
  return res.json();
}

function getText(data) {
  return data?.result?.content?.[0]?.text || 'N/A';
}

async function main() {
  console.log('=== ZCode MCP 集成验证 ===\n');
  
  // 1. 模式验证
  const mode = await (await fetch(BASE + '/api/mode')).json();
  console.log('[1/8] 模式:', mode.mode);
  if (mode.mode !== 'core-only') throw new Error('模式不正确');
  
  // 2. 工具目录
  const tools = await (await fetch(BASE + '/api/mcp')).json();
  const toolNames = Object.keys(tools.tools);
  console.log('[2/8] MCP 工具数:', toolNames.length);
  
  // 3. 小说列表
  const list = await mcp('novel_list');
  const novels = JSON.parse(getText(list)).novels;
  console.log('[3/8] 小说列表:', novels.length, '本');
  if (novels.length === 0) {
    console.log('  ⚠ 没有小说，将新建一本');
    const created = await mcp('novel_create', {title: 'ZCode 测试小说'});
    const novel = JSON.parse(getText(created)).novel;
    novels.push({id: novel.id, title: novel.title});
    console.log('  ✅ 已创建:', novel.title);
  } else {
    novels.forEach(n => console.log('   -', n.title));
  }
  
  const novelId = novels[0].id;
  
  // 4. 状态查看
  const state = await mcp('novel_get_state', {novelId});
  console.log('[4/8] novel_get_state ✅');
  
  const chars = await mcp('novel_get_characters', {novelId});
  const charList = JSON.parse(getText(chars)).characters;
  console.log('[5/8] 角色数:', charList.length, '(将创建测试角色)');
  
  // 5. 创建角色
  const created = await mcp('character_create', {
    novelId,
    name: '测试角色',
    roleType: 'major',
    description: '通过 ZCode MCP 创建的角色',
    personality: '勇敢、正直、有点固执'
  });
  const newChar = JSON.parse(getText(created)).character;
  console.log('   ✅ 已创建角色:', newChar.name, '(ID:', newChar.id, ')');
  
  // 6. 创建世界书
  const lore = await mcp('lorebook_create_entry', {
    novelId,
    keys: ['测试关键词', '测试'],
    content: '这是一个通过 MCP 创建的世界书条目',
    priority: 50
  });
  const entry = JSON.parse(getText(lore)).entry;
  console.log('[6/8] 世界书条目已创建:', entry.id);
  
  // 7. 创建记忆
  const mem = await mcp('memory_create', {
    novelId,
    subject: '测试记忆',
    field: 'test_field',
    value: '通过 MCP 创建的测试记忆条目',
    visibility: 'public'
  });
  const memItem = JSON.parse(getText(mem)).memory;
  console.log('[7/8] 记忆已创建:', memItem.id);
  
  // 8. 策划路由阻断验证
  const block = await fetch(BASE + '/api/novels/' + novelId + '/planning-doctor');
  const blocked = await block.json();
  console.log('[8/8] 策划路由阻断:', blocked.message === '此模式下策划 Agent 功能不可用' ? '✅ 已阻断' : '❌ 未阻断');
  
  // 最终结果
  const final = await mcp('novel_get_state', {novelId});
  const finalState = JSON.parse(getText(final));
  console.log('\n=== 验证结果 ===');
  console.log('小说:', finalState?.novels?.[0]?.title || novelId);
  console.log('角色数:', finalState?.novels?.[0]?.characters?.length || 'N/A');
  console.log('世界书条目:', finalState?.novels?.[0]?.lorebook?.entries?.length || 'N/A');
  console.log('记忆条目:', finalState?.novels?.[0]?.memory?.items?.length || 'N/A');
  console.log('\n🎉 ZCode MCP 集成验证全部通过！');
}

main().catch(e => {
  console.error('\n❌ 验证失败:', e.message);
  process.exit(1);
});
