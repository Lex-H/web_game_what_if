/**
 * 可玩劇本：一般上班族（office）。
 * 主線固定 7 個節點，選項只改變當回合結果（開發文檔 11.2）。
 * 機車要先 set transportation.mode scooter 才能從地下停車場騎出去；捷運要在捷運站先 set mode mrt。
 */

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

const U1 = '捷運與公車可能已停駛';
const U2 = '主要道路即將實施管制';

export default {
  characterId: 'office',
  keywords: {
    intel: ['打聽', '查看', '問', '確認', '查', '觀察', '聯絡', '打電話', '搜尋', '比對', '公告', '情報', '探', '廣播', '地圖', '詢問'],
    bold: ['衝', '直接', '馬上', '立刻', '闖', '硬', '搶', '飆', '強行', '冒險', '突破', '跑', '不等', '捷徑', '騎車', '全速'],
  },

  nodes: [
    // ── 第 1 回合：衝擊 ─────────────────────────────────────
    {
      opening: '上午九點，你剛進公司。群組跳出緊急通知，電視牆上的新聞畫面不停切換，同事擠在窗邊看著樓下，大樓管理員說還沒有收到指示。',
      options: [
        { text: '先留在公司，等大樓管理員的指示', style: 'steady' },
        { text: '查官方公告與交通資訊', style: 'intel' },
        { text: '馬上下樓牽機車離開', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你和同事待在辦公室，等管理員的廣播。電視牆的新聞不停重播同一段畫面，有人開始收拾包包，有人還在加班。你先把飲水和行動電源備好，順便傳訊息給家人，過了一會兒，對方回了已讀。你一邊假裝專心工作，一邊把視線一次次飄向窗外，那裡的車流比平常更慢。',
          p: 'neutral', why: '按兵不動，掌握基本資訊', stat: [1, 0, 0], sum: '留在公司等指示並備好物資',
          m: [ms('m_transport', 'lost', '捷運與公車停駛，等候的交通方案落空'), ms('m_contact', 'partial', '傳訊息給家人，對方已讀')],
          w: [
            add('supplies.water', 2, '在公司茶水間取水'),
            add('supplies.power_bank', 1, '從抽屜拿出行動電源'),
            add('supplies.phone_battery', 10, '辦公室有電，順便充手機'),
            set('family.contact', 'contacted', '家人已讀訊息'),
            add('information.unconfirmed', U1, '同事之間流傳的說法'),
            add('environment.notes', '管理員仍沒有指示，同事陸續聚集', '等待指示'),
          ],
        }),
        intel: res({
          n: '你同時打開政府公告、交通資訊與幾個可信的群組，逐項比對。捷運官方帳號只貼了「暫停服務」四個字，沒有說原因；公告也沒說撤離地點。但你已經知道，今天不能依賴大眾運輸。你把幾個截圖存進相簿，因為你很清楚，等一下訊號可能就沒了。',
          p: 'good', why: '比對來源，先確定了交通風險', stat: [0, 2, 0], sum: '比對公告與交通資訊',
          m: [ms('m_intel', 'done', '比對多個來源，確認了可信的資訊')],
          w: [
            add('supplies.water', 1, '拿一瓶水'),
            add('supplies.power_bank', 1, '拿一個行動電源'),
            add('supplies.phone_battery', 10, '辦公室有電，邊查邊充'),
            set('family.contact', 'contacted', '家人回覆訊息'),
            add('information.unconfirmed', U1, '官方帳號只寫暫停服務'),
            add('environment.notes', '官方公告只有暫停服務四個字', '查看公告'),
          ],
        }),
        bold: res({
          n: '你搶在電梯塞滿之前衝進地下停車場，機車還在原位，油量約半箱。你把安全帽扣好，才發現手機有十幾則未讀。你什麼資訊都還沒有，但至少你有一個可以立刻離開的選項。你下樓時順手把門禁卡留在桌上，彷彿在向這間辦公室暫時告別。',
          p: 'excellent', why: '搶先一步掌握交通工具', stat: [-1, 0, 2], sum: '搶先到停車場取車',
          m: [ms('m_intel', 'partial', '看到未讀訊息裡的零星消息'), ms('m_transport', 'partial', '機車已就位，隨時可以離開')],
          w: [
            add('supplies.water', 1, '出門前拿一瓶水'),
            add('supplies.power_bank', 1, '出門前拿行動電源'),
            add('information.unconfirmed', U1, '未讀訊息裡的說法'),
            ...go('下樓前往停車場', 'loc_office', 'loc_office_garage'),
            set('transportation.mode', 'scooter', '坐上機車準備出發'),
            add('environment.notes', '機車油量約半箱，隨時可以走', '取車'),
          ],
        }),
      },
    },

    // ── 第 2 回合：本能反應 ──────────────────────────────────
    {
      opening: '上午的城市像被按了暫停：電話忙線、電梯停擺，群組訊息一則接一則，大家交換著彼此都不確定的消息。街上的車流越來越亂。',
      options: [
        { text: '和同事結伴步行，沿大馬路旁出發', style: 'steady' },
        { text: '走到捷運站，親眼確認營運狀況', style: 'intel' },
        { text: '騎機車衝出停車場，直接上路', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你和三位同事組成小隊，沿大馬路旁的人行道往住宅區方向走。大家腳步一致，不斷互相提醒，路上遇到的人也多半友善。你們走得不快，卻沒有人落單，也讓你有時間重新想一遍路線。路上遇到的人有的跑、有的走，但你們這一小隊始終保持同樣的步調。',
          p: 'good', why: '結伴同行，沒人落單', stat: [1, 0, 0], sum: '與同事組隊步行出發',
          m: [ms('m_transport', 'lost', '捷運與公車停駛，等候的交通方案落空'), ms('m_intel', 'partial', '沿路交換消息'), ms('m_transport', 'partial', '與同事組成步行小隊，有了固定路線')],
          w: [
            ...go('離開辦公大樓走到街上', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '沿路查看消息'),
            add('information.unconfirmed', U2, '路人說的消息'),
            add('environment.notes', '你和三位同事結伴，一路互相提醒', '結伴步行'),
          ],
        }),
        intel: res({
          n: '你走到捷運站，站務員拉下閘門，月台只剩應急燈。他說「系統在等上級指令」，但沒人知道指令何時來。你打給家人，母親說她們在家，附近停電，正要往樓下鄰居家集合。你回頭看看手機，電量又少了一格。你把站務員的原話記在手機裡，也標注了時間，這可能是接下來最有價值的一條資訊。',
          p: 'excellent', why: '親自確認，省下無謂的等待', stat: [0, 2, 0], sum: '到捷運站確認營運狀況',
          m: [ms('m_intel', 'done', '親自確認了捷運的營運狀況')],
          w: [
            ...go('走到捷運站', 'loc_office', 'loc_mrt'),
            set('transportation.mode', 'mrt', '在捷運站確認可搭乘的路線'),
            rem('supplies.phone_battery', 10, '打電話與查詢耗電'),
            set('family.contact', 'contacted', '與母親通上電話'),
            add('information.confirmed', U1, '親眼看到閘門拉下'),
            add('information.unconfirmed', U2, '站務員提到的說法'),
            add('environment.notes', '捷運站閘門拉下，只剩應急燈', '到捷運站'),
          ],
        }),
        bold: res({
          n: '你騎上機車，沿著停車場坡道衝向街上。街口塞滿了車，你硬是從縫隙裡鑽過去。這一刻你很感謝這台機車，但也發現油表指針比想像的低，而且你一路沒有再看手機一眼。後照鏡裡，大樓越來越小，你卻沒有把握自己是在逃離，還是在趕路。',
          p: 'poor', risk: 'minor', why: '跑得快，卻幾乎沒有資訊', stat: [-1, -1, 1], sum: '騎車衝出停車場上路',
          m: [ms('m_contact', 'lost', '停電讓訊號全斷，與家人失去聯繫'), ms('m_transport', 'done', '機車順利騎上街道，取得可用交通方式'), ms('m_contact', 'partial', '停紅燈時傳了訊息給家人')],
          w: [
            ...go('回到停車場取車', 'loc_office', 'loc_office_garage'),
            set('transportation.mode', 'scooter', '騎上機車'),
            ...go('騎車駛出停車場', 'loc_street_o'),
            rem('transportation.fuel', 10, '一路騎車耗油'),
            add('information.unconfirmed', U2, '路上聽到的說法'),
            add('environment.notes', '街口塞車，你從縫隙中鑽出去', '騎車上路'),
          ],
        }),
      },
    },

    // ── 第 3 回合：代價 ─────────────────────────────────────
    {
      opening: '中午前後，街上的聲音變得不一樣。有人在跑，有人在喊，更多的人只是呆站著看手機。',
      options: [
        { text: '留在原地等同伴會合，再決定路線', style: 'steady' },
        { text: '比對消息，找出可信的撤離路線', style: 'intel' },
        { text: '改走沒人走的替代道路', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你在原地等同伴，一等就是四十分鐘。有人說再等等，有人說該走了，隊伍開始出現爭執。最後大家還是出發了，卻錯過了人最少的時間窗。你開始明白：穩，不等於不動。有人嘆氣、有人看錶，你突然覺得，自己好像在替所有人做一個沒人想承擔的決定。',
          p: 'poor', why: '等太久，錯過了人少的時機', stat: [-1, 0, -1], sum: '原地等同伴，錯過時機',
          m: [ms('m_transport', 'lost', '捷運與公車停駛，等候的交通方案落空'), ms('m_intel', 'partial', '聽了幾位同事的消息'), ms('m_contact', 'partial', '等待時又聯絡了家人')],
          w: [
            ...go('回到街口等同伴', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '等待時一直看手機'),
            add('environment.notes', '同伴意見分歧，隊伍遲遲沒出發', '等待同伴'),
          ],
        }),
        intel: res({
          n: '你把三個來源的消息排在一起：官方說某幹道將實施管制，群組說靠河岸的路還能通，同事則說機車可以走高架下的側道。你在地圖上標出一條避開管制點的路線，也和家人約好在她住處巷口會合。你把截圖傳給家人，附上一句「照這條路走，不要走大馬路」，然後深吸了一口氣。',
          p: 'good', why: '比對消息，標出可行路線', stat: [0, 2, 0], sum: '比對消息，約好會合點',
          m: [ms('m_contact', 'done', '與家人約定會合點與時間'), ms('m_intel', 'done', '比對出可信的撤離路線')],
          w: [
            ...go('走到路口查看地圖', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '比對消息耗電'),
            set('family.contact', 'confirmed', '與家人確認會合時間與地點'),
            set('family.meeting_point', 'loc_home_office', '約定在家人住處會合'),
            add('information.confirmed', U2, '官方與群組說法互相吻合'),
            add('environment.notes', '你在地圖上標出一條避開管制點的路', '比對路線'),
          ],
        }),
        bold: res({
          n: '你專挑沒人走的巷弄，用熟悉的捷徑繞過塞住的路口。路程多了一小段，卻順暢得多。只是這些巷子很安靜，安靜到你不確定是安全，還是被所有人遺忘。你在一處空蕩蕩的公園旁停下喘氣，才發現自己的手心全是汗。',
          p: 'good', why: '熟悉捷徑，繞過塞車', stat: [0, 0, 1], sum: '走替代道路繞開塞車',
          m: [ms('m_contact', 'lost', '停電讓訊號全斷，與家人失去聯繫'), ms('m_transport', 'partial', '憑熟悉的路線找到可用的行進方式')],
          w: [
            ...go('走進巷弄', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '邊走邊看地圖'),
            set('environment.order', 'chaotic', '主要道路開始失序'),
            add('environment.notes', '巷子很安靜，沿路幾乎沒有人', '走替代道路'),
          ],
        }),
      },
    },

    // ── 第 4 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '下午的光線斜斜地照在街上。前面的選擇開始變成代價：有人沒水了，有人沒電了，有人開始想回頭。',
      options: [
        { text: '把物資分給同行的人，再一起往前', style: 'steady' },
        { text: '查看沿路狀況，確認有沒有更好的路', style: 'intel' },
        { text: '騎上高架下的側道，加速超車', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把水和行動電源分給同行的同事，也把路線再說明一次。有人道謝，有人沉默，但大家重新站穩了腳步。你發現，團隊的信心有時候比物資更重要。行動電源只剩半格電，你卻覺得，把它交出去的那一刻，自己反而輕鬆了一些。',
          p: 'good', why: '分享物資，穩住團隊', stat: [2, 0, -1], sum: '分物資給同行的人',
          m: [ms('m_transport', 'lost', '捷運與公車停駛，等候的交通方案落空'), ms('m_evacuate', 'partial', '團隊穩住後，離會合點又近一段'), ms('m_transport', 'done', '團隊確定了可持續的前進方式')],
          w: [
            ...go('停在街口分物資', 'loc_office', 'loc_street_o'),
            rem('supplies.water', 1, '分一瓶水給同事'),
            rem('supplies.power_bank', 1, '借行動電源給同事'),
            set('family.contact', 'confirmed', '再次確認家人位置'),
            add('environment.notes', '你把水和行動電源分給了同行的同事', '分享物資'),
          ],
        }),
        intel: res({
          n: '你在路邊停下，一邊滑手機一邊看路況：高架橋下方有人集結，往北的方向似乎被封。你把能確認的與不能確認的分開寫在備忘錄上。這很有用，但也讓你的時間又少了一些。你把今天走過的路線與時間寫成條列，想著萬一手機沒電，至少腦袋裡還有一份地圖。',
          p: 'neutral', why: '資訊更清楚，但耽誤了時間', stat: [0, 2, -1], sum: '查路況並整理備忘錄',
          m: [ms('m_transport', 'done', '確認了可行的路徑'), ms('m_evacuate', 'partial', '確認路徑後，離會合點更近')],
          w: [
            ...go('停在路邊查看', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '查路況耗電'),
            add('information.unconfirmed', '高架橋下有人集結', '路邊看到的情形'),
            add('environment.notes', '往北方向似乎被封，備忘錄已更新', '整理資訊'),
          ],
        }),
        bold: res({
          n: '你把機車開上高架下的側道，加速超過一大排停滯的汽車。風打在臉上，像在提醒你還活著。你很快就看到了熟悉的路標，距離住處又近了一截。油表同時往下掉了一格。你在紅燈前停了一下，回頭望，同事的身影已經縮成很小很小的一點。',
          p: 'excellent', why: '騎車超車，大幅拉近距離', stat: [0, 0, 2], sum: '騎側道加速超車',
          m: [ms('m_contact', 'lost', '停電讓訊號全斷，與家人失去聯繫'), ms('m_transport', 'done', '機車讓你大幅拉近距離')],
          w: [
            set('transportation.mode', 'scooter', '改騎機車'),
            ...go('騎到街道上', 'loc_office', 'loc_street_o'),
            rem('transportation.fuel', 10, '騎車耗油'),
            add('environment.notes', '你騎上側道，超過一排停滯的汽車', '騎側道'),
          ],
        }),
      },
    },

    // ── 第 5 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '傍晚的天色漸暗，路燈有的亮、有的不亮。手機電量與體力一起見底，你得決定怎麼把最後的力氣用在哪裡。',
      options: [
        { text: '找個安全的地方歇腳，等天色更暗再走', style: 'steady' },
        { text: '用行動電源補電，與家人確認最後會合', style: 'intel' },
        { text: '趁天黑前直接衝到會合點', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你找了一間已打烊的店面騎樓休息，把背包抱在胸前。街上的人越來越少，也越來越安靜。你在黑暗中等了一個小時，體力恢復了些，心裡卻一直在算：這一小時，會不會正是別人走過去的一小時？你拿出最後一塊餅乾，咬了一口，才發現自己今天還沒有好好吃過任何東西。',
          p: 'neutral', why: '恢復體力，卻損失一小時', stat: [1, 0, -1], sum: '歇腳等天黑',
          m: [ms('m_contact', 'lost', '盤查耽誤，與家人暫時失去聯繫'), ms('m_evacuate', 'partial', '休息後確認了最後一段路'), ms('m_contact', 'done', '休息時與家人確認位置')],
          w: [
            ...go('找地方歇腳', 'loc_office', 'loc_street_o'),
            rem('supplies.water', 1, '補水'),
            rem('supplies.phone_battery', 5, '偶爾看手機'),
            add('environment.notes', '你在打烊店面的騎樓歇了一小時', '歇腳'),
          ],
        }),
        intel: res({
          n: '你拿出行動電源，把手機補到足以撐完最後一段路。接通後，家人說已經在樓下等你，鄰居也一起；他們還幫你查了一條沒有關卡的巷子。你把路線記在腦裡，才把手機收進口袋。你把手機重新收進外套內袋，像是收好一張只能用一次的車票。',
          p: 'excellent', why: '補電、問路、敲定會合', stat: [1, 2, 0], sum: '補電後與家人敲定會合',
          m: [ms('m_contact', 'done', '與家人敲定最後會合方式')],
          w: [
            rem('supplies.power_bank', 1, '用行動電源補手機'),
            add('supplies.phone_battery', 15, '行動電源補電'),
            ...go('走到路口講電話', 'loc_office', 'loc_street_o'),
            set('family.contact', 'confirmed', '與家人敲定會合'),
            add('environment.notes', '家人在樓下等你，鄰居也一起', '再聯絡家人'),
          ],
        }),
        bold: res({
          n: '你猛催油門，沿著主要幹道直接往會合點衝。起初很順，直到看見前方一排閃著燈的車輛，你才發現自己闖進了不熟悉的區域。你急忙煞車、折返，油表上剩下的刻度讓你心裡一沉。你的雙手握著把手微微發麻，從來沒有哪一段路，讓你這麼想念自己的沙發。',
          p: 'poor', risk: 'minor', why: '速度太快，闖進陌生區域', stat: [-1, -1, 1], sum: '催油門直衝，闖入陌生區',
          m: [ms('m_contact', 'lost', '停電讓訊號全斷，與家人失去聯繫'), ms('m_transport', 'done', '機車讓你衝到接近會合點的地方'), ms('m_evacuate', 'partial', '已接近會合點')],
          w: [
            set('transportation.mode', 'scooter', '騎機車衝刺'),
            ...go('騎到街道上', 'loc_office', 'loc_street_o'),
            rem('transportation.fuel', 10, '全速騎車耗油'),
            add('environment.notes', '你闖進一個陌生的區域，連忙折返', '催油門直衝'),
          ],
        }),
      },
    },

    // ── 第 6 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '夜色深了。再往前一段，就是你和家人約好的巷口。你知道，最危險的路段就在這裡。',
      options: [
        { text: '關掉車燈與手機，摸黑沿牆邊前進', style: 'steady' },
        { text: '先觀察巷口的動靜，再決定要不要靠近', style: 'intel' },
        { text: '加速衝過管制路口，直奔家人住處', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把車燈和手機都關掉，貼著牆邊一步一步往前。黑暗讓所有聲音都變得很大：自己的呼吸、遠處的腳步、風吹過鐵捲門的聲音。你不知道是不是有人在看，只知道必須走完。你想起小時候和家人玩捉迷藏，原來所有學過的技巧，到了今天才真正派上用場。',
          p: 'good', why: '摸黑貼牆，悄悄通過', stat: [2, 0, 0], sum: '摸黑貼牆前進',
          m: [ms('m_contact', 'lost', '盤查耽誤，與家人暫時失去聯繫'), ms('m_evacuate', 'done', '悄悄通過危險路段，抵達會合點附近'), ms('m_contact', 'done', '與家人確認位置')],
          w: [
            ...go('貼牆前進', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '最後確認一次位置'),
            add('environment.notes', '你關掉燈光，貼著牆邊走', '摸黑前進'),
          ],
        }),
        intel: res({
          n: '你在巷口觀察太久，手機螢幕的亮光引來了注意，有人朝你這邊望了一眼。你連忙縮回暗處，心跳得很大聲。等你再抬頭時，原本最安全的時間窗已經過了。你看著那個正在逼近的人影，直到對方轉身離開，才發現自己屏住了呼吸。',
          p: 'poor', why: '觀察太久，錯過安全時機', stat: [-1, 1, -1], sum: '觀察巷口，被人注意',
          m: [ms('m_contact', 'done', '傳了最後一則訊息給家人')],
          w: [
            ...go('躲到巷口觀察', 'loc_office', 'loc_street_o'),
            rem('supplies.phone_battery', 5, '手機亮光引人注意'),
            set('environment.order', 'tense', '附近有人開始留意你'),
            add('environment.notes', '手機亮光被人看見，你縮回暗處', '觀察巷口'),
          ],
        }),
        bold: res({
          n: '你把油門催到底，直接衝向管制路口。路障旁的人影一閃而過，你什麼都來不及看清。這一步賭得很大，結果在幾秒內就會知道。你只記得，家人的方向就在前方。那一瞬間你沒有想任何事，只是緊緊握住龍頭，像抓著最後一根繩子。',
          p: 'good', why: '全速衝刺，賭一把速度', stat: [-1, 0, 2], sum: '全速衝過管制路口',
          m: [ms('m_evacuate', 'done', '全速抵達會合點'), ms('m_evacuate', 'partial', '接近會合點，只剩最後一段')],
          w: [
            set('transportation.mode', 'scooter', '全速騎車'),
            ...go('衝向家人住處', 'loc_office', 'loc_street_o', 'loc_home_office'),
            rem('transportation.fuel', 10, '全速騎車耗油'),
            add('environment.notes', '你衝過管制路口，來到住處附近', '全速衝刺'),
          ],
        }),
      },
    },

    // ── 第 7 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '最後一段路了。家人所在的巷子就在前面，但那裡的氣氛不太對勁，你得決定怎麼走完它。',
      options: [
        { text: '貼著牆邊，一步一步走向家門', style: 'steady' },
        { text: '先確認家人在窗邊示意，再靠近', style: 'intel' },
        { text: '一口氣衝到家門口，不再停下來', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你貼著牆邊，一步一步走向那扇熟悉的門。每個轉角都停下來聽了一會兒。當你終於伸手敲門，裡面傳來家人壓低的聲音，那一瞬間，你整個人才真正放鬆下來。你把背包放在腳邊，聽著門內熟悉的拖鞋聲越來越近，眼眶終於紅了。',
          p: 'good', why: '穩穩走完最後一段路', stat: [1, 0, 0], sum: '貼牆前進，敲響家門',
          m: [ms('m_evacuate', 'done', '安全抵達並與家人會合')],
          w: [
            ...go('走到家人住處', 'loc_street_o', 'loc_home_office'),
            set('family.contact', 'confirmed', '在家門口與家人會合'),
            add('environment.notes', '你敲了門，裡面有人應聲', '抵達家門'),
          ],
        }),
        intel: res({
          n: '你站在巷口，先看著二樓的窗簾。過了幾秒，窗簾輕輕晃了兩下，是你和家人約好的暗號。你這才放心走過去，門在你的手碰到之前就開了。你抬頭看了一眼那盞亮著的燈，心想：今天這一路，大概是你這輩子最長的一天。',
          p: 'good', why: '對上暗號，才踏出最後一步', stat: [1, 1, 0], sum: '確認暗號，安全抵達',
          m: [ms('m_evacuate', 'done', '對上暗號後安全會合')],
          w: [
            ...go('走到家人住處', 'loc_street_o', 'loc_home_office'),
            set('family.contact', 'confirmed', '看到家人示意'),
            add('environment.notes', '二樓窗簾晃了兩下，是約好的暗號', '確認暗號'),
          ],
        }),
        bold: res({
          n: '你把剩下的力氣全部拿出來，頭也不回地衝向家門。腳步聲在空蕩的巷子裡特別響，你顧不得了。門被你撞開的瞬間，你聽見家人的驚呼，接著是一個緊緊的擁抱。你終於聽懂了心跳聲裡的意思：原來所有的速度，都是為了這一刻停下來。',
          p: 'excellent', why: '全力衝刺，一氣呵成', stat: [-1, 0, 2], sum: '全力衝刺回到家門',
          m: [ms('m_evacuate', 'done', '全力衝回家，與家人會合')],
          w: [
            ...go('衝向家人住處', 'loc_street_o', 'loc_home_office'),
            set('family.contact', 'confirmed', '在家門口與家人會合'),
            add('environment.notes', '你撞開家門，家人驚呼了一聲', '衝回家'),
          ],
        }),
      },
    },
  ],

  events: {
    ev_rumor: {
      intro: '同事的群組同時跳出好幾條撤離消息，集合地點各說各話，有幾則連來源都沒有。',
      risk: { steady: 'minor', intel: 'none', bold: 'none' },
      outcome: {
        steady: '你被各種說法繞得頭昏，遲遲沒能決定怎麼做。',
        intel: '你把每則消息的來源列成清單，一則一則比對。',
        bold: '你憑過去的經驗直接略過那些來路不明的訊息。',
      },
    },
    ev_mrt_stop: {
      intro: '市區捷運與公車突然全面停駛，站內廣播只重複一句「請稍候」，沒有人知道何時恢復。',
      risk: { steady: 'major', intel: 'minor', bold: 'none' },
      outcome: {
        steady: '你在站口等了半小時，才確定不會有任何一班車來。',
        intel: '你立刻問站務員與路人，很快確認停駛不是暫時的。',
        bold: '你早有心理準備，轉頭就去找自己的機車。',
      },
    },
    ev_blackout: {
      intro: '整棟大樓與周邊街區突然停電，電梯停擺，路口的號誌燈也一起熄滅。',
      risk: { steady: 'minor', intel: 'none', bold: 'major' },
      outcome: {
        steady: '你留在原地等電，手機訊號卻一格一格消失。',
        intel: '你把手機調成省電模式，先把重要的資訊截圖存下。',
        bold: '你摸黑加速前進，在看不見的路口差點撞上什麼。',
      },
    },
    ev_neighbor: {
      intro: '一位同事走過來，說他的家人在另一區，問你能不能載他一段，或分一點水給他。',
      risk: { steady: 'none', intel: 'minor', bold: 'none' },
      outcome: {
        steady: '你把水分了一半給他，也答應同行一小段路。',
        intel: '你問了好多細節才答應，對方等得有些不耐煩。',
        bold: '你快速回答「抱歉，我必須先走」，頭也不回地離開。',
      },
    },
    ev_crowd: {
      intro: '前方路口兩群人為了通行問題推擠起來，喇叭聲此起彼落，場面一觸即發。',
      risk: { steady: 'minor', intel: 'none', bold: 'fatal' },
      outcome: {
        steady: '你停在人群外圍，被人潮一點一點往外推。',
        intel: '你繞到高處看清人潮的流向，才選了一條縫。',
        bold: '你想從推擠的人群中硬鑽過去，眼前頓時一片混亂。',
      },
    },
    ev_checkpoint: {
      intro: '前方聯外道路被武裝人員設起管制點，逐一盤查路人與車輛，隊伍緩慢向前。',
      risk: { steady: 'major', intel: 'minor', bold: 'fatal' },
      outcome: {
        steady: '你乖乖排隊，等了很久才輪到你被盤查。',
        intel: '你先觀察哪一側放行得快，再跟著站過去。',
        bold: '你想直接闖過管制點，立刻被人攔下。',
      },
    },
  },

  comments: {
    clear: [
      { personal_comment: '一個通勤族，把整座城市當成通關地圖。', highlight_action: '在最適當的時機換上了最適當的交通方式' },
      { personal_comment: '你把混亂的消息拼成了一條回家的路。', highlight_action: '比對三個來源，標出避開管制的路線' },
      { personal_comment: '機車、地圖與一通電話，剛好夠你團圓。', highlight_action: '騎著機車穿過塞住的路口' },
      { personal_comment: '你用最普通的上班族本事，打贏了不普通的一天。', highlight_action: '在最後一個巷口對上了家人的暗號' },
    ],
    fatal: [
      { personal_comment: '你離家只差一個路口，路口卻不放你過。', highlight_action: '在管制點前選擇了最快的路' },
      { personal_comment: '速度是你的優勢，也是你的盲點。', highlight_action: '直接衝向人群與路障' },
      { personal_comment: '這次不是機車不夠快，是局勢不夠慢。', highlight_action: '沒有等到更安全的時機就出發' },
    ],
    score: [
      { personal_comment: '資訊沒看夠，路也沒走對，一路都在補洞。', highlight_action: '連續幾次判斷失準，局面越拖越糟' },
      { personal_comment: '你很努力，只是每次都慢了一步。', highlight_action: '在原地等了太久，錯過了人少的時機' },
      { personal_comment: '導航失靈的那天，你的直覺也沒開機。', highlight_action: '闖進了完全不熟悉的區域' },
    ],
    normal: [
      { personal_comment: '你撐到了最後，只差一個轉角。', highlight_action: '走到巷口卻沒能真正與家人會合' },
      { personal_comment: '你沒有輸，只是這一晚還沒結束。', highlight_action: '在混亂中保住了自己與手上的物資' },
      { personal_comment: '天黑了，你還在路上，卻也還活著。', highlight_action: '用耐心換到了一段安全的路' },
      { personal_comment: '你的路走得很穩，只是終點離你比想像中遠。', highlight_action: '在每個路口都選了最保守的路' },
    ],
  },
};
