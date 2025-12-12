**🌐 Language: [English](README_EN.md) | 繁體中文**

# SAM3 標註工具 (SAM3 Annotation Tool)

基於 Meta SAM3 (Segment Anything with Concepts) 的影像標註輔助工具，提供直覺的使用者介面和多種標註方式。

## 安裝與執行

### 系統需求

- Python 3.12+
- Node.js 18+
- CUDA-compatible GPU (建議，用於 SAM3)
- PyTorch 2.7+

### 建議 Docker 部署

```bash
# docker build
docker build -t sam3_annotation .
```

```bash
# 使用 docker-compose 啟動
docker-compose up -d
```
docker compose 會執行start.sh 啟動前後端服務


### (其他) 虛擬環境 - 後端安裝

```bash
# 進入後端目錄
cd backend

# 使用 uv 建立虛擬環境並安裝相依套件
uv venv --python 3.12
uv pip install -r requirements.txt

# 或使用傳統方式
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt

# 安裝 SAM3
git clone https://github.com/facebookresearch/sam3.git
cd sam3
uv pip install -e .
cd ..

# 啟動服務
uv run uvicorn app.main:app --host 0.0.0.0 --port 5341 --reload

# 或指定 GPU 索引
SAM3_GPU_INDEX=1 uv run uvicorn app.main:app --host 0.0.0.0 --port 5341 --reload
```



### 前端安裝

```bash
# 進入前端目錄
cd frontend

# 安裝相依套件
npm install

# 開發模式啟動
npm run dev

# 或建構生產版本
npm run build
npm run preview
```

### 存取應用

開啟瀏覽器，前往 http://localhost:5702

## 功能特點

### 🎯 標註方式

1. **文字標註 (Text Prompt)**
   - 輸入描述性文字，如「紅色汽車」、「穿白衣的人」
   - SAM3 會自動識別並分割符合描述的所有物件

2. **增點/減點標註 (Point Prompts)**
   - **增點 (+)**: 左鍵點擊要分割的物件區域
   - **減點 (-)**: 右鍵點擊不要包含的區域
   - 支援多點組合，精確控制分割結果
   - 即時預覽分割結果，按 Enter 確認

3. **框選標註 (Box Prompt)**
   - 拖曳繪製邊界框
   - 快速選取目標區域

4. **模板比對 (Template Matching)**
   - 選取參考圖片中的物件作為模板
   - 自動在目標圖片中尋找相似物件

5. **手動多邊形標註 (Polygon Tool)** 
   - 當 SAM3 無法使用時的備用方案
   - 手動點擊繪製多邊形頂點
   - 支援動態預覽，點擊起點或按 Enter 閉合

### 🖌️ 精細編輯功能

- **控制點拖曳**: 選中標註後可拖曳邊界控制點調整輪廓
- **雙擊新增控制點**: 在編輯模式下，雙擊邊界線可新增額外的控制點
  - 懸停在邊界線上會顯示綠色 + 提示點
  - 適用於邊界點不足或需要更精確調整的情況
- **固定視覺大小**: 控制點大小不隨畫布縮放變化，始終保持清晰可見

### 🖱️ 畫布操作

- **滑鼠滾輪縮放**: 以滑鼠位置為中心進行縮放
- **中鍵拖曳平移**: 按住滑鼠中鍵（滾輪）可在任何工具模式下拖曳移動畫布
- **指標工具拖曳**: 使用指標工具 (V) 時可拖曳平移畫布

### 📦 輸出格式

- **COCO JSON + 圖片 ZIP**: 完整支援 COCO 標註格式
  - 包含圖片資訊、標註遮罩 (RLE)、邊界框、類別等
  - 導出時自動打包標註 JSON 和所有圖片為 ZIP 檔
  - 可直接用於深度學習訓練

### 💾 自動暫存

- 自動將標註資料暫存到瀏覽器 LocalStorage
- 頁面意外關閉後可恢復未儲存的標註
- 無需手動操作，每 2 秒自動暫存

### 📋 複製貼上與多選

- **複製貼上**: 
  - `Ctrl + C` 複製選中的標註
  - `Ctrl + V` 進入貼上模式，可將標註貼到其他位置或其他圖片
- **多選支援**:
  - `Ctrl/Cmd + 點擊`: 多選個別標註（新增/移除）
  - `Shift + 點擊`: 範圍選擇（類似 Excel，選擇兩點之間的所有標註）
  
### 🏷️ 類別管理

- **快速修改類別**: 標註完成後可透過 Tag 按鈕快速更改類別
- **視覺化標示**: 下拉選單會高亮顯示當前類別
- **即時更新**: 類別更改後標註顏色即時更新

## 快捷鍵

### 工具切換
| 快捷鍵 | 功能 |
|--------|------|
| `V` | 選擇工具（移動/縮放） |
| `+` 或 `=` | 增點工具 |
| `-` | 減點工具 |
| `B` | 框選工具 |
| `T` | 文字提示工具 |
| `M` | 模板比對工具 |
| `P` | 手動多邊形工具 |

### 編輯操作
| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + Z` | 撤銷 |
| `Ctrl + Y` 或 `Ctrl + Shift + Z` | 重做 |
| `Delete` 或 `Backspace` | 刪除選中的標註 |
| `Ctrl + C` | 複製選中的標註 |
| `Ctrl + V` | 貼上標註（進入貼上模式） |

### 選擇操作
| 快捷鍵 | 功能 |
|--------|------|
| `Ctrl + A` | 全選標註 |
| `Ctrl + D` | 取消全選 |
| `Ctrl/Cmd + 點擊` | 多選個別標註（新增/移除） |
| `Shift + 點擊` | 範圍選擇（選擇兩點之間的所有標註） |
| `Escape` | 取消當前操作/清除臨時點 |
| `Enter` 或 `Space` | 確認當前標註 |

### 畫布操作
| 操作 | 功能 |
|--------|------|
| `滑鼠滾輪` | 以滑鼠位置為中心縮放畫布 |
| `滑鼠中鍵拖曳` | 在任何工具模式下拖曳平移畫布 |
| `雙擊邊界線` | 在編輯模式下新增控制點 |

### 類別快速選擇
| 快捷鍵 | 功能 |
|--------|------|
| `1` - `9` | 快速選擇類別 1-9 |

### 其他
| 快捷鍵 | 功能 |
|--------|------|
| `?` 或 `Ctrl + /` | 顯示快捷鍵說明 |



## 專案結構

```
SAM3_annotation/
├── backend/                 # 後端 API 服務
│   ├── app/
│   │   ├── main.py         # FastAPI 主程式
│   │   ├── models/         # Pydantic 模型
│   │   ├── routers/        # API 路由
│   │   └── services/       # SAM3 服務封裝
│   └── requirements.txt
│
├── frontend/               # 前端 React 應用
│   ├── src/
│   │   ├── components/     # React 元件
│   │   ├── hooks/          # 自定義 Hooks
│   │   ├── services/       # API 服務
│   │   ├── store/          # Zustand 狀態管理
│   │   └── types/          # TypeScript 類型定義
│   ├── package.json
│   └── vite.config.ts
│
└── README.md
```

## API 端點

| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/upload` | 上傳圖片 |
| POST | `/api/segment/text` | 文字提示分割 |
| POST | `/api/segment/points` | 點提示分割 |
| POST | `/api/segment/box` | 框選分割 |
| POST | `/api/segment/template` | 模板比對分割 |
| POST | `/api/export/coco` | 導出 COCO JSON |
| POST | `/api/reset/{image_id}` | 重置圖片提示 |

## 使用流程

1. **上傳圖片**: 點擊「上傳」按鈕或拖放圖片
2. **選擇類別**: 在右側面板選擇或新增標註類別
3. **選擇工具**: 使用工具列或快捷鍵選擇標註方式
4. **進行標註**:
   - **文字**: 輸入描述後按 Enter
   - **點擊**: 左鍵增點、右鍵減點，按 Enter 確認
   - **框選**: 拖曳繪製框選區域
   - **多邊形**: 點擊繪製頂點，點擊起點或按 Enter 閉合
5. **精細調整**:
   - 選中標註後拖曳控制點調整邊界
   - 雙擊邊界線新增額外的控制點
   - 使用滑鼠中鍵拖曳移動畫布
6. **管理標註**: 
   - 在右側列表查看、選擇、隱藏或刪除標註
   - 使用 Tag 按鈕快速修改標註類別
   - `Shift + 點擊` 範圍多選標註
7. **複製貼上**: 選中標註後 `Ctrl+C` 複製，`Ctrl+V` 貼到其他位置
8. **導出結果**: 點擊「導出」下載包含 COCO JSON 和圖片的 ZIP 檔案

## 技術棧

### 後端
- **FastAPI**: 高效能 Python Web 框架
- **SAM3**: Meta 最新分割模型
- **PyTorch**: 深度學習框架
- **Pydantic**: 資料驗證

### 前端
- **React 18**: UI 框架
- **TypeScript**: 類型安全
- **Vite**: 快速建構工具
- **Tailwind CSS**: 樣式框架
- **Zustand**: 狀態管理
- **Lucide React**: 圖示庫
- **JSZip**: ZIP 檔案打包

## 授權

本專案使用 MIT 授權。SAM3 模型請參考 [Facebook Research SAM3](https://github.com/facebookresearch/sam3) 的授權條款。

## 參考資料

- [SAM3: Segment Anything with Concepts](https://github.com/facebookresearch/sam3)
- [COCO Dataset Format](https://cocodataset.org/#format-data)
