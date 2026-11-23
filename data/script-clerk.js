/**
 * 可玩劇本：超商夜班店員（clerk）。
 * 主線固定 7 個節點，選項只改變當回合結果（開發文檔 11.2）。
 * 里程碑與世界狀態變更一律交給 rules.js 驗證，不合法的項目會被丟棄。
 */

const ms = (id, status, reason) => ({ id, status, reason });
const add = (path, value, reason) => ({ op: 'add', path, value, reason });
const rem = (path, value, reason) => ({ op: 'remove', path, value, reason });
const set = (path, value, reason) => ({ op: 'set', path, value, reason });
// 連續移動：從任何位置出發都能依序走到最後一個地點
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

const U1 = '通訊即將全面中斷';
const U2 = '主要大路有人設置關卡';
const U3 = '活動中心有人帶隊步行';

export default {
  characterId: 'clerk',
  keywords: {
    intel: ['打聽', '查看', '問', '確認', '查', '觀察', '聯絡', '打電話', '搜尋', '收聽', '廣播', '情報', '探', '看新聞', '撥', '電視'],
    bold: ['衝', '直接', '馬上', '立刻', '闖', '硬', '搶', '飆', '強行', '冒險', '突破', '跑', '不等', '捷徑', '全速'],
  },

  nodes: [
    // ── 第 1 回合：衝擊 ─────────────────────────────────────
    {
      opening: '凌晨三點，你獨自在超商值夜班。手機忽然同時跳出緊急推播，店外警報聲此起彼落，玻璃門外開始有人快步跑過。',
      options: [
        { text: '先鎖上店門，清點貨架上的必需品', style: 'steady' },
        { text: '打開手機和店內電視，先弄清楚發生什麼事', style: 'intel' },
        { text: '立刻把水、食物和電池裝袋，準備上路', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把店門鎖上一半，沿著貨架清點：飲水、即食食品、急救用品和行動電源，一樣樣擺到收銀台後面。你熟悉每樣東西放在哪，動作比一般人快得多。外頭的人聲越來越近，但你至少清楚自己手上有什麼。你把最重要的幾樣放進外套口袋，才發現自己的手一直在微微發抖。',
          p: 'good', why: '穩定清點物資，掌握手上籌碼', stat: [1, 0, 1], sum: '鎖店清點，先掌握物資',
          m: [ms('m_supplies', 'done', '清點整理後，備齊店內的必需物資'), ms('m_supplies', 'partial', '清點整理了店內的必需物資')],
          w: [
            add('supplies.water', 2, '從貨架取出飲水'),
            add('supplies.food', 2, '從貨架取出即食食品'),
            add('supplies.medicine', 1, '拿了一盒急救用品'),
            add('supplies.power_bank', 1, '取走一個行動電源'),
            add('supplies.phone_battery', 30, '趁店內有電先充手機'),
            add('information.unconfirmed', U1, '推播與路人的說法'),
            add('environment.notes', '店門半掩，貨架已集中到櫃台後', '鎖店清點'),
          ],
        }),
        intel: res({
          n: '你讓手機插上充電線，把店內電視轉到新聞台。畫面混亂，主播措辭保守，但足以確定這不是普通停電。你撥給家人，鈴聲響了很久才被接起，只來得及聽見一句「我們沒事」，通話就斷了。你把手機電量提醒設在百分之三十，因為你知道，接下來每一格電都是籌碼。',
          p: 'good', why: '搶在斷線前聯絡上家人', stat: [0, 2, 0], sum: '看新聞並撥通家人電話',
          m: [ms('m_contact', 'partial', '與家人短暫通話，確認他們暫時平安')],
          w: [
            add('supplies.power_bank', 1, '順手拿一個行動電源'),
            add('supplies.water', 1, '拿一瓶水'),
            add('supplies.food', 1, '拿一份食物'),
            add('supplies.phone_battery', 30, '手機插上店內電源充電'),
            set('family.contact', 'contacted', '與家人通上電話'),
            add('information.unconfirmed', U1, '電視與推播的說法'),
            add('environment.notes', '電視新聞語焉不詳，通話只有幾秒', '看新聞並通話'),
          ],
        }),
        bold: res({
          n: '你抓起兩個大袋子，把飲水、食物、藥品與電池一股腦塞進去，行動電源塞進外套口袋。熟悉貨架的你只花了幾分鐘，店裡最後一點秩序卻也被你拆光了。你站在空蕩的貨架前，聽見門外有人開始敲玻璃。貨架上留下的空位，讓你突然意識到：從這一刻起，你不再只是店員了。',
          p: 'excellent', why: '動作俐落，一次備齊物資', stat: [-1, 0, 2], sum: '搶先裝袋，備齊物資',
          m: [ms('m_supplies', 'lost', '被人潮推擠，裝好的物資大半散落'), ms('m_supplies', 'done', '在短時間內一次備齊所需物資'), ms('m_supplies', 'partial', '裝袋了大部分必需物資')],
          w: [
            add('supplies.water', 3, '裝袋飲水'),
            add('supplies.food', 3, '裝袋食物'),
            add('supplies.medicine', 2, '裝袋藥品'),
            add('supplies.power_bank', 1, '取走行動電源'),
            add('information.unconfirmed', U1, '推播與路人的說法'),
            add('environment.notes', '貨架幾乎被你清空，門外有人敲門', '搶先裝袋'),
          ],
        }),
      },
    },

    // ── 第 2 回合：本能反應 ──────────────────────────────────
    {
      opening: '天色仍是深藍，店裡的燈忽明忽暗，手機訊號時有時無。門外的人潮越聚越多，貨架上的存貨正快速減少。',
      options: [
        { text: '把物資分袋整理好，等人潮稍微散去', style: 'steady' },
        { text: '打電話給家人，順便問問門口路人的消息', style: 'intel' },
        { text: '不再等了，背著袋子直接出門找路', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把門鎖好，坐到收銀台後面，把物資分成兩袋：一袋隨身，一袋備用。店內座機總算撥通了，母親簡短說了家裡的狀況，要你別冒險。你這才發現自己從半夜到現在什麼都沒吃。你把其中一袋塞到收銀台下，打算天亮前再做決定，因為現在每個選項看起來都不夠安全。',
          p: 'neutral', why: '穩住店內陣腳，但時間在流逝', stat: [1, 0, 0], sum: '分袋整理，座機通話',
          m: [ms('m_contact', 'lost', '訊號與電力中斷，暫時與家人失去聯繫'), ms('m_supplies', 'done', '物資分袋整理完畢，備齊隨身與備用')],
          w: [
            add('supplies.water', 2, '再補兩瓶水'),
            add('supplies.food', 2, '再補兩份食物'),
            add('supplies.medicine', 1, '補一盒藥品'),
            add('supplies.power_bank', 1, '補一個行動電源'),
            add('supplies.phone_battery', 20, '繼續充電'),
            set('family.contact', 'contacted', '座機與家人通話'),
            add('environment.notes', '物資分成兩袋，座機撥通過一次', '整理物資'),
          ],
        }),
        intel: res({
          n: '你連打三通電話，第三通終於接通。母親說她和弟弟在家，附近停電、電梯不能用，要你先別冒險。你又隔著門問了幾個路人，說法不一，只有一件事一致：越晚走，路上人越多。你把路人說的幾個地名記在收據背面，像是在替自己畫一張簡陋的地圖。',
          p: 'excellent', why: '問對人，也問對了時機', stat: [1, 2, 0], sum: '連線家人並探問路況',
          m: [ms('m_contact', 'done', '與母親確認了家人的位置與狀況'), ms('m_transport', 'partial', '從路人口中得知可行的步行路線')],
          w: [
            add('supplies.medicine', 1, '補一盒藥品'),
            add('supplies.power_bank', 1, '補一個行動電源'),
            add('supplies.water', 1, '補一瓶水'),
            add('supplies.food', 1, '補一份食物'),
            add('supplies.phone_battery', 15, '趁店內有電補充'),
            set('family.contact', 'confirmed', '確認家人所在位置'),
            add('information.confirmed', U1, '與多方說法互相印證'),
            add('environment.notes', '家人在家中，附近停電', '通話得知'),
          ],
        }),
        bold: res({
          n: '你背起袋子推開店門。外面比你想的擠得多，你被人潮推著走了一段，才在路口找到空隙停下來。袋子還在，手機電量卻掉了一格。衝得快，並不等於看得清方向。你一邊低頭護著袋子，一邊提醒自己：下一次要先看路，再邁步。',
          p: 'poor', risk: 'minor', why: '衝出去很快，卻看不清方向', stat: [-1, -1, 1], sum: '衝出店門，被人潮推走',
          m: [ms('m_supplies', 'lost', '搶購的人潮沖散了手上的物資'), ms('m_supplies', 'done', '出門前補齊了隨身物資'), ms('m_transport', 'partial', '離開店面，開始自己找路')],
          w: [
            add('supplies.power_bank', 1, '出門前再拿一個'),
            add('supplies.water', 1, '出門前再拿一瓶水'),
            add('supplies.phone_battery', 30, '出門前再充一下'),
            ...go('離開超商來到路口', 'loc_street_c'),
            add('environment.notes', '袋子在手，卻被人潮推離店門', '衝出店門'),
          ],
        }),
      },
    },

    // ── 第 3 回合：代價 ─────────────────────────────────────
    {
      opening: '天剛亮，街上的人潮比預期更多。每個人都急著去某個地方，卻沒有人說得清楚哪條路還安全。',
      options: [
        { text: '貼著騎樓慢慢走，避開人多的路口', style: 'steady' },
        { text: '繞去里民活動中心，向收容的人打聽路況', style: 'intel' },
        { text: '走最短的大路，趁人潮還沒聚集時衝過去', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你貼著騎樓一小段一小段地走，每到路口就先停下來看。這樣很慢，但沒有人注意到你。途中你聽見有人說主要大路被設了關卡，也有人說只是謠言，沒有人能給你證據。你在一個轉角停了很久，直到確認前面那群人只是在互相道別，才繼續往前。',
          p: 'good', why: '走得慢但穩，沒被捲進人潮', stat: [1, 0, 0], sum: '貼著騎樓慢慢前進',
          m: [ms('m_contact', 'lost', '訊號與電力中斷，暫時與家人失去聯繫'), ms('m_transport', 'partial', '找到避開人潮的步行路線')],
          w: [
            ...go('離開超商，走上街道', 'loc_street_c'),
            rem('supplies.phone_battery', 5, '一路查看手機'),
            add('information.unconfirmed', U2, '路人之間流傳的說法'),
            add('environment.notes', '騎樓下人少，但路被切成很多段', '貼著騎樓走'),
          ],
        }),
        intel: res({
          n: '里民活動中心裡擠滿了人，志工正在登記名冊。你問到一位里長：有一小隊鄰居打算結伴步行往新北方向，走的是小路，願意讓你加入，但天亮後就要出發。你把這條路線牢牢記在腦裡。離開前，一位阿姨塞給你一個溫熱的飯糰，說：「路上小心，到家了記得報平安。」',
          p: 'good', why: '找到可信的結伴路線', stat: [1, 1, 0], sum: '到活動中心打聽到結伴路線',
          m: [ms('m_contact', 'partial', '志工協助聯絡上家人所在地區'), ms('m_contact', 'done', '志工協助確認了家人所在地區')],
          w: [
            ...go('前往里民活動中心', 'loc_street_c', 'loc_shelter'),
            add('supplies.water', 2, '活動中心提供飲水'),
            rem('supplies.phone_battery', 5, '查詢與通話耗電'),
            set('family.contact', 'confirmed', '志工幫忙確認家人所在區域'),
            add('information.unconfirmed', U2, '收容民眾之間流傳的說法'),
            add('information.unconfirmed', U3, '里長提到的結伴計畫'),
            add('environment.notes', '活動中心擠滿人，志工忙著登記', '來到活動中心'),
          ],
        }),
        bold: res({
          n: '你直接踏上大馬路，趁人潮還沒聚集的空檔快步前進。前半段順得出奇，紅綠燈全暗了，你憑著熟悉的路徑搶在人流前頭。但越往前走，空氣裡的緊張感越重，你知道自己已經沒有退路。你的鞋底踩著柏油路發出急促的聲響，彷彿在替你倒數。',
          p: 'excellent', why: '憑熟悉路線搶下先機', stat: [-1, 0, 2], sum: '走大路搶在人潮前面',
          m: [ms('m_supplies', 'lost', '搶購的人潮沖散了手上的物資'), ms('m_transport', 'partial', '憑熟悉路線找到最快的前進方式')],
          w: [
            ...go('離開超商走上大路', 'loc_street_c'),
            rem('supplies.phone_battery', 10, '邊走邊查路況'),
            add('information.unconfirmed', U2, '路上聽到的說法'),
            set('environment.order', 'chaotic', '街上開始失序'),
            add('environment.notes', '紅綠燈全暗，人流逐漸變多', '走大路'),
          ],
        }),
      },
    },

    // ── 第 4 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '時間一小時一小時過去，前面做的選擇開始顯現代價。身邊的人也在盤算下一步，資源與信任都變得吃緊。',
      options: [
        { text: '找個角落補水休息，等同行的人多一些', style: 'steady' },
        { text: '確認傳聞的來源，再決定走哪條路', style: 'intel' },
        { text: '不等了，抄小巷直接往家的方向走', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你在活動中心旁的長椅坐下，把水分給身邊一位發抖的老人，也補了自己一口。休息讓你頭腦清楚了些，但同行的人越來越少，有人已經先走了。你開始懷疑自己是不是等得太久。你看著手機上不斷閃爍的低電量提示，心裡盤算：這一次休息，是投資，還是浪費。',
          p: 'good', why: '補足體力，也穩住了同伴', stat: [2, 0, -1], sum: '休息補水，分水給老人',
          m: [ms('m_transport', 'lost', '被人潮衝散，失去原本結伴的隊伍'), ms('m_contact', 'done', '與同行的人互通消息，再次確認家人位置')],
          w: [
            ...go('回到活動中心休息', 'loc_street_c', 'loc_shelter'),
            add('supplies.water', 2, '活動中心補水'),
            rem('supplies.water', 1, '分一瓶水給老人'),
            add('supplies.phone_battery', 5, '活動中心有電，順便充電'),
            set('family.contact', 'confirmed', '再次確認家人位置'),
            add('environment.notes', '你把一瓶水分給了身旁的老人', '分水'),
          ],
        }),
        intel: res({
          n: '你回頭問了三個從不同方向走來的人，把答案逐一拼起來：大路確實有人設卡，但小巷還通。你把這個結論告訴身邊的人，也記下一個可以躲避的轉角。多花的十分鐘，讓你心裡踏實許多。你把這些拼湊出來的判斷寫在手心，怕自己走累了，會忘了哪裡才是安全的。',
          p: 'good', why: '把傳聞拼成可用的路線', stat: [0, 2, 0], sum: '比對說法，確認小巷可走',
          m: [ms('m_transport', 'done', '確認了小巷這條可行路線')],
          w: [
            ...go('走回街上與人交談', 'loc_street_c'),
            add('information.confirmed', U2, '三個人的說法互相吻合'),
            rem('supplies.phone_battery', 5, '查詢資訊耗電'),
            add('environment.notes', '大路有關卡，小巷仍可通行', '比對說法'),
          ],
        }),
        bold: res({
          n: '你不再等，轉身鑽進小巷，沿著後門與防火巷快步穿行。有幾處巷口堆滿雜物，你硬是翻了過去。速度確實快了，可是背包被勾破，水也灑掉一半。更糟的是，你的方向感已經開始混亂。你喘著氣靠在牆邊，聽見巷子另一頭傳來陌生的腳步聲，不敢探頭去看。',
          p: 'poor', risk: 'minor', why: '搶快卻丟了水，也迷了方向', stat: [-1, -1, 1], sum: '抄小巷趕路，丟了水',
          m: [ms('m_transport', 'done', '憑自己的路線感走出一條路'), ms('m_arrive', 'partial', '抄小巷後已接近會合點')],
          w: [
            ...go('鑽進小巷趕路', 'loc_street_c'),
            rem('supplies.water', 1, '背包破了，水灑掉一半'),
            rem('supplies.phone_battery', 10, '邊走邊查地圖耗電'),
            add('environment.notes', '背包被勾破，水灑了一半', '抄小巷'),
          ],
        }),
      },
    },

    // ── 第 5 回合：連鎖反應 ──────────────────────────────────
    {
      opening: '手機電量與體力都在下降。有人說前面的路被封了，有人說再走一段就到，你只能靠自己判斷。',
      options: [
        { text: '放慢速度保存體力，沿熟悉的小路前進', style: 'steady' },
        { text: '用剩下的電量再聯絡家人，確認會合方式', style: 'intel' },
        { text: '跟著人群走大路，換取最快的速度', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你把步子放慢，沿著平時下班走的小路前進，累了就停下來喝水。這條路上幾乎沒人，安靜得讓人不安。你省下了體力，卻也錯過了一輛正載人離開的貨車。有時候，穩也是一種代價。你想起家人最後一則訊息：「不用急，平安最重要。」於是又把水瓶蓋緊了一些。',
          p: 'poor', why: '省下體力，卻錯過載人機會', stat: [1, 0, -1], sum: '放慢腳步，錯過順風車',
          m: [ms('m_contact', 'lost', '訊號與電力中斷，暫時與家人失去聯繫'), ms('m_transport', 'done', '沿熟悉小路確定了前進方式')],
          w: [
            ...go('沿小路前進', 'loc_street_c'),
            rem('supplies.water', 1, '路上補水'),
            rem('supplies.phone_battery', 5, '偶爾查看手機'),
            add('environment.notes', '小路很安靜，貨車已經開走', '放慢腳步'),
          ],
        }),
        intel: res({
          n: '你拿出行動電源接上手機，再撥一次電話。這回通了：弟弟說他們在二樓，樓下有人聚集，要你從後巷繞進來。你把會合的暗號和時間記下來，也順手把電量補回一些。掛掉電話前，你反覆把暗號與時間在心裡默念了三遍，才放心把手機收起來。',
          p: 'excellent', why: '趁電量還在，敲定會合方式', stat: [0, 2, 0], sum: '再聯絡家人，約定後巷會合',
          m: [ms('m_contact', 'done', '敲定與家人的會合方式'), ms('m_arrive', 'partial', '約好從後巷進入，已接近會合點')],
          w: [
            ...go('找個角落打電話', 'loc_street_c'),
            rem('supplies.power_bank', 1, '用行動電源補手機'),
            add('supplies.phone_battery', 10, '行動電源補電'),
            set('family.contact', 'confirmed', '確認家人位置與會合方式'),
            add('environment.notes', '與家人約好從後巷進入', '再聯絡家人'),
          ],
        }),
        bold: res({
          n: '你混進人群，順著人流走上大馬路。速度快了一倍，沿途的告示與廣播也聽得更清楚。但擠在人群裡的你完全沒有退路，任何一個路口出事，你都只能跟著被推著走。你的腳步跟著人群走，連自己什麼時候想停下來的念頭，都被淹沒了。',
          p: 'good', risk: 'minor', why: '跟著人流走得快，但難以掉頭', stat: [-1, 1, 1], sum: '混入人潮，快速前進',
          m: [ms('m_transport', 'done', '確定了可行的移動方式')],
          w: [
            ...go('走上大馬路', 'loc_street_c'),
            rem('supplies.phone_battery', 10, '一路查地圖與廣播'),
            set('environment.order', 'chaotic', '人流擁擠失序'),
            add('environment.notes', '人群擠滿大路，難以掉頭', '混入人潮'),
          ],
        }),
      },
    },

    // ── 第 6 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '離家人越來越近，也離危險越來越近。這一段路，會決定你能不能撐到最後。',
      options: [
        { text: '避開路口，繞遠路從巷弄接近住處', style: 'steady' },
        { text: '先在遠處觀察路口狀況，再決定怎麼過', style: 'intel' },
        { text: '不繞了，直接穿過路口衝向住處', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你選了最遠的一條，沿著後巷與停車場一段段摸過去。腳底磨出了水泡，但你始終沒有走進視線最亮的地方。當你終於遠遠看見住處的屋頂時，膝蓋都在發抖。遠處的警示聲忽遠忽近，你把背包抱在胸前，每一步都踩在自己能控制的範圍內。',
          p: 'good', why: '繞遠路避開了最危險的路口', stat: [1, 0, 0], sum: '繞遠路，避開危險路口',
          m: [ms('m_transport', 'lost', '被人潮衝散，失去原本的路線'), ms('m_contact', 'done', '確認家人所在位置')],
          w: [
            ...go('走後巷與停車場', 'loc_street_c'),
            rem('supplies.water', 1, '喝掉一瓶水'),
            rem('supplies.phone_battery', 5, '省電查看地圖'),
            add('environment.notes', '腳底磨出水泡，但沒有被發現', '繞遠路'),
          ],
        }),
        intel: res({
          n: '你躲在一輛停著的貨車後面觀察了很久。路口的人群分成兩邊，另一側有幾個穿著制服的人在盤查。你看出隊伍中間有一個縫，算好時間，等一批人過去後悄悄靠了過去。你默數著人群流動的節奏，數到第三輪時，那個縫隙終於變得夠大。',
          p: 'good', why: '耐心觀察，抓到通過的空檔', stat: [1, 1, 0], sum: '遠處觀察，找到空檔',
          m: [ms('m_arrive', 'partial', '觀察路口後，找到通過的空檔'), ms('m_transport', 'done', '確認了通過路口的路線')],
          w: [
            ...go('在路口附近觀察後前進', 'loc_street_c'),
            rem('supplies.phone_battery', 5, '偶爾查看手機'),
            add('environment.notes', '路口有人盤查，隊伍中間有空檔', '觀察路口'),
          ],
        }),
        bold: res({
          n: '你深吸一口氣，直接衝進路口。人群的推擠像一道牆，你用肩膀和背包擠出一條縫，什麼都看不清，只有住處的方向在前面。這一步賭得很大，結果在一瞬間就會知道。耳邊的聲音突然變得很遠，你只聽見自己的心跳，一下一下，催著你向前。',
          p: 'excellent', why: '直衝路口，搶下了時間', stat: [-1, 0, 2], sum: '直接衝過路口',
          m: [ms('m_arrive', 'partial', '衝過路口，接近會合點'), ms('m_arrive', 'done', '衝過路口，抵達會合點')],
          w: [
            ...go('衝過路口回到住處', 'loc_street_c', 'loc_home_clerk'),
            rem('supplies.phone_battery', 5, '一路緊握手機'),
            add('environment.notes', '你衝過路口，來到家人住處附近', '直衝路口'),
          ],
        }),
      },
    },

    // ── 第 7 回合：關鍵轉折 ──────────────────────────────────
    {
      opening: '最後一段路了。街角的景象不太對勁，但家人所在的方向，就在不遠處。',
      options: [
        { text: '貼著牆邊，一步一步走向家門', style: 'steady' },
        { text: '先確認家人在窗邊示意，再靠近', style: 'intel' },
        { text: '一口氣跑向家門，不再停下來', style: 'bold' },
      ],
      results: {
        steady: res({
          n: '你貼著牆邊，一步一步走向那扇熟悉的門。每個轉角你都停下來聽了一會兒。當你終於伸手敲門，裡面傳來母親壓低的聲音，那一瞬間，你整個人才真正放鬆下來。你在門前停了兩秒，把呼吸調回平穩，才讓自己看起來不像剛逃難回來的人。',
          p: 'good', why: '穩穩走完最後一段路', stat: [1, 0, 0], sum: '貼牆前進，敲響家門',
          m: [ms('m_arrive', 'done', '安全走到家門口與家人會合')],
          w: [
            ...go('走到家人住處', 'loc_street_c', 'loc_home_clerk'),
            set('family.contact', 'confirmed', '在家門口與家人會合'),
            add('environment.notes', '你敲了門，裡面有人應聲', '抵達家門'),
          ],
        }),
        intel: res({
          n: '你站在巷口，先看著二樓的窗簾。過了幾秒，窗簾輕輕晃了兩下，是你和弟弟小時候約好的暗號。你這才放心走過去，門在你的手碰到之前就開了。你發現自己的眼眶有點熱，卻還是先把背包放在地上，確認門內的人都在。',
          p: 'excellent', why: '對上暗號，才踏出最後一步', stat: [1, 1, 0], sum: '確認暗號，安全回家',
          m: [ms('m_arrive', 'done', '對上暗號後安全與家人會合')],
          w: [
            ...go('走到家人住處', 'loc_street_c', 'loc_home_clerk'),
            set('family.contact', 'confirmed', '看到家人示意'),
            add('environment.notes', '二樓窗簾晃了兩下，是約好的暗號', '確認暗號'),
          ],
        }),
        bold: res({
          n: '你把剩下的力氣全拿出來，頭也不回地衝向家門。腳步聲在空蕩的巷子裡特別響，你顧不得了。門被你撞開的瞬間，你聽見母親的驚呼，接著是熟悉的懷抱。你一頭栽進家門，才發現雙腿早已不聽使喚，整個人跪坐在玄關。',
          p: 'good', risk: 'minor', why: '全速衝刺，雖然動靜有點大', stat: [-1, 0, 2], sum: '全力衝刺回到家門',
          m: [ms('m_arrive', 'done', '全速衝回家，與家人會合')],
          w: [
            ...go('衝向家人住處', 'loc_street_c', 'loc_home_clerk'),
            set('family.contact', 'confirmed', '在家門口與家人會合'),
            add('environment.notes', '你撞開家門，母親驚呼了一聲', '衝回家'),
          ],
        }),
      },
    },
  ],

  events: {
    ev_rumor: {
      intro: '手機裡的群組同時跳出好幾則撤離消息，說法互相矛盾，其中有幾則根本沒有出處。',
      risk: { steady: 'none', intel: 'none', bold: 'minor' },
      outcome: {
        steady: '你把群組先靜音，只留下有出處的幾則。',
        intel: '你逐則比對來源，標出最可能可信的一則。',
        bold: '你點開第一則就照做，事後才發現來源不明。',
      },
    },
    ev_rush: {
      intro: '一群顧客突然湧進店裡，貨架在幾分鐘內被清空，收銀台前排起長長的人龍。',
      risk: { steady: 'minor', intel: 'none', bold: 'major' },
      outcome: {
        steady: '你退到收銀台後面，守住最後幾排貨架。',
        intel: '你先看清人流方向，把自己和袋子挪到側門邊。',
        bold: '你硬擠進人群搶最後幾樣貨，差點被推倒。',
      },
    },
    ev_blackout: {
      intro: '整個區域突然停電，路燈與招牌同時熄滅，手機訊號也變得時斷時續。',
      risk: { steady: 'major', intel: 'minor', bold: 'none' },
      outcome: {
        steady: '你原地等著電力恢復，卻只等到更深的黑暗與更多的不安。',
        intel: '你打開手電筒，一邊省電一邊找訊號。',
        bold: '你憑熟悉的路線摸黑前進，沒被突來的黑暗難倒。',
      },
    },
    ev_neighbor: {
      intro: '一位陌生人走近你，說家人沒水沒食物，問你能不能分一些，或一起走一段路。',
      risk: { steady: 'none', intel: 'none', bold: 'minor' },
      outcome: {
        steady: '你分了一瓶水給他，約好在下個路口分開。',
        intel: '你先問清他的來歷與路線，確定順路才答應同行。',
        bold: '你沒多想就拒絕了，對方的眼神讓你有些過意不去。',
      },
    },
    ev_crowd: {
      intro: '走到路口時，兩群人為了方向爭執起來，推擠迅速擴大，現場一片混亂。',
      risk: { steady: 'major', intel: 'minor', bold: 'fatal' },
      outcome: {
        steady: '你貼著牆邊等待，卻被人潮越推越深。',
        intel: '你退後半步，先看清哪邊的人少才動。',
        bold: '你硬從縫隙擠過去，人潮壓得你幾乎喘不過氣。',
      },
    },
    ev_checkpoint: {
      intro: '前方的聯外道路被武裝人員設起管制點，逐一盤查路人，隊伍緩慢向前移動。',
      risk: { steady: 'minor', intel: 'none', bold: 'fatal' },
      outcome: {
        steady: '你排進隊伍，低著頭接受盤查，一路壓著呼吸。',
        intel: '你先在遠處看了一陣，找到盤查最鬆的一側。',
        bold: '你想繞過管制點硬闖，立刻被人注意到。',
      },
    },
  },

  comments: {
    clear: [
      { personal_comment: '深夜的超商店員，成了全家的領航員。', highlight_action: '憑對貨架的熟悉，一口氣備齊物資' },
      { personal_comment: '你不只提著物資回家，也把希望帶了回去。', highlight_action: '在最後一個路口對上了家人的暗號' },
      { personal_comment: '熟悉貨架的人，原來也熟悉回家的路。', highlight_action: '把每一段路都走成了安全的一段' },
      { personal_comment: '一袋飲水、一通電話，換來一個團圓的清晨。', highlight_action: '在斷訊前撥通了家人的電話' },
    ],
    fatal: [
      { personal_comment: '你離家只差一個路口，命運卻不等人。', highlight_action: '在最危險的路口選擇了硬闖' },
      { personal_comment: '勇氣很亮，但黎明前的路更黑。', highlight_action: '沒有等到更安全的時機就衝了出去' },
      { personal_comment: '這一步賭得太大，賭局也沒有第二局。', highlight_action: '面對管制點與人群，選擇了最快的路' },
    ],
    score: [
      { personal_comment: '一路手忙腳亂，好運先你一步離開了。', highlight_action: '連續幾次衝動的決定讓局勢失控' },
      { personal_comment: '物資在背包裡，方向卻不在腦袋裡。', highlight_action: '丟了水又迷了路，只能原地苦撐' },
      { personal_comment: '不是你不夠努力，是每一步都走得太急。', highlight_action: '在人潮裡一次次錯過了該停下的時機' },
    ],
    normal: [
      { personal_comment: '天亮了，你還在路上，家也還在遠方。', highlight_action: '在最後一刻仍沒踏進家門' },
      { personal_comment: '你撐到了最後，只差一個轉角。', highlight_action: '走到巷口卻沒能真正會合' },
      { personal_comment: '雖然沒有團圓，你也沒有被打倒。', highlight_action: '在混亂中守住了自己與手上的物資' },
      { personal_comment: '你活了下來，故事則還沒走完。', highlight_action: '用耐心換到了一段平安的路' },
    ],
  },
};
