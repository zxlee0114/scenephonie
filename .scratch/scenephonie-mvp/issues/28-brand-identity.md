# 品牌識別

Type: prototype
Status: resolved
Blocked by:

## Question

[票券 26](./26-ui-visual-direction.md) 把品牌識別**移出**了視覺方向那張票。理由是判準不共用一把尺：**品牌要辨識度、要搶眼；寫作介面的判準是不搶戲**（長時間寫作的疲勞度）。綁在一起會讓其中一個遷就另一個。

### 要回答

1. **字標與 logo**：`overall-v1-a.png` 是第一份候選（Design.com ＋ ChatGPT 生成），要不要用、要改哪裡。
2. **icon 與 favicon**：同上。
3. **Brand palette 的具體色值**：票券 26 只把 Brand Amber 定為 **accent candidate**，並**刻意不預先決定其衍生色值**。本票決定品牌色本身；accent 的實際衍生值屬本票的下游。
4. **命名與 tagline**：`overall-v1-a.png` 帶了 `WRITE · STRUCTURE · BRING TO LIFE`，未經裁決。

### 不在這張票內

- **編輯器與介面的視覺語彙** —— 票券 26 已定。品牌色進介面時只能是 accent，**不得成為 editor palette**。

## 材料

| 檔案 | 放什麼 |
|---|---|
| 🖼 [`../research/assets/ui/draft/overall-v1-a.png`](../research/assets/ui/draft/overall-v1-a.png) | 品牌識別板：字標、icon、favicon、色票、四張 usage 示意 |
| 🖼 [`../research/assets/ui/draft/icon-v1-a.png`](../research/assets/ui/draft/icon-v1-a.png) | icon 單張 |
| 📄 [`../research/assets/ui/draft/prompts/`](../research/assets/ui/draft/prompts/) | 生成 prompt（慣例見 `assets/ui/README.md`） |

⚠️ **`overall-v1-a.png` 右下角那格 usage example 不可作為編輯器視覺的參考** —— 它畫的是 `SCENE 12`／`INT. COFFEE SHOP — DAY` 的美式所見即所得，**違反不變式 G**（[ADR-0010](../../../docs/adr/0010-editor-representation-is-not-output-preview.md)）。那是生成工具自己補上的裝飾，不是決策。

## 它擋什麼

**不擋任何東西。** 可以隨時做。

---

## Comments

### 2026-09-01 — grilling session 進行中（**尚未 resolve**，交接給下一個 session）

> ✅ **已被下方 `## Answer` 取代（同日 resolve）。** 本節保留為過程紀錄 —— 前六輪的裁決仍然有效，唯 **Q17 的參數**由第二個 session 依新增的 Gate 5b 重新選定（`600/300` → **`600/400`**）。

本票已 `Status: claimed`，走完六輪 grilling，**frontier 尚未清空**。下一個 session 從「待答」那節接手即可，不需重推前面的推理。

#### 已定案

| # | 問題 | 裁決 |
|---|---|---|
| Q1 | v1 品牌識別的交付範圍 | **最小可用集：wordmark／favicon／accent**。其餘 brand system（lockup、單色版、usage 規範）延後 —— 票券 25 已把 v1 成功標準改寫成**作品集＋封閉測試** |
| Q2 | 要不要中文品牌名 | **不要**，維持唯一正式名稱 `Scenephonie`。理由**不是**「台灣編劇圈慣例」（未驗證的市場判斷），而是**目前沒有需求證明需要中文品牌名** |
| Q3 | 第一輪的星芒與 node graph | **星芒砍掉**（它是全業界的 AI 語彙，本產品零 AI）。**不把 node graph 直接當品牌語彙**，但不寫死「關聯／結構不能是品牌概念」—— 該砍的是 **implementation model 的直接視覺化** |
| Q4 | 草稿狀態與 export blocking 是否共用視覺角色 | **拆開。** `draft` 是 document state（常駐、大量、判準是不疲勞）；`error`／`validation` 是 action consequence（只在匯出彈窗出現）。⚠️ 連帶後果：`warning` 這個 role 在 v1 可能**失去消費者**，色彩角色從「accent／warning／neutral」變成「**accent／draft／error／neutral**」 |
| Q5 | tagline | **不做。** `WRITE · STRUCTURE · BRING TO LIFE` 沒有承載位置（v1 無 landing page），且 `BRING TO LIFE` 對產品能力做了額外承諾 |
| ~~Q7~~ | accent 的具體衍生色值 | **已撤回，不裁決。** Amber 不再被視為既定 brand accent |
| Q6 | wordmark 用現成字體還是客製 | **(a) 授權清楚的現成字體直接排字、不改字母。** mark 已負責主要品牌語意，wordmark 的工作回到 identity、排版與實際承載 |
| Q9 | 內部 brand statement | **「格式不該是你的事」**（product promise）。「同一份東西的多種面貌」降級為 **visual exploration direction**，不得誤認成品牌承諾 |
| Q10 | brand color 與 semantic role 撞色域時誰讓 | **brand color 讓。** 原則：**窄的先佔位，寬的後填空** |
| Q11 | brand color 留本票還是畢業 | **留在本票**（它是第二輪視覺探索的下游產物） |
| Q12 | 獨立 mark 要不要存在 | **(c) 先不建立。** 順序是 `wordmark → 實際 48px header → favicon 測試 → 判斷是否真的缺少獨立 identity → 必要時才新增 mark`。抓出了 Q1 之後悄悄引入的未決需求：最小可用集裡**沒有 mark**，但後續討論一直默認它存在 |
| Q13 | exploration medium | **(b) SVG／確定性排版**，不用生成式圖片。第一輪的每個失敗都源於對生成工具沒有控制權 |
| Q14 | wordmark 字體氣質 | **Humanist sans。** Didone／Trajan 方向排除 —— 理由是它帶出 authority／canonical／formal 語意，與 compass 衝突。「與 Noto Sans TC 同源」是**加分項不是硬規則** |
| Q15 | favicon 的「實心容器＋反白 S」 | **(a) 算 rendering treatment，可用。** 判準是 **identity 是否離開 wordmark**，不是有沒有增加幾何元素。⚠️ 規範：**container 只是小尺寸 rendering treatment，不得升格成獨立品牌資產** |
| Q16a | wordmark 辨識度主要來自哪裡 | **(b) 字體保持低個性，靠大小寫、字距、比例與實際排版建立 identity。** 選字準則因此從「找個性最大的」換成「**找最少引入額外語意的**」 |

#### 本輪長出來的原則

1. **semantic UI color 依各自語意獨立設計；brand color 在視覺語言確定後才產生，不得反過來成為 UI role 的隱性 constraint。**（Q7 撤回的產物 —— 這是對票券 26 的**依賴方向反轉**）
2. **窄的先佔位，寬的後填空。**（Q10）
3. **抹平字體差異 ≠ 建立 identity。**（Q16a 的實測產物，見下）
4. 責任分配一以貫之：mark 不承擔 implementation model、wordmark 不承擔 tagline、favicon 不承擔獨立 mark、wordmark 也不承擔全部辨識度。

#### dependency chain（已固定）

```
Product promise → Visual language → Mark / Wordmark → Brand color
Semantic role → token                         （兩條線平行）
```
兩條線**只在實際 UI 組合時相遇**，不得其中一條成為另一條的上游。

#### Gate（Q8，五條；任一條不過即淘汰，不進並列比較）

1. **16px 測試** —— 縮到 16px 仍可辨識，且縮小後的東西必須是 mark 本身，不得換成另一個符號。⚠️ 必須走**實際 rasterization**（`SVG → browser rasterization → 16×16 → human recognition`），不是檢查 SVG 結構。
2. **單色測試** —— 去掉顏色、漸層、光暈後仍成立。
3. **不做產品沒有的承諾** —— 不得出現 AI 語彙（星芒、光暈、粒子）或影像／攝影語彙（場記板、膠卷、鏡頭）。
4. **不畫 implementation model** —— 不得直接視覺化節點、連線、樹狀、區塊堆疊。
5. **brand statement 是 semantic compass，不是 literal illustration brief** —— 不需「看圖能解釋那句話」，只需視覺語意一致。淘汰「把格式線撕掉」這類過度字面化的圖解。

⚠️ 主要驗收對象已從「獨立 mark」改成目前真正存在的 **wordmark／favicon 候選**。

#### 實測結果（三份素材，全部可重跑）

素材在 [`../research/assets/ui/draft/`](../research/assets/ui/draft/)，harness 在 `draft/harness/`（HTML，比 prompt 更強 —— 確定性、可逐格重跑）。

| 檔案 | 測什麼 | 結果 |
|---|---|---|
| `wordmark-v2-sheet.png` | 四個 humanist sans × 三種大小寫，**真實 48px header** | Sentence case 最強。ALL CAPS 為了塞進 header 必須降到 14px，換來閱讀重量流失。Playfair Display 作為**已排除對照組**同列（讓排除的理由可見） |
| `favicon-v2-16px.png` | Gate 1 真實 16×16 光柵化，單／雙字母 | 單字母 `S` **可辨識**（過 Gate 1）；`Sc`／`Sp` 在 16px 已糊 |
| `favicon-v2-identity.png` | 可辨識 vs 可識別 | ⚠️ **測試 A：四個字體的 16px `S` 幾乎逐像素相同** → favicon 的 identity **不可能來自字體選擇**。**測試 B：tab 列裡 Scenephonie 的 `S` 與 Slack 的 `S` 無法區分** → 單色字母 favicon 不具識別性。**測試 C：換成實心圓角方塊＋反白字母後立刻可挑出**，且底色用中性 `#18181B` 就成立 —— **救回 identity 的是形式，不是顏色** |
| `wordmark-v2-treatments.png` | Q16a(b)：identity 能否只由排版做出來 | 基準線／緊排：字體主導，處理太弱。**疏排全大寫：四格幾乎相同**（完全抹平，但誰都做得出來 → 沒有記憶點）。輕量大字：管氣質不管形狀。**字重分段（`Scene` 600 ／ `phonie` 300）：唯一既抹平字體差異、又留下可記憶結構的處理** |

**favicon 的重要推論：形式與顏色可以脫鉤**，因此 favicon **不必等 brand color**——

| 層 | 內容 | 狀態 |
|---|---|---|
| 形式 | 圓角實心方塊 ＋ 反白 `S` | 現在就能定 |
| 顏色 | 那個方塊填什麼色 | 等 brand color，順序不變 |

#### 仍然有效但已降級的事實

`#D4A017` 在白底對比僅 **2.38:1**（WCAG 文字需 4.5:1、UI 元件邊界需 3:1，**兩條都不過**）。Q7 撤回後它不再是約束，降級成：**若第二輪視覺結果又走到 amber 附近，這是必須先過的門檻。**

#### ⚠️ 欠票券 26 與 `ui-tokens-draft.md` 的回寫（本票 resolve 時必須做）

1. **`ui-tokens-draft.md` §2.1**：「accent 取自 brand palette 的 Amber，降飽和後才進介面」→ 依 Q7 撤回改為 **brand color 未決**，並記入依賴方向反轉。
2. **票券 26 §4**：「warning 不得與 accent 同色」的**原有理由失效**（前提是 accent 已知）。規則本身由 Q4 以更好的理由涵蓋：**兩者不同色不是因為撞色，是因為語意不同層**。
3. **色彩角色**由「accent／warning／neutral」改為 **accent／draft／error／neutral**（Q4）。

#### 待答 —— 下一個 session 從這裡接手

**❓ Q17 — 「字重分段」（`Scene` 600 ／ `phonie` 300）要採用嗎？**

它是測出來唯一真的建立 identity 的處理。攤開的疑慮：**它強調的是名字的構詞（scene + phonie），那是名字的機智，不是產品的承諾** —— 有沒有可能是「讓交付物承擔它不該承擔的東西」這個錯誤換了個位置？

判斷是**沒有**，理由是 Gate 5：字重分段不宣稱任何產品主張，不是圖解，只是排版結構；它說的是「這個名字由兩個部分組成」——**名字的事實**，與 `BRING TO LIFE` 那種額外承諾性質不同。

- (a) **採用**
- (b) 否決，改用「輕量大字」這類只管氣質的低調處理，並**明確接受 identity 弱**（實質等於 Q16a 的 (c)）
- (c) 否決字重分段，但探索別的結構性處理

➡️ 建議 **(a)**。連帶效果：採用後**字體選擇退居次要**（結構主導視覺），因此可以挑「最少引入額外語意」的 **Source Sans 3**，不必為 identity 去借 IBM Plex 的既有品牌語彙 —— **(a) 同時解掉 Q16 的僵局**。⚠️ 若選 (b)，代價必須明講：實測顯示低調處理**無法**建立 identity，(b) 就是明確接受品牌識別度低，而不是選了個安靜排版之後假裝有 identity。

**❓ Q18 — wordmark 最終以什麼形式交付？**（獨立於 Q17）

- (a) **SVG outline**（字母轉路徑）
- (b) CSS 排字（載 webfont，用 `<span>` 排）

➡️ 建議 **(a)**。理由三條：字重分段若採用，(b) 要**多載一個字重**（票券 26 明訂 `--font-body` 只載 Regular 400，多載字重就是為視覺偏好承擔 payload，該原則精神同樣適用）；outline 在任何裝置**逐像素相同**，CSS 排字會因字體載入失敗退化成系統字；**OFL 1.1 明確允許字形嵌入文件**，授權乾淨。代價是 wordmark 從此不可用 CSS 改（改字距要重新輸出 SVG）—— 但那正是字標該有的性質：**它是資產，不是排版**。

#### 之後的順序

1. Q17／Q18 收斂 → 輸出 wordmark 與 favicon 的具體規格（字體、字重、字距、容器圓角與 padding）
2. 依 Q12 的順序做 favicon 測試，判斷是否真的缺少獨立 identity（若缺，才提出獨立 mark 的需求，**不預先設計 mark 再替它找用途**）
3. **最後一步**：brand color（dependency chain 的末端）
4. resolve 前完成上面「欠票券 26 與 `ui-tokens-draft.md` 的回寫」三項

---

## Answer

**2026-09-01 resolve。** 第二個 session 從交接的「待答」接手，走完 Q17–Q22（Q17 中途因新 failure mode 重開為 Q17′），frontier 清空。

### 交付的是規格，不是資產檔

本票交付「照著就能輸出資產」的**可重現規格**。SVG 成品是實作期的產出，不在本票內。

### 一、wordmark（定案）

| 項目 | 值 |
|---|---|
| 字體 | **Source Sans 3**（SIL OFL 1.1） |
| 字重 | **`Scene` 600 ／ `phonie` 400** |
| 大小寫 | sentence case |
| 兩段之間 | 無空隙、無分隔符 |
| 字母形狀 | **未改**（Q6a） |
| 字距 | `letter-spacing: 0` |
| 承載尺寸 | **21px @ 48px header** |
| 交付形式 | **SVG outline**（字母轉路徑） |

### 二、favicon（形式定案，顏色由 neutral 供應）

| 項目 | 值 |
|---|---|
| 形式 | 深色圓角實心容器 ＋ 反白字母 `S` |
| 字體字重 | Source Sans 3 **600** |
| 字級 | **15px @ 16px 容器** |
| 圓角 | **3px**（整數 —— 16px 光柵化下非整數半徑會讓四角吃到半像素灰階） |
| 容器底色 | **票券 26 的 neutral 色階最深階**。⚠️ 這是確定值，**不是佔位色，也不是品牌決定** |

### 三、v1 沒有 brand color（Q22）

承載位置盤點後沒有格子可填：

| 位置 | 需要嗎 | 依據 |
|---|---|---|
| wordmark | 否 | Gate 2 單色測試通過，深底淺底都成立 |
| favicon 容器 | 否 | 實測 C：救回 identity 的是**形式**不是顏色 |
| UI accent | **不得** | 依賴方向反轉 —— accent 是 semantic role，獨立設計 |
| landing page | 不存在 | Q5 |

理由與 Q2（不做中文品牌名）、Q5（不做 tagline）同一條尺：**目前沒有需求證明需要**。三次同尺不是巧合，是 v1 成功標準被[票券 25](./25-deployment-and-hosting.md) 改寫成「作品集＋封閉測試」之後的必然。

**否決的兩條**：把中性深色升格為 brand color —— neutral 是所有角色裡最寬的一個，讓它兼任等於**讓最寬的先佔位**，正面違反 Q10；憑空探索一個有色相的 brand color —— 那是「先設計再找用途」，與 Q21 否掉的理由同一個。

### 四、不新增獨立 mark（Q21）

v1 品牌識別資產**止於 wordmark ＋ favicon**。favicon 的容器屬 **rendering treatment，不是第三個品牌資產**。

➕ **Q15 的判準被說得更精確**：**mark 的定義不是「有沒有幾何形狀」，而是「能不能離開承載位置獨立部署」。** 那個圓角方塊離開 16px 就失去理由 —— 放大到 48px 只是一個沒有來歷的黑方塊。它是 favicon 這個資產的一部分。

Q12 當初把判準寫成「是否**真的缺少**獨立 identity」而非「要不要做一個 mark」，正是為了擋掉「先設計 mark 再替它找用途」。實測答案是**不缺**：wordmark 在 48px header 站得住，favicon 在 tab 列與 Slack 的 `S` 分得開。

### 五、Q1 的最小可用集改變了形狀

`wordmark ／ favicon ／ accent` → **`wordmark ／ favicon`**。

accent **不是被刪掉，是被移交**給票券 26 當 semantic role（依賴方向反轉的後果）。這件事在本票進行中發生，此處明記。

---

## 第二輪的實測（全部可重跑）

素材在 [`../research/assets/ui/draft/`](../research/assets/ui/draft/)，harness 在 `draft/harness/`。

| 檔案 | 測什麼 | 結果 |
|---|---|---|
| `wordmark-v3-sheet.png` | 字級 × 字距，真實 48px header ＋ Gate 2 單色 | 字重分段讀成一個字（Gate 5a 過）。字距 0 最穩 —— 緊排讓兩段黏成一團、疏排削弱「一個字」。19px 反白時 `phonie` 逼近失重下限，23px 開始搶戲（違反票券 26 的不搶戲）→ **21px** |
| `favicon-v3-container.png` | 圓角／字重字級／深淺容器／tab 列情境 | 圓角可用區 **2.5–4.5px**（1.5px 讀成方塊、6px 以上讀成圓形）。字重 400 在 16px 反白偏糊、700 擠掉 `S` 的內白 → **600**。**淺容器在白 tab 上邊界整個消失**，退化回測試 B 的失敗組 → 深容器。tab 列情境**通過**，這是測試 B 真正失敗的那一關 |
| `wordmark-v4-weight-balance.png` | **Gate 5b** —— 分段幅度，含著墨面積客觀量測 | 見下 |

### Gate 的擴充（作者於第二輪補完）

Q17 原本只驗了「讀不讀得成一個字」。作者指出那只證明了 segmentation，**沒有證明兩段的視覺重量平衡** —— 若 `Scene` 明顯重過 `phonie`，會產生「主體＋附屬」的 hierarchy，而那不是產品語意想表達的關係。Gate 5 因此拆成三條：

| | 條件 |
|---|---|
| **5a Segmentation** | 兩段可被感知，但整體仍讀成單一品牌名稱 `Scenephonie` |
| **5b Balance** | 分段不得產生不必要的 `Scene > phonie` 視覺 hierarchy |
| **5c Semantic neutrality** | 只處理名稱本身的結構與辨識度，不得替產品增加能力承諾或 literal concept |

⚠️ 這是 prototype 型票券該有的流程：`設計假設 → 實物測試 → 發現新 failure mode → 收緊驗收條件 → 重新選參數`。**方向（要不要分段）沒有重測**，只重測幅度。

### Gate 5b 的量測結果

在 200px 下光柵化各段、累加 alpha 覆蓋率得著墨面積，除以字母數（`Scene`=5、`phonie`=6）。

| 字重組合 | 比值 | 判讀 |
|---|---|---|
| `600 / 300` | **2.199** | `Scene` 每字母是 `phonie` 的 2.2 倍 —— **5b 失敗**，主從關係是事實不是疑慮 |
| `600 / 350` | 1.628 | 已開始讀成主從 |
| **`600 / 400`** | **1.301** | **唯一同時滿足 5a 與 5b 的一格** ✅ |
| `500 / 400` | 1.151 | 比值最佳，但 44px 檢視下分段**幾乎消失** —— **5a 失敗**。它不是「更平衡的分段」，是「幾乎沒有分段」。且 `Scene` 降到 500 讓整體變輕，靠近 Q16a 已淘汰的「輕量大字」 |
| `600 / 600` 對照組 | 0.976 | 基準線 |

**兩項推翻先前假設的發現：**

1. **對照組比值 ≈ 1** —— 我先前假設「`Scene` 有大寫 `S` 所以天生較重」是**錯的**。同字重下兩段每字母墨量幾乎相等（`0.1301` vs `0.1334`）。字形自帶偏差趨近於零，**比值可以直接讀成 hierarchy 強度**，不必先扣基準線。
2. **5a 與 5b 落在同一條軸（字重差）上，方向相反** —— 沒有兩者都最佳的點，只有取捨點。

⚠️ **儀器限制（已修正並記錄在 harness 內）**：Chrome 的 canvas 2D **不插值 variable 字重軸**，直接寫 `350` 會被吸附回 `300`，量出假數據。修法是用 `FontFace` 把每個字重**各釘成一個獨立 family**。第一版表格的數字（對照組 1.097）因此作廢。

⚠️ **5b 沒有客觀門檻。** 比值的作用是**排序與可重跑**，不是及格線 —— 「1.3 可以、1.63 不行」是判斷，不是量測結果。此處明記，免得該數字日後被當成客觀標準引用。

### 授權（已查證）

**Source Sans 3 為 SIL OFL 1.1**（[primary source](https://raw.githubusercontent.com/adobe-fonts/source-sans/release/LICENSE.md)）。授權原文明確允許 *embed / bundle / modify*，**未對「轉外框」設任何限制** —— 轉外框落在 embed 與 modify 的交集，兩者皆已授權。唯一要避開的是 Reserved Font Name **「Source」**：我們交付的是圖形資產、不是衍生字體，不掛該名稱即不觸及。

### Q18 的交付形式 —— 理由已修正

wordmark 交付 **SVG outline**，不是 runtime CSS 排字。作者修正了我原本的表述：

> **SVG 固定字形幾何與排版結果，不依賴 runtime font loading 或 fallback font。**

**不寫成「所有裝置逐像素相同」** —— 不同 OS／browser／DPR 仍有 rasterization 差異。

**SVG 資產的驗收條件**：無外部 font dependency ／ 不使用 `<text>` 作為 runtime 字形 ／ 無外部圖片 ／ 無 runtime CSS dependency ／ `viewBox` 明確 ／ path 可獨立渲染 ／ 單色狀態仍成立。

➕ 由此確立一條邊界：**wordmark 是 brand asset，不是 UI typography。** 日後要改字距、比例或字重，**不在 CSS runtime 調整**，而是回到 design artifact 階段重新輸出 SVG。

➕ 意外好處：因為交付是 outline，**非標準字重完全免費** —— 不必為了 `400` 多載一個 webfont 字重。Q18 原本的成本論證在這裡反過來變成選項自由度。

### `#D4A017` 的正確地位（作者修正措辭）

**不是**「必須先過的門檻」—— 目前 brand color 不存在，就不存在一個正在等待 WCAG 驗收的受測者。精確的說法是：

> 若未來重新選擇接近 `#D4A017` 的色值作為 brand color，**該色值在實際用途中的對比度必須重新驗證**；`#D4A017` 在白底 **2.38:1** 的結果可作為**既有警示資料**。

---

## 已完成的回寫

| # | 位置 | 改了什麼 |
|---|---|---|
| 1 | `research/ui-tokens-draft.md` §2.1 | accent 不再「取自 brand palette 的 Amber」；記入依賴方向反轉與「v1 沒有 brand color」；**accent 色值歸票券 26** |
| 2 | [票券 26](./26-ui-visual-direction.md) §4 | 「warning 不得與 accent 同色」**規則留下、理由換掉** —— 原理由前提（accent 已知）已失效，改用 Q4 的「語意不在同一層」 |
| 3 | 同上兩處 | 色彩角色 `accent／warning／neutral` → **`accent／draft／error／neutral`**；§2.2 的例外註記一併改為 `draft` |
