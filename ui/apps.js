// App registry. Adding an app: add an entry here, register its factory in phone.js,
// and place its id on the home screen below (a reserved slot is replaced by the id).
//   colors: [tile top, tile bottom / glyph shade, glyph accent]
export const APPS = {
  logs: {name: '日志', eyebrow: 'Logs', colors: ['#b9d9ed', '#557c9e', '#a7f3cb']},
  roles: {name: '角色', eyebrow: 'Character', colors: ['#9ad8ff', '#4a9af0', '#ff9dbb']},
  engines: {name: '引擎', eyebrow: 'Wallet', colors: ['#cdb6ff', '#8a6cf2', '#fff09a']},
  presets: {name: '预设', eyebrow: 'Preset', colors: ['#ffe39c', '#ffac3f', '#ff7f86']},
  library: {name: '音频收藏', eyebrow: 'Voice Library', colors: ['#ffb6cc', '#ee6690', '#fff0a0']},
  gallery: {name: '相册', eyebrow: 'Album', colors: ['#ffcfb0', '#ff8d69', '#8fd1ff']},
  notes: {name: '备忘录', eyebrow: 'Memo', colors: ['#fff4b3', '#f6c53c', '#ff9d5c']},
  listen: {name: '听取', eyebrow: 'Now Playing', colors: ['#ffa3c3', '#e9588e', '#fff09a']},
  settings: {name: '设置', eyebrow: 'Settings', colors: ['#e4e8f0', '#98a2b6', '#ffd36a']},
  draw: {name: '绘图', eyebrow: 'NovelAI', colors: ['#c3c3ff', '#6d6ff0', '#ffd46a']},
  chat: {name: '聊天', eyebrow: 'Messages', colors: ['#8fd8ff', '#3d8ff0', '#ff9dbb']},
  forum: {name: '论坛', eyebrow: 'Forum', colors: ['#b8f0d0', '#38b07a', '#ffd36a']},
  peek: {name: '查手机', eyebrow: 'Peek', colors: ['#ffc6e0', '#c85a9a', '#9fe0ff']},
  sounds: {name: '音效', eyebrow: 'Ambience', colors: ['#a8e6e0', '#2f9e95', '#ffe08a']},
  assistant: {name: '助手', eyebrow: 'Assistant', colors: ['#c1b9ff', '#7869d7', '#ffe7a4']},
  music: {name: '音乐', eyebrow: 'Music', colors: ['#ffb3c7', '#e8507a', '#ffe08a']},
  indie: {name: '大游戏', eyebrow: 'Independent Games', colors: ['#a8d4c8', '#285c68', '#f5d69b']},
  games: {name: '小游戏', eyebrow: 'Arcade', colors: ['#b9f3c9', '#33b36b', '#ffd36a']},
  paint: {name: '画画', eyebrow: 'Paint', colors: ['#ffd1e6', '#e85d9b', '#7fd0ff']},
  vn: {name: '视觉小说', eyebrow: 'Visual Novel', colors: ['#ffd49a', '#f07a45', '#fff2b8']},
  picbook: {name: '绘本', eyebrow: 'Picture Book', colors: ['#bfe6ff', '#3f8fe8', '#ffd25e']}
};

export const SLOT = null;

// Home screen: page 1 sits under the clock and widgets; later pages hold apps to come. Reserved places (SLOT) are not
// shown, and a page with only reserved places is left out.
export const HOME = {
  pages: [
    ['roles', 'engines', 'presets', 'library', 'gallery', 'notes', 'forum', 'peek'],
    ['sounds', 'assistant', 'music', 'games', 'paint', 'vn', 'logs', 'indie', 'picbook']
  ],
  dock: ['chat', 'draw', 'listen', 'settings']
};

export const appName = id => APPS[id]?.name || id;
