# 品牌識別

Type: prototype
Status: open
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
