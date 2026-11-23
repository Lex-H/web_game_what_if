/**
 * What If — 情境設定（scenarios.js）
 *
 * 對應《開發文檔》第二章（情境、角色、地點表）、6.4～6.5（事件池）、
 * 6.6（備援選項）、12.2（隱私說明）、13.1～13.4（資源、聲明、首頁文案）。
 *
 * 與 Cloudflare Worker 共用（10.2）：本檔不讀寫 DOM，只匯出資料與純函式。
 * 數字以第二章為準，修改時請同步更新文件。
 */
import { validateCharacterConfig } from './rules.js';

// ─── 2.1 四大情境 ─────────────────────────────────────────────

export const SCENARIOS = Object.freeze([
  {
    id: 'taiwan_occupied',
    title: '明天，臺灣被攻佔',
    subtitle: '7 個回合，你能帶著誰活下去？',
    intro: '選一個身份，在資訊混亂與資源有限的 7 個回合裡，做出你的選擇。',
    open: true,
    characters: ['clerk', 'office', 'vp'],
  },
  { id: 'ccp_collapse', title: '中共政權明天倒臺之後', open: false, characters: [] },
  { id: 'russia_defeat', title: '俄烏戰爭俄羅斯慘敗，首都被攻陷', open: false, characters: [] },
  { id: 'china_hegemony', title: '中國贏得美中霸權競爭，成為世界最強國家', open: false, characters: [] },
]);

export const DEFAULT_SCENARIO_ID = 'taiwan_occupied';

// ─── 2.3～2.6 角色 ────────────────────────────────────────────

/** 顯示用名稱（rules.js 只認 key） */
export const STAT_LABELS = Object.freeze({ calm: '冷靜度', intel: '資訊敏感度', execution: '目標執行力' });
export const SUPPLY_LABELS = Object.freeze({
  water: '飲水',
  food: '食物',
  medicine: '藥品',
  power_bank: '行動電源',
  phone_battery: '手機電量',
  rations: '口糧（天）',
  fuel: '燃料',
  backup_power: '備用電源',
});
export const TRANSPORT_LABELS = Object.freeze({
  walk: '步行',
  scooter: '機車',
  mrt: '捷運',
  bus: '公車',
  car: '汽車',
  convoy: '山區車隊',
  helicopter: '直升機',
});
export const CONTACT_LABELS = Object.freeze({ none: '尚未聯絡', contacted: '已聯絡', confirmed: '已確認位置' });
export const ORDER_LABELS = Object.freeze({ normal: '正常', tense: '緊張', chaotic: '混亂' });
export const MILESTONE_STATUS_LABELS = Object.freeze({ none: '未開始', partial: '進行中', done: '完成', lost: '失去' });

const CIVILIAN_CAPS = Object.freeze({ water: 10, food: 10, medicine: 5, power_bank: 3 });
const CIVILIAN_TIME = Object.freeze([1, 2, 2, 3, 3, 4, 4]);

export const CHARACTERS = Object.freeze({
  clerk: {
    id: 'clerk',
    name: '超商夜班店員',
    goal: '取得必要物資，並與家人會合',
    advantage: '熟悉店內物資與庫存。在超商可取得的物品較多，物資類行動的成功判定較寬鬆。',
    challenge: '交通能力有限、家人聯絡、尋找安全會合方式。',
    startLabel: '事件發生後 0 小時，凌晨 3 點，你正在值夜班。',
    startHour: 3, // 開局時鐘（凌晨 3 點），current_time 從 0 起算
    timeUnit: 'hour',
    milestones: [
      { id: 'm_supplies', name: '取得足夠物資', weight: 20, recoverable: true, skipPartial: true },
      { id: 'm_contact', name: '聯絡家人並確認位置', weight: 25, recoverable: true, skipPartial: false },
      { id: 'm_transport', name: '找到可行的移動方式', weight: 25, recoverable: true, skipPartial: false },
      {
        id: 'm_arrive',
        name: '安全抵達會合點',
        weight: 30,
        recoverable: false,
        skipPartial: false,
        requires: { partial: { m_transport: 'done' }, done: { m_contact: 'done' } },
      },
    ],
    stats: { calm: 50, intel: 40, execution: 60 },
    supplyCaps: CIVILIAN_CAPS,
    timePerRound: CIVILIAN_TIME,
    initialWorld: {
      location: 'loc_store',
      supplies: { water: 1, food: 1, medicine: 0, power_bank: 0, phone_battery: 40 },
      family: { contact: 'none', meeting_point: 'loc_home_clerk' },
      transportation: { mode: 'walk', owned: ['walk'], fuel: 0 },
      information: { confirmed: ['發生突發重大事件'], unconfirmed: [] },
      environment: { order: 'tense', notes: ['店內只有自己，街上開始出現人潮'] },
    },
    unknowns: ['事件規模', '安全路線'],
  },

  office: {
    id: 'office',
    name: '一般上班族',
    goal: '安全撤離並與家人會合',
    advantage: '熟悉城市交通與工作地點周邊。交通與路線類行動的成功判定較寬鬆，知道替代路線。',
    challenge: '交通中斷、資訊判斷、尋找可行的撤離方式。',
    startLabel: '事件發生後 0 小時，上午 9 點，你剛進公司。',
    startHour: 9,
    timeUnit: 'hour',
    milestones: [
      { id: 'm_intel', name: '確認可信的撤離資訊', weight: 20, recoverable: true, skipPartial: true },
      { id: 'm_contact', name: '聯絡家人並約定會合點', weight: 25, recoverable: true, skipPartial: false },
      { id: 'm_transport', name: '取得可用的交通方式', weight: 25, recoverable: true, skipPartial: false },
      {
        id: 'm_evacuate',
        name: '安全撤離並與家人會合',
        weight: 30,
        recoverable: false,
        skipPartial: false,
        requires: { partial: { m_transport: 'done' }, done: { m_contact: 'done' } },
      },
    ],
    stats: { calm: 50, intel: 60, execution: 40 },
    supplyCaps: CIVILIAN_CAPS,
    timePerRound: CIVILIAN_TIME,
    initialWorld: {
      location: 'loc_office',
      supplies: { water: 1, food: 0, medicine: 0, power_bank: 1, phone_battery: 80 },
      family: { contact: 'none', meeting_point: 'loc_home_office' },
      // 機車停在地下室（油量半箱）；人還在辦公室，目前交通方式是步行
      transportation: { mode: 'walk', owned: ['walk', 'scooter'], fuel: 50 },
      information: { confirmed: ['發生突發重大事件'], unconfirmed: [] },
      environment: { order: 'tense', notes: ['同事陸續到公司，管理員尚無指示'] },
    },
    unknowns: ['大眾運輸是否停駛', '撤離地點'],
  },

  vp: {
    id: 'vp',
    name: '副總統',
    goal: '維繫政府運作，並為臺灣爭取外援',
    advantage: '擁有剩餘政府與部隊的指揮權，可調度人員、物資與通訊資源；對外發言具政府的正式代表性。',
    challenge: '通訊被干擾或監聽、基地位置可能暴露、內部對抵抗或談判意見分歧、命令能否傳達、家人下落不明。',
    startLabel: '撤入中央山脈軍事基地後的第一晚。總統已殉職，你接掌了剩下的一切。',
    startHour: 21,
    timeUnit: 'hour',
    milestones: [
      { id: 'm_command', name: '重建指揮體系，與失聯部隊恢復聯繫', weight: 20, recoverable: true, skipPartial: true },
      { id: 'm_base', name: '確保基地補給與通訊穩定', weight: 25, recoverable: true, skipPartial: false },
      { id: 'm_voice', name: '對外宣告政府仍在運作', weight: 25, recoverable: true, skipPartial: false },
      {
        id: 'm_lifeline',
        name: '取得外國支援並建立外援通道',
        weight: 30,
        recoverable: false,
        skipPartial: false,
        requires: { partial: { m_voice: 'done' }, done: { m_base: 'done' } },
      },
    ],
    stats: { calm: 60, intel: 50, execution: 50 },
    supplyCaps: Object.freeze({ rations: 30, fuel: 10, medicine: 10, backup_power: 3 }),
    timePerRound: Object.freeze([6, 12, 12, 24, 24, 24, 48]),
    initialWorld: {
      location: 'loc_base',
      // phone_battery 在 vp 代表「對外通訊設備電力」（2.6）
      supplies: { rations: 14, fuel: 3, medicine: 2, backup_power: 1, phone_battery: 60 },
      family: { contact: 'none', meeting_point: 'loc_base' },
      transportation: { mode: 'convoy', owned: ['walk', 'convoy', 'helicopter'], fuel: 0 },
      information: { confirmed: ['總統殉職', '臺灣已被攻佔'], unconfirmed: [] },
      environment: { order: 'tense', notes: ['基地士氣低落，對外通訊受干擾'] },
    },
    unknowns: ['各部隊存續狀況', '國際社會態度'],
  },
});

/** 2.6：vp 的 phone_battery 顯示名稱不同 */
export function supplyLabel(characterId, key) {
  if (key === 'phone_battery' && characterId === 'vp') return '通訊設備電力';
  return SUPPLY_LABELS[key] ?? key;
}

// ─── 2.7 地點表 ───────────────────────────────────────────────
// items：可取得的 supplies key（2.7 的「電池」「毛毯」沒有對應的 supplies 欄位，僅作敘事）
// transport：在此地點可取得的交通方式；power：此地有電力，手機電量可上升
// neighbors[].modes：可用交通；blockedBy：這些事件發生後路線中斷

export const LOCATIONS = Object.freeze({
  // clerk
  loc_store: {
    name: '超商（起點）', characters: ['clerk'], power: true,
    items: ['water', 'food', 'medicine', 'power_bank'],
    neighbors: [{ to: 'loc_street_c', modes: ['walk'] }],
  },
  loc_street_c: {
    name: '街道 / 路口', characters: ['clerk'], items: [],
    neighbors: [
      { to: 'loc_store', modes: ['walk'] },
      { to: 'loc_shelter', modes: ['walk'] },
      { to: 'loc_home_clerk', modes: ['walk', 'scooter'] },
    ],
  },
  loc_shelter: {
    name: '里民活動中心（臨時收容點）', characters: ['clerk'], power: true, items: ['water'],
    neighbors: [{ to: 'loc_street_c', modes: ['walk'] }],
  },
  loc_home_clerk: {
    name: '家人住處（會合點）', characters: ['clerk'], items: [],
    neighbors: [{ to: 'loc_street_c', modes: ['walk', 'scooter'] }],
  },

  // office
  loc_office: {
    name: '辦公大樓（起點）', characters: ['office'], power: true, items: ['water', 'power_bank'],
    neighbors: [
      { to: 'loc_office_garage', modes: ['walk'] },
      { to: 'loc_mrt', modes: ['walk'] },
      { to: 'loc_street_o', modes: ['walk'] },
    ],
  },
  loc_office_garage: {
    name: '辦公大樓地下停車場', characters: ['office'], items: [],
    neighbors: [
      { to: 'loc_office', modes: ['walk'] },
      { to: 'loc_street_o', modes: ['scooter'] },
    ],
  },
  loc_mrt: {
    name: '捷運站', characters: ['office'], items: [], transport: ['mrt'],
    neighbors: [
      { to: 'loc_office', modes: ['walk'] },
      { to: 'loc_street_o', modes: ['walk'] },
      { to: 'loc_home_office', modes: ['mrt'], blockedBy: ['ev_mrt_stop'] },
    ],
  },
  loc_street_o: {
    name: '街道 / 路口', characters: ['office'], items: [],
    neighbors: [
      { to: 'loc_office', modes: ['walk'] },
      { to: 'loc_mrt', modes: ['walk'] },
      { to: 'loc_home_office', modes: ['walk', 'scooter'] },
    ],
  },
  loc_home_office: {
    name: '家人住處（會合點）', characters: ['office'], items: [],
    neighbors: [
      { to: 'loc_mrt', modes: ['mrt'], blockedBy: ['ev_mrt_stop'] },
      { to: 'loc_street_o', modes: ['walk', 'scooter'] },
    ],
  },

  // vp
  loc_base: {
    name: '中央山脈軍事基地（起點）', characters: ['vp'], power: true,
    items: ['rations', 'fuel', 'medicine', 'backup_power'],
    neighbors: [
      { to: 'loc_mountain_road', modes: ['convoy', 'walk'] },
      { to: 'loc_relay', modes: ['helicopter'] },
    ],
  },
  loc_mountain_road: {
    name: '基地聯外山路', characters: ['vp'], items: [],
    neighbors: [
      { to: 'loc_base', modes: ['convoy', 'walk'] },
      { to: 'loc_relay', modes: ['convoy'] },
    ],
  },
  loc_relay: {
    name: '山區中繼通訊站', characters: ['vp'], items: ['backup_power'],
    neighbors: [
      { to: 'loc_base', modes: ['helicopter', 'convoy'] },
      { to: 'loc_mountain_road', modes: ['convoy'] },
      { to: 'loc_contact', modes: ['helicopter'] },
    ],
  },
  loc_contact: {
    name: '外援接觸點', characters: ['vp'], items: [],
    neighbors: [{ to: 'loc_relay', modes: ['helicopter'] }],
  },
});

const HOME = { clerk: 'loc_home_clerk', office: 'loc_home_office' };
const STREETS = ['loc_street_c', 'loc_street_o'];
const COUNT_KEYS = ['water', 'food', 'medicine', 'power_bank', 'rations', 'fuel', 'backup_power'];

// ─── 6.4～6.5 事件池 ──────────────────────────────────────────
// condition(world, milestones) 回傳 true 才觸發；不成立時依 6.3 延後或取消

export const FOREIGN_AID_INFO = '某國表示願意有條件提供協助';

export const EVENT_LIST = Object.freeze([
  {
    id: 'ev_rumor', type: 'info', characters: ['clerk', 'office'], round_range: [1, 3],
    title: '矛盾的撤離消息', summary: '通訊群組流傳互相矛盾的撤離消息',
    core_facts: '通訊軟體群組出現多則互相矛盾的消息，其中混有未經證實的來源。',
    condition: (w) => (w.supplies?.phone_battery ?? 0) > 0,
    max_risk: 'minor', can_be_fatal: false, grants: {}, related_milestones: ['m_contact', 'm_intel'],
  },
  {
    id: 'ev_rush', type: 'supply', characters: ['clerk'], round_range: [1, 3],
    title: '搶購人潮', summary: '人潮湧入超商搶購',
    core_facts: '大量顧客同時湧入店內搶購民生物資，貨架迅速被清空。',
    condition: (w) => w.location === 'loc_store',
    max_risk: 'major', can_be_fatal: false, grants: {}, related_milestones: ['m_supplies'],
  },
  {
    id: 'ev_mrt_stop', type: 'transport', characters: ['office'], round_range: [1, 4],
    title: '大眾運輸停駛', summary: '捷運與公車停駛',
    core_facts: '市區捷運與公車系統全面停駛，官方尚未公告恢復時間。',
    condition: (w) => w.transportation?.mode === 'walk',
    max_risk: 'major', can_be_fatal: false, grants: {}, related_milestones: ['m_transport'],
  },
  {
    id: 'ev_blackout', type: 'supply', characters: ['clerk', 'office'], round_range: [2, 5],
    title: '區域停電', summary: '區域停電，通訊訊號不穩',
    core_facts: '玩家所在區域停電，行動網路訊號時斷時續。',
    condition: null,
    max_risk: 'major', can_be_fatal: false, grants: {}, related_milestones: ['m_contact', 'm_intel'],
  },
  {
    id: 'ev_neighbor', type: 'social', characters: ['clerk', 'office'], round_range: [3, 6],
    title: '陌生人的請求', summary: '陌生人或同事請求分享物資或同行',
    core_facts: '一名陌生人或同事主動接近，請求分享物資或結伴同行。',
    condition: (w) => COUNT_KEYS.some((k) => (w.supplies?.[k] ?? 0) > 0),
    max_risk: 'minor', can_be_fatal: false, grants: {}, related_milestones: ['m_transport', 'm_contact'],
  },
  {
    id: 'ev_crowd', type: 'safety', characters: ['clerk', 'office'], round_range: [3, 6],
    title: '路口推擠', summary: '路口發生群眾推擠與衝突',
    core_facts: '行經路口時遇上群眾推擠與衝突，現場秩序混亂。',
    condition: (w) => STREETS.includes(w.location),
    max_risk: 'major', can_be_fatal: true, grants: {}, related_milestones: ['m_transport', 'm_arrive', 'm_evacuate'],
  },
  {
    id: 'ev_checkpoint', type: 'safety', characters: ['clerk', 'office'], round_range: [4, 7],
    title: '道路管制', summary: '主要道路實施管制',
    core_facts: '主要聯外道路遭不明武裝人員設置管制點，進行盤查。',
    // 6.5「玩家需經街道前往會合點」：尚未抵達會合點即成立
    condition: (w) => !Object.values(HOME).includes(w.location),
    max_risk: 'major', can_be_fatal: true, grants: {}, related_milestones: ['m_arrive', 'm_evacuate'],
  },
  {
    id: 'ev_jamming', type: 'info', characters: ['vp'], round_range: [1, 3],
    title: '通訊干擾', summary: '對外通訊遭到干擾，只剩一條不穩定的線路',
    core_facts: '基地對外通訊系統遭到干擾，只剩一條不穩定的衛星線路可用。',
    condition: null,
    max_risk: 'minor', can_be_fatal: false, grants: {}, related_milestones: ['m_command', 'm_voice'],
  },
  {
    id: 'ev_ceasefire', type: 'social', characters: ['vp'], round_range: [2, 5],
    title: '停火爭議', summary: '部分將領主張接受停火條件',
    core_facts: '基地內部分將領認為應接受中共提出的停火條件，向副總統表達異議。',
    condition: (w, m) => ['partial', 'done'].includes(m?.m_command),
    max_risk: 'major', can_be_fatal: false, grants: {}, related_milestones: ['m_command', 'm_voice'],
  },
  {
    id: 'ev_supply_cut', type: 'supply', characters: ['vp'], round_range: [2, 5],
    title: '補給線中斷', summary: '山區補給線被切斷',
    core_facts: '通往基地的山區補給線遭切斷，物資運補中斷。',
    condition: null,
    max_risk: 'major', can_be_fatal: false, grants: {}, related_milestones: ['m_base'],
  },
  {
    id: 'ev_foreign_call', type: 'info', characters: ['vp'], round_range: [3, 6],
    title: '秘密來電', summary: '外國政府要求先證明政府仍在運作',
    core_facts: '一個外國政府透過秘密管道聯繫，表示若能證明政府仍有效運作，將考慮提供協助。',
    condition: (w, m) => m?.m_voice !== 'done',
    max_risk: 'minor', can_be_fatal: false, grants: { information: [FOREIGN_AID_INFO] },
    related_milestones: ['m_voice', 'm_lifeline'],
  },
  {
    id: 'ev_recon', type: 'safety', characters: ['vp'], round_range: [4, 7],
    title: '不明飛行器', summary: '不明飛行器在基地上空盤旋，位置可能已暴露',
    core_facts: '不明飛行器在基地上空盤旋偵察，基地位置可能已暴露。',
    condition: null,
    max_risk: 'major', can_be_fatal: true, grants: {}, related_milestones: ['m_base', 'm_lifeline'],
  },
]);

export const EVENTS = Object.freeze(Object.fromEntries(EVENT_LIST.map((e) => [e.id, e])));

export const EVENT_TYPE_LABELS = Object.freeze({ info: '資訊', supply: '物資', transport: '交通', social: '人際', safety: '安全' });

// ─── 6.6 備援選項（AI 選項不合法時使用；依回合階段 6.1） ──────

const phaseOf = (round) => (round <= 2 ? 0 : round <= 5 ? 1 : 2);

const FALLBACK = {
  clerk: [
    [
      { text: '先把店門半掩，整理手邊的物資', style: 'steady' },
      { text: '滑手機看新聞，確認發生了什麼事', style: 'intel' },
      { text: '立刻收拾東西衝出門回家', style: 'bold' },
    ],
    [
      { text: '守住現有物資，等局勢稍微平靜', style: 'steady' },
      { text: '向路人與群組打聽哪條路還能走', style: 'intel' },
      { text: '趁現在人少，直接往家的方向走', style: 'bold' },
    ],
    [
      { text: '沿著熟悉的小路慢慢前進', style: 'steady' },
      { text: '先打電話確認家人的確切位置', style: 'intel' },
      { text: '抄最短的大路全速趕回家', style: 'bold' },
    ],
  ],
  office: [
    [
      { text: '先留在公司，等大樓管理員的指示', style: 'steady' },
      { text: '查官方公告與交通資訊', style: 'intel' },
      { text: '馬上下樓牽機車離開', style: 'bold' },
    ],
    [
      { text: '和同事結伴，按原定路線移動', style: 'steady' },
      { text: '比對各方消息，找出可信的撤離點', style: 'intel' },
      { text: '改走沒人走的替代道路', style: 'bold' },
    ],
    [
      { text: '放慢速度，避開人多的路口', style: 'steady' },
      { text: '先和家人確認會合時間與地點', style: 'intel' },
      { text: '一口氣衝到會合點', style: 'bold' },
    ],
  ],
  vp: [
    [
      { text: '先清點基地人員與物資', style: 'steady' },
      { text: '派通訊兵嘗試聯繫失聯部隊', style: 'intel' },
      { text: '立即透過僅存線路對外發聲', style: 'bold' },
    ],
    [
      { text: '召集幕僚，先凝聚內部共識', style: 'steady' },
      { text: '透過秘密管道探詢各國態度', style: 'intel' },
      { text: '派直升機前往中繼站建立對外線路', style: 'bold' },
    ],
    [
      { text: '鞏固基地防護，保存實力', style: 'steady' },
      { text: '確認外援通道的每個環節是否可靠', style: 'intel' },
      { text: '親自前往外援接觸點', style: 'bold' },
    ],
  ],
};

export function fallbackOptions(characterId, round) {
  return (FALLBACK[characterId] ?? FALLBACK.clerk)[phaseOf(round)].map((o) => ({ ...o }));
}

// ─── 13.1～13.4、12.2 文案 ─────────────────────────────────────

export const RESOURCES = Object.freeze([
  { name: '內政部消防署', url: 'https://www.nfa.gov.tw/', note: '防災包準備、災害應變資訊' },
  { name: '全民安全指引', url: 'https://prepare.mnd.gov.tw/', note: '緊急情況下的民眾應變指引' },
  { name: '政府入口網', url: 'https://www.gov.tw/', note: '政府緊急應變資源' },
]);

export const DISCLAIMER =
  '本遊戲為架空情境互動敘事作品，並非真實事件預測或緊急應變指引。實際情況請以政府及相關機關發布的資訊為準。';

export const PRIVACY_NOTICE =
  '本遊戲統計少量匿名使用數據（例如使用的角色、回合結果、分享方式），用於改善遊戲體驗與評估服務成本；不會收集任何可識別個人身份的資訊，資料最長保存 180 天後自動刪除。';

export const HOME_COPY = Object.freeze({
  brand: 'What If',
  title: '明天，臺灣被攻佔',
  subtitle: '7 個回合，你能帶著誰活下去？',
  intro: '選一個身份，在資訊混亂與資源有限的 7 個回合裡，做出你的選擇。',
  start: '開始推演',
  random: '隨機抽一個',
  locked: '即將開放',
});

// ─── 2.2 設定檔自我檢查 ───────────────────────────────────────

/** 檢查所有角色、事件與地點；回傳錯誤清單（空陣列代表通過） */
export function validateScenarios() {
  const errors = [];
  for (const character of Object.values(CHARACTERS)) {
    errors.push(...validateCharacterConfig(character, EVENT_LIST));
    if (!LOCATIONS[character.initialWorld.location]) errors.push(`${character.id}: 起點地點不存在`);
  }
  const ids = EVENT_LIST.map((e) => e.id);
  if (new Set(ids).size !== ids.length) errors.push('事件 id 重複');
  for (const [id, loc] of Object.entries(LOCATIONS)) {
    for (const edge of loc.neighbors) {
      if (!LOCATIONS[edge.to]) errors.push(`${id}: 相鄰地點 ${edge.to} 不存在`);
    }
  }
  return errors;
}
