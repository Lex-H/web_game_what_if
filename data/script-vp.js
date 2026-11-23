/**
 * 可玩劇本：副總統（vp）。
 * 主線固定 7 個節點，選項只改變當回合結果（開發文檔 11.2）。
 * 遵守 2.5：聚焦決策兩難，不寫戰術與武器操作，不出現真實姓名、部隊、基地名稱與座標，
 * 抵抗、談判、保存實力都是合理選擇，不暗示唯一正確答案。
 */
import { FOREIGN_AID_INFO } from '../js/scenarios.js';

const ms = (id, status, reason) => ({ id, status, reason });
const add = (path, value, reason) => ({ op: 'add', path, value, reason });
const rem = (path, value, reason) => ({ op: 'remove', path, value, reason });
const set = (path, value, reason) => ({ op: 'set', path, value, reason });
const go = (reason, ...locs) => locs.map((l) => set('location', l, reason));

const res = ({ n, p, risk = 'none', why, stat, m = [], w = [], sum }) => ({
  narrative: n,
  milestone_updates: m,
  performance: p,
  risk_event: { level: risk },
  score_reason: why,
  stat_changes: { calm: stat[0], intel: stat[1], execution: stat[2] },
  world_state_changes: w,
  round_summary: sum,
});

const V1 = '部分單位仍在原地待命';

export default {
  characterId: 'vp',
  keywords: {
    intel: ['打聽', '查證', '查', '問', '確認', '聯繫', '聯絡', '探詢', '觀察', '核對', '情報', '偵', '探', '傾聽', '詢問', '評估'],
    bold: ['衝', '直接', '馬上', '立刻', '闖', '硬', '搶', '強行', '冒險', '突破', '親自', '果斷', '不等', '當場', '公開', '宣告'],
  },

  nodes: [
    // ── 第 1 回合：衝擊 ─────────────────────────────────────
    {
      opening: '撤入基地的第一晚。總統已殉職，你接手了剩下的一切。走廊的燈光很暗，各部門的人都在等你開口。',
      options: [
        { text: '召集各部門，清點人員、物資與士氣', style: 'steady' },
        { text: '派通訊兵嘗試聯繫失聯的部隊', style: 'intel' },
        { text: '立即透過僅存的線路向外界發聲', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把各部門主管召進會議室，一項一項核對人員、口糧、燃料與藥品的數字。有人報得很精確，有人只能說「大概」。倉庫裡還翻出一批先前沒登記的庫存。你明白，數字背後是人心：他們想知道的不只是剩多少，而是你打算怎麼做。你沒有急著回答，只是把每個人報的數字都抄了一遍。',
          p: 'good', why: '先摸清家底，穩住人心', stat: [1, 0, 1], sum: '召集各部門清點家底',
          m: [ms('m_base', 'partial', '清點後掌握了基地的補給狀況'), ms('m_command', 'partial', '清點時順便確認了各單位名冊')],
          w: [
            add('supplies.rations', 3, '倉庫找到未登記的口糧'),
            add('supplies.fuel', 2, '倉庫找到未登記的燃料'),
            add('supplies.medicine', 1, '倉庫找到一批藥品'),
            add('supplies.backup_power', 1, '倉庫找到備用電源'),
            add('supplies.phone_battery', 10, '基地有電，補充通訊設備電力'),
            add('information.unconfirmed', V1, '通訊兵截到的零星回應'),
            add('environment.notes', '倉庫找到一批未登記的庫存', '清點物資'),
          ],
        }),
        intel: res({
          n: '你派出通訊兵，輪流用不同頻率呼叫失聯單位。大多數頻道只有雜訊，但在凌晨，一個微弱的回應傳了回來：部分單位還在原地待命，等待新的指示。你還不知道他們有多少人，也不知道通話有沒有被聽見。你讓通訊兵把頻率與時間寫在紙上，之後每一次呼叫都照表操課，不再憑運氣。',
          p: 'good', why: '在雜訊中接到第一個回應', stat: [0, 2, 0], sum: '輪流呼叫，接到微弱回應',
          m: [ms('m_command', 'done', '與待命的單位確認了聯繫方式')],
          w: [
            rem('supplies.phone_battery', 5, '反覆呼叫耗用電力'),
            add('information.unconfirmed', V1, '通訊兵截到的零星回應'),
            add('environment.notes', '凌晨有一個微弱的回應傳回來', '呼叫失聯單位'),
          ],
        }),
        bold: res({
          n: '你決定不再沉默，透過僅剩的那條不穩定線路向外界簡短宣告：總統殉職，政府由你接掌，正在確認各地狀況。聲明沒有口號，只有事實。訊號斷斷續續，沒人知道有多少人聽到，也沒人知道還有誰在聽。發送結束後，你在走廊站了很久，直到副官輕聲提醒，下一個會議已經開始。',
          p: 'good', risk: 'minor', why: '搶先發聲，但也冒了暴露的險', stat: [-1, 0, 2], sum: '率先對外簡短發聲',
          m: [ms('m_voice', 'partial', '對外發出第一則簡短聲明')],
          w: [
            rem('supplies.phone_battery', 8, '發送聲明耗用電力'),
            add('information.unconfirmed', V1, '通訊兵截到的零星回應'),
            add('environment.notes', '聲明已發出，不確定誰收到了', '對外發聲'),
          ],
        }),
      },
    },

    // ── 第 2 回合：本能反應 ──────────────────────────────────
    {
      opening: '第一個白天。基地內開始出現不同的聲音：有人想等待外援，有人主張與中共談判，也有人想保存實力等待時機。',
      options: [
        { text: '召集幕僚，先凝聚內部共識', style: 'steady' },
        { text: '透過秘密管道探詢各國的態度', style: 'intel' },
        { text: '派直升機前往中繼站，建立對外線路', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把各派意見請到同一張桌子旁，要求每個人把自己的看法完整說完，包括最不好聽的那一種。會議開得很長，沒有結論，但每個人都知道自己被聽見了。你覺得，這件事比任何決定都更需要先做。會後有人留下來向你道謝，也有人什麼都沒說就離開，你把兩者都記在心裡。',
          p: 'neutral', why: '花時間傾聽，換來暫時的穩定', stat: [2, 0, -1], sum: '召集各派，完整傾聽',
          m: [ms('m_base', 'lost', '補給線中斷，存量見底，基地補給失去穩定'), ms('m_base', 'partial', '各部門回報了補給與值勤狀況'), ms('m_command', 'done', '各單位主官重新確認了指揮關係')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            add('information.unconfirmed', FOREIGN_AID_INFO, '幕僚轉述的非正式消息'),
            set('environment.order', 'normal', '會後情緒稍微平復'),
            add('environment.notes', '各派意見都被完整聽取過', '召集幕僚'),
          ],
        }),
        intel: res({
          n: '你讓幕僚用不同管道向幾個友好政府探詢態度。回覆都很謹慎，多半是客套的關切；但其中一條訊息語氣不同，暗示有國家願意在某些條件下協助，只是要先看見你們到底能做什麼。你不知道這是承諾，還是試探。你把這條訊息單獨放進一個資料夾，沒有對任何人聲張，只在心裡默默掂量它的分量。',
          p: 'good', why: '聽到一絲外援的可能', stat: [0, 2, 0], sum: '探詢各國態度，得到一線希望',
          m: [ms('m_command', 'partial', '確認了幾個單位的位置'), ms('m_voice', 'partial', '透過非正式管道對外表明政府仍在運作')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '探詢消息耗用電力'),
            add('information.confirmed', V1, '回應已由第二個管道證實'),
            add('information.unconfirmed', FOREIGN_AID_INFO, '非正式管道傳來的消息'),
            add('environment.notes', '有一條訊息暗示可能有條件協助', '探詢各國態度'),
          ],
        }),
        bold: res({
          n: '你決定派直升機飛往山區中繼站，在那裡架設一條更穩定的對外線路。起飛前的氣氛很安靜，每個人都知道這一趟會消耗寶貴的燃料，也可能讓基地的位置曝光。你讓機組帶著一份簡短的稿子離開。機組升空後，你站在窗邊看了很久，直到引擎聲遠到幾乎聽不見。',
          p: 'poor', why: '線路架起來了，卻賠上燃料', stat: [-1, 0, 1], sum: '派直升機架設中繼線路',
          m: [ms('m_command', 'lost', '當場表態後，內部對指揮出現裂痕'), ms('m_voice', 'partial', '中繼站的線路讓對外發聲更穩定')],
          w: [
            set('transportation.mode', 'helicopter', '改用直升機'),
            ...go('飛往山區中繼站', 'loc_relay'),
            rem('supplies.fuel', 1, '直升機起飛耗用燃料'),
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 8, '長時間對外發送'),
            add('information.unconfirmed', FOREIGN_AID_INFO, '中繼線路收到的訊息'),
            add('environment.notes', '直升機已飛往中繼站，燃料減少', '建立對外線路'),
          ],
        }),
      },
    },

    // ── 第 3 回合：代價 ─────────────────────────────────────
    {
      opening: '第二天黃昏。基地裡的人開始感受到消息的重量：外面的世界在動，而這裡的決定，會影響許多人的去留與安危。',
      options: [
        { text: '保存實力，嚴格管制基地的用電與通訊', style: 'steady' },
        { text: '核對各方消息，分辨哪些是真的', style: 'intel' },
        { text: '公開宣告政府仍在運作，邀請外界查證', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你下令縮小基地的活動範圍：夜間熄燈、減少通訊，只保留必要的崗位。有人鬆了一口氣，也有人覺得這太消極。你沒有急著辯解，只要求每個決定都附上理由並公開記錄。深夜巡視時，你發現走廊盡頭多了幾個低聲交談的人，你沒有走過去，只是點了點頭。',
          p: 'good', why: '收斂消耗，爭取更長的時間', stat: [1, 0, 0], sum: '縮小活動範圍，管制用電',
          m: [ms('m_base', 'lost', '補給線中斷，存量見底，基地補給失去穩定'), ms('m_base', 'done', '補給與通訊進入可持續的狀態'), ms('m_base', 'partial', '基地補給與通訊逐步穩定')],
          w: [
            ...go('回到基地主體', 'loc_base'),
            add('supplies.rations', 3, '倉庫補充口糧'),
            add('supplies.backup_power', 1, '倉庫補充備用電源'),
            add('supplies.phone_battery', 15, '基地有電，補充通訊設備電力'),
            rem('supplies.rations', 2, '一天的消耗'),
            add('environment.notes', '夜間熄燈，通訊減少', '管制用電'),
          ],
        }),
        intel: res({
          n: '你把幾條來源不同的消息攤在桌上，一條一條追問：誰說的、怎麼知道的、有沒有第二個來源。幕僚被問得有點喘，但最後留下的三條資訊，比原本的二十條更有用。其中一條提到，有幾個單位正在等待明確的指令。你把留下的三條資訊寫在白板上，讓所有人都看得見，也讓每個人都能提出反對。',
          p: 'neutral', why: '去蕪存菁，但花了不少時間', stat: [0, 2, -1], sum: '核對消息，留下可信的三條',
          m: [ms('m_command', 'done', '掌握了待命單位的位置並下達指令')],
          w: [
            ...go('回到基地主體', 'loc_base'),
            add('supplies.phone_battery', 15, '基地有電，補充通訊設備電力'),
            rem('supplies.rations', 2, '一天的消耗'),
            add('environment.notes', '三條可信的資訊被留了下來', '核對消息'),
          ],
        }),
        bold: res({
          n: '你在線路上做了一段簡短的對外宣告，說明政府仍在運作，並邀請外界派人查證。語氣平靜，沒有指責任何人。訊號持續了不到十分鐘，卻足以讓某些人知道你們還在。這是一個無法收回的決定。事後有人說你冒了很大的風險，也有人說你給了大家一個繼續等下去的理由。',
          p: 'excellent', why: '公開表態，讓外界知道你們還在', stat: [0, 0, 2], sum: '公開宣告政府仍在運作',
          m: [ms('m_command', 'lost', '當場表態後，內部對指揮出現裂痕'), ms('m_voice', 'done', '對外宣告政府仍在運作並邀請查證')],
          w: [
            ...go('回到基地主體', 'loc_base'),
            add('supplies.phone_battery', 15, '基地有電，補充通訊設備電力'),
            rem('supplies.phone_battery', 8, '對外宣告耗用電力'),
            rem('supplies.rations', 2, '一天的消耗'),
            add('environment.notes', '宣告已發出，外界或許已經聽見', '公開宣告'),
          ],
        }),
      },
    },

    // ── 第 4 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '第三天。最初的恐懼與興奮都退去了，剩下的是更細碎、更磨人的問題：誰負責什麼、誰聽誰的、誰在等你下一個命令。',
      options: [
        { text: '重新分配職責，讓每個人知道自己的位置', style: 'steady' },
        { text: '確認外援的條件與每個環節是否可靠', style: 'intel' },
        { text: '直接向有意願的國家提出具體請求', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你重新排了基地的職責表，把每個人的位置、聽誰的命令、遇到問題找誰，全寫在牆上。有人鬆了口氣，也有人看著自己被調動的名字皺眉。秩序回來了一些，但沒有人說這是最好的安排。你把自己的名字也寫進輪值表，讓所有人知道，沒有人是例外。',
          p: 'neutral', why: '建立秩序，卻有人心生不滿', stat: [1, 0, 0], sum: '重排職責，重建秩序',
          m: [ms('m_base', 'lost', '補給線中斷，存量見底，基地補給失去穩定'), ms('m_base', 'done', '補給與通訊有了明確的負責人'), ms('m_base', 'partial', '基地補給與通訊逐步穩定')],
          w: [
            add('supplies.fuel', 2, '倉庫補充燃料'),
            rem('supplies.rations', 2, '一天的消耗'),
            set('environment.order', 'normal', '職責明確後秩序較穩'),
            add('environment.notes', '職責表貼在走廊牆上', '重排職責'),
          ],
        }),
        intel: res({
          n: '你把外援可能提出的條件逐項列出：他們要什麼證明、你能給什麼、哪些是不能碰的底線。幕僚花了半天推演每個環節，也標出幾個可能被利用的缺口。這份清單讓你更清楚，也讓你更睡不著。你把最後一頁翻過去時，窗外已經天亮，咖啡早就涼了，你卻沒有喝一口。',
          p: 'excellent', why: '把條件拆開看，缺口一目了然', stat: [0, 2, 0], sum: '逐項推演外援條件',
          m: [ms('m_lifeline', 'partial', '外援通道的條件已有初步輪廓'), ms('m_command', 'done', '與待命單位確認了聯繫方式')],
          w: [
            add('information.confirmed', FOREIGN_AID_INFO, '透過第二管道得到證實'),
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '反覆聯繫耗用電力'),
            add('environment.notes', '外援條件已逐項列出，缺口已標註', '推演條件'),
          ],
        }),
        bold: res({
          n: '你直接派人向有意願的國家提出具體請求：藥品、通訊設備與一條安全的聯絡管道。請求寫得很具體，也很大膽。對方沒有立刻回應，沉默的幾個小時，比任何回答都更折磨人。你在等待回覆的時間裡反覆想著：如果對方拒絕，你還有沒有另一條路可走。',
          p: 'poor', risk: 'minor', why: '請求太大，換來漫長的沉默', stat: [-1, 0, 1], sum: '直接提出具體請求',
          m: [ms('m_command', 'lost', '當場表態後，內部對指揮出現裂痕'), ms('m_voice', 'done', '政府的對外窗口已被認可'), ms('m_lifeline', 'partial', '向外國提出了具體請求')],
          w: [
            add('information.confirmed', FOREIGN_AID_INFO, '請求獲得初步回應'),
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 8, '長時間保持線路'),
            set('environment.order', 'tense', '等待回覆讓氣氛緊繃'),
            add('environment.notes', '請求已送出，對方遲遲沒有回覆', '提出具體請求'),
          ],
        }),
      },
    },

    // ── 第 5 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '第四天。補給與通訊都開始吃緊，內部有人對下一步表達了疑慮，你得在不同意見之間，找出可以走下去的路。',
      options: [
        { text: '把有疑慮的人請來，逐項說明決策理由', style: 'steady' },
        { text: '追查通訊與補給的缺口，找替代方案', style: 'intel' },
        { text: '果斷下令，不再延遲外援通道的建立', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把有疑慮的人逐一請來，一項項說明每個決策的理由與代價，包括你自己也不確定的部分。有人被說服，有人沒有，但至少沒有人帶著沒說出口的話離開。這花了你一整天，外援通道的時間窗也悄悄縮小了。會議結束後，你一個人在走廊走了很久，直到燈光變暗，才回到自己的位置。',
          p: 'poor', why: '凝聚了人心，卻耗掉一整天', stat: [1, 0, -1], sum: '逐一說明，凝聚共識',
          m: [ms('m_base', 'lost', '補給線中斷，存量見底，基地補給失去穩定'), ms('m_base', 'done', '補給與通訊問題都有了負責人'), ms('m_voice', 'partial', '對外發出初步聲明')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            set('environment.order', 'normal', '疑慮被說開'),
            add('environment.notes', '你花了一整天逐一說明決策理由', '說明決策'),
          ],
        }),
        intel: res({
          n: '你追查通訊與補給的缺口，把每條路線的耗損、替代方案與風險標在同一張表上。有幾條路線意外地可行，也有幾條原本被視為關鍵的，其實早就失效。你把這張表交給所有人，讓大家一起決定優先順序。你在那張表的角落寫了一行小字：沒有誰是萬能的，只有誰知道自己缺什麼。',
          p: 'good', why: '看清缺口，讓大家一起排序', stat: [0, 2, 0], sum: '追查缺口，列出替代方案',
          m: [ms('m_voice', 'done', '確認了對外說明的可靠管道')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '反覆查驗耗用電力'),
            set('family.contact', 'contacted', '透過秘密管道得知家人平安，但位置不明'),
            add('environment.notes', '一張缺口表交給所有人討論', '追查缺口'),
          ],
        }),
        bold: res({
          n: '你不再等待共識，直接下令啟動外援通道的準備作業，並要求每個單位在二十四小時內回報進度。命令很清楚，也引起了不少暗地的不滿。有人服從，有人沉默，你分不清這兩者哪個更讓人不安。夜裡你一個人坐在桌前，把命令又讀了一遍，想確認它真的是自己想說的話。',
          p: 'good', risk: 'minor', why: '果斷下令，換來速度與不滿', stat: [-1, 0, 2], sum: '果斷下令啟動通道準備',
          m: [ms('m_command', 'lost', '當場表態後，內部對指揮出現裂痕'), ms('m_voice', 'done', '以明確命令確立了對外窗口'), ms('m_lifeline', 'partial', '外援通道的準備作業已啟動')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 8, '連續發送命令'),
            set('environment.order', 'tense', '命令引起暗地不滿'),
            add('environment.notes', '每個單位限期回報進度', '下令準備'),
          ],
        }),
      },
    },

    // ── 第 6 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '第五天。外援通道近在眼前，但所有人都知道，無論成敗，這一步都會改變基地的處境。',
      options: [
        { text: '保守推進，先確保基地內的安全與士氣', style: 'steady' },
        { text: '再查證通道的每個環節，確認不會被利用', style: 'intel' },
        { text: '親自前往外援接觸點，當面談定', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你選擇先穩住基地：加強輪值、安排輪休、把剩餘的藥品與口糧公開分配。這些事沒有一件看起來像突破，但你知道，一支疲憊的隊伍撐不了更久。外援通道仍在前方，你只是暫時不急著伸手。巡視時，一位年輕的士兵向你敬禮，那一瞬間，你覺得有些話不需要說出口。',
          p: 'good', why: '先穩住基地，再談下一步', stat: [2, 0, 0], sum: '先穩住基地士氣與補給',
          m: [ms('m_base', 'done', '補給與輪值制度已經穩定')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            add('supplies.medicine', 1, '公開分配前補充藥品'),
            set('environment.order', 'normal', '輪休讓士氣回穩'),
            add('environment.notes', '藥品與口糧公開分配，輪休安排完成', '穩住基地'),
          ],
        }),
        intel: res({
          n: '你要求對方提供更多細節，也把每一項條件交給不同幕僚獨立審查。審查結果有一半相同、一半相反，你把相反的那一半單獨拿出來，想了很久。這一次，你不想只靠直覺。審查報告上的幾個問號，你沒有急著擦掉，而是一個一個圈起來，留給明天。',
          p: 'neutral', why: '多一層審查，也多一天等待', stat: [1, 1, -1], sum: '分頭審查每一項條件',
          m: [ms('m_lifeline', 'partial', '審查後確認了通道的可行環節'), ms('m_voice', 'done', '對外說明的可靠性已獲確認')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '反覆審查耗用電力'),
            add('environment.notes', '每項條件都由兩位幕僚獨立審查', '再次查證'),
          ],
        }),
        bold: res({
          n: '你決定親自前往外援接觸點，當面談定細節。這一趟要冒的風險很大：離開基地、暴露行蹤、把指揮權暫時交出去。你在出發前留下一份書面指示，沒有說多餘的話，只交代回來之前基地如何運作。登機前你看了一眼基地，那些亮著燈的窗戶，每一扇後面都有一個等你回來的人。',
          p: 'excellent', why: '親自出面，把談判桌搬到現場', stat: [0, 0, 2], sum: '親赴外援接觸點',
          m: [ms('m_lifeline', 'done', '當面談定外援通道'), ms('m_lifeline', 'partial', '當面談定外援通道的第一階段')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 8, '出發前最後一次聯絡'),
            set('transportation.mode', 'helicopter', '改用直升機'),
            ...go('前往外援接觸點', 'loc_relay', 'loc_contact'),
            rem('supplies.fuel', 1, '直升機往返耗用燃料'),
            add('environment.notes', '你留下書面指示，前往外援接觸點', '親赴接觸點'),
          ],
        }),
      },
    },

    // ── 第 7 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '第七天。所有選擇都收束到這一個決定：你要用什麼方式，把外援通道真正接起來。',
      options: [
        { text: '維持原有節奏，穩穩把通道接上', style: 'steady' },
        { text: '再次逐項確認雙方條件，逐項簽署', style: 'intel' },
        { text: '賭上這一次，由你親自負責最後的連結', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你維持原本的節奏，一個環節一個環節地把通道接上。每一步都不快，但每一步都有人簽字、有人負責。當最後一條線路亮起時，沒有歡呼，只有一陣長長的呼氣。深夜你一個人把紀錄再翻一遍，確認每一行都有人簽名，才放心把燈關掉。',
          p: 'good', why: '一步一步，把通道接穩', stat: [1, 0, 1], sum: '穩穩把外援通道接上',
          m: [ms('m_lifeline', 'done', '外援通道已逐步建立完成')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '連線測試耗用電力'),
            add('environment.notes', '最後一條線路亮起，沒有人歡呼', '接上通道'),
          ],
        }),
        intel: res({
          n: '你再次與對方逐項確認條件，在每一頁文件上都標註雙方各自的責任與限制。對方的代表停了一下，說這是他看過最清楚的一份。你沒有笑，只是把筆放下。離開會議室時，你的手還在微微發麻，這是你這幾天第一次感到輕鬆。',
          p: 'good', why: '條件寫得清楚，雙方都有底', stat: [1, 1, 0], sum: '逐項確認，簽署條件',
          m: [ms('m_lifeline', 'done', '雙方確認條件並建立外援通道')],
          w: [
            rem('supplies.rations', 2, '一天的消耗'),
            rem('supplies.phone_battery', 5, '連線測試耗用電力'),
            add('environment.notes', '每一頁文件都標註了雙方的責任', '簽署條件'),
          ],
        }),
        bold: res({
          n: '你把所有籌碼都押在這一刻：由你親自負責最後的連結，並在線路上直接承諾後續的合作。這個決定沒有退路，也沒有人能替你分擔。通道亮起的那一刻，你不確定自己是鬆了一口氣，還是剛剛簽下了更重的責任。你把文件闔上，抬頭看著窗外的天空，那裡什麼也沒有，卻像有很多雙眼睛正在看你。',
          p: 'excellent', why: '親自負責，賭上這最後一步', stat: [-1, 0, 2], sum: '親自負責最後的連結',
          m: [ms('m_lifeline', 'done', '親自完成最後的連結，外援通道建立')],
          w: [
            set('transportation.mode', 'helicopter', '改用直升機'),
            ...go('前往外援接觸點', 'loc_relay', 'loc_contact'),
            rem('supplies.fuel', 1, '直升機往返耗用燃料'),
            rem('supplies.rations', 2, '一天的消耗'),
            add('environment.notes', '通道亮起，你簽下了更重的責任', '完成最後連結'),
          ],
        }),
      },
    },
  ],

  events: {
    ev_jamming: {
      intro: '基地對外通訊系統遭到干擾，只剩一條不穩定的衛星線路可用，時斷時續。',
      risk: { steady: 'none', intel: 'none', bold: 'minor' },
      outcome: {
        steady: '你下令暫停非必要的通訊，把唯一的線路留給最重要的訊息。',
        intel: '你要求技術人員記錄干擾的規律，找出較穩定的時段。',
        bold: '你立刻用這條線路發出消息，內容卻在中途被截斷。',
      },
    },
    ev_ceasefire: {
      intro: '幾位將領向你表達異議：有人認為應該接受中共提出的停火條件，也有人堅決反對，雙方都在等你表態。',
      risk: { steady: 'minor', intel: 'none', bold: 'major' },
      outcome: {
        steady: '你先把決定延後，請各方把理由寫成書面。',
        intel: '你分別私下聽取每一位將領的看法與顧慮。',
        bold: '你當場表態，由自己作出決定，會議室一片沉默。',
      },
    },
    ev_supply_cut: {
      intro: '通往基地的山區補給線被切斷，運補車隊遲遲沒有消息，倉庫的存量成了所有人關心的焦點。',
      risk: { steady: 'major', intel: 'minor', bold: 'none' },
      outcome: {
        steady: '你下令等待運補恢復，倉庫的數字一天比一天難看。',
        intel: '你要求後勤核算每一項物資能撐多久，再決定怎麼分配。',
        bold: '你立刻改以其他路線取得補給，倉庫暫時守住了底線。',
      },
    },
    ev_foreign_call: {
      intro: '一個外國政府透過秘密管道聯繫，表示若能證明政府仍有效運作，將考慮提供協助。',
      risk: { steady: 'none', intel: 'none', bold: 'minor' },
      outcome: {
        steady: '你請對方給你時間，先確認內部能提供什麼證明。',
        intel: '你要求對方先說明協助的範圍與條件，再談下一步。',
        bold: '你當場答應了對方的要求，沒有先確認內部的準備。',
      },
    },
    ev_recon: {
      intro: '一架不明飛行器在基地上空緩慢盤旋，值班人員回報：基地的位置可能已經暴露。',
      risk: { steady: 'minor', intel: 'none', bold: 'fatal' },
      outcome: {
        steady: '你下令全基地保持靜默，所有人原地等待它離開。',
        intel: '你要求持續記錄它的動向，確認它是否真的發現了你們。',
        bold: '你選擇在此時對外發出訊號，基地的位置也隨之確定。',
      },
    },
  },

  comments: {
    clear: [
      { personal_comment: '孤島有了出口，而你沒喊過一句口號。', highlight_action: '在最後一刻把外援通道真正接上' },
      { personal_comment: '你把一座基地的沉默，變成了一條線路。', highlight_action: '逐項確認條件，讓雙方都有底' },
      { personal_comment: '不是每個決定都對，但每個都有人負責。', highlight_action: '親自負責最後的連結' },
      { personal_comment: '最難的是在眾聲之中，仍然能聽見自己。', highlight_action: '在內部分歧與外部壓力間穩住了節奏' },
    ],
    fatal: [
      { personal_comment: '一個決定，帶走了所有後續的選擇。', highlight_action: '在最不該曝光的時刻對外發出訊號' },
      { personal_comment: '你不缺勇氣，缺的是再多一點安靜。', highlight_action: '選擇在危險逼近時採取最大膽的行動' },
      { personal_comment: '歷史不問你有沒有道理，只看結果。', highlight_action: '把基地的位置暴露在最壞的時機' },
    ],
    score: [
      { personal_comment: '每個決定都有道理，合起來卻沒有答案。', highlight_action: '連續幾次取捨，讓局面逐漸失去支撐' },
      { personal_comment: '基地還在，但能撐的時間已經不多了。', highlight_action: '在內部分歧與補給短缺中失去了餘裕' },
      { personal_comment: '你撐著一座基地，卻撐不住整個局勢。', highlight_action: '決策與時機一再錯開' },
    ],
    normal: [
      { personal_comment: '通道還沒接上，但基地還沒有倒下。', highlight_action: '在有限的資源下維持了政府的運作' },
      { personal_comment: '一週過去，你保住了人，也保住了選擇。', highlight_action: '在分歧中維持了基地的團結' },
      { personal_comment: '你沒有給出答案，只是讓問題沒有吞掉所有人。', highlight_action: '把每個決定都留有餘地' },
      { personal_comment: '外援遲遲未到，但你讓大家等得下去。', highlight_action: '在漫長的等待中穩住了士氣' },
    ],
  },
};
